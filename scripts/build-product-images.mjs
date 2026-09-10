// Крок 3 конвеєра: локальні оптимізовані копії фото товару.
//
// Фото товару — довільні зовнішні URL, вставлені вручну в Google Таблицю (postimg.cc тощо,
// див. CLAUDE.md/.htaccess: img-src навмисно відкритий на будь-який https-хост). Публічні
// image-proxy (wsrv.nl/images.weserv.nl, statically.io) блокують саме postimg.cc за політикою
// або взагалі вимкнули свій proxy-ендпоінт, тож стискаємо самі: качаємо кожне УНІКАЛЬНЕ фото
// один раз (товари часто ділять одну стокову фотографію моделі на кілька розмірів) і кодуємо
// sharp'ом у AVIF/WebP/JPEG — ті самі якості, що в optimize-photos.mjs.
//
// Два розміри:
//   CARD_WIDTH (480)   → dist/data/product-images.json — маніфест, який на клієнті читає
//                        product-images.ts для карток каталогу
//   DETAIL_WIDTH (900) → .build/images.json (detail) — вшивається в статичну сторінку товару
//                        і йде в og:image/twitter:image/JSON-LD image, щоб соцскрапери не
//                        залежали від доступності postimg.cc
//
// Джерело вужче за цільову ширину не збільшується (обидва розміри згортаються в один набір).
// Помилка на одному фото (мертве посилання, недоступний хост, непідтримуваний формат) НЕ
// валить білд — товар просто лишається з прямим посиланням на оригінал, як до цієї оптимізації.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { root, readBuildJson, writeBuildJson } from './lib/build-dir.mjs';

const CARD_WIDTH = 480;
const DETAIL_WIDTH = 900;
const IMAGE_FORMATS = [
  ['avif', (img) => img.avif({ quality: 55 })],
  ['webp', (img) => img.webp({ quality: 70 })],
  ['jpg', (img) => img.jpeg({ quality: 75, progressive: true, mozjpeg: true })],
];
const IMAGE_FETCH_CONCURRENCY = 6;
// postimg.cc віддає той самий файл то за півсекунди, то за 40-60 (холодний edge-кеш на їхньому
// боці, від нас не залежить). Без таймауту одне таке фото тримало воркер, скільки завгодно, а
// потім лишалось без оптимізованої копії — товар назавжди вантажив повільний оригінал. Тому
// обриваємо повільну спробу і пробуємо ще: наступна спроба зазвичай застає кеш уже прогрітим.
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const IMAGE_FETCH_ATTEMPTS = 3;
const IMAGE_FETCH_RETRY_DELAY_MS = 3_000;

async function fetchImageBuffer(url) {
  let lastError;
  for (let attempt = 1; attempt <= IMAGE_FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt < IMAGE_FETCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, IMAGE_FETCH_RETRY_DELAY_MS));
      }
    }
  }
  throw lastError;
}

// Оригінали фото кешуються МІЖ білдами (actions/cache у .github/workflows/deploy.yml). Це не
// оптимізація швидкості, а умова того, щоб фото не зникало: dist/ щоразу збирається з нуля й
// деплоїться з видаленням, тож фото, яке саме в цьому білді не встигло завантажитись, губило
// локальну копію на хостингу — навіть якщо попередній білд її вже поклав. З кешем із postimg
// качаються лише нові посилання, а раз завантажене фото лишається назавжди.
const cacheDir = `${root}.image-cache`;

async function loadOriginal(url, hash) {
  const cachedPath = `${cacheDir}/${hash}`;
  if (existsSync(cachedPath)) return readFileSync(cachedPath);
  const buffer = await fetchImageBuffer(url);
  writeFileSync(cachedPath, buffer);
  return buffer;
}

async function encodeImageVariant(buffer, hash, width) {
  const files = {};
  for (const [format, applyFormat] of IMAGE_FORMATS) {
    const relPath = `assets/products/${hash}-${width}.${format}`;
    await applyFormat(sharp(buffer).resize({ width, withoutEnlargement: true })).toFile(`${root}dist/${relPath}`);
    files[format] = `/${relPath}`;
  }
  return files;
}

async function main() {
  const data = readBuildJson('data.json', 'scripts/fetch-data.mjs');
  const urls = [
    ...new Set(
      [...data.tires, ...data.wheels].map((row) => row.image_url?.trim()).filter(Boolean)
    ),
  ];

  mkdirSync(`${root}dist/assets/products`, { recursive: true });
  mkdirSync(cacheDir, { recursive: true });

  /** @type {Record<string, Record<string, string>>} */
  const card = {};
  /** @type {Record<string, Record<string, string>>} */
  const detail = {};
  let failed = 0;

  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
      try {
        const buffer = await loadOriginal(url, hash);
        const meta = await sharp(buffer).metadata();
        const sourceWidth = meta.width ?? DETAIL_WIDTH;

        const cardWidth = Math.min(CARD_WIDTH, sourceWidth);
        const detailWidth = Math.min(DETAIL_WIDTH, sourceWidth);

        const cardFiles = await encodeImageVariant(buffer, hash, cardWidth);
        // Джерело вже вужче за DETAIL_WIDTH — не кодуємо той самий розмір вдруге.
        const detailFiles = detailWidth === cardWidth ? cardFiles : await encodeImageVariant(buffer, hash, detailWidth);

        card[url] = cardFiles;
        detail[url] = detailFiles;
      } catch (err) {
        failed++;
        console.warn(
          `build-product-images: не вдалося оптимізувати фото ${url} — ${err.message}. Товар покаже оригінальне посилання.`
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(IMAGE_FETCH_CONCURRENCY, urls.length) }, worker));

  mkdirSync(`${root}dist/data`, { recursive: true });
  writeFileSync(`${root}dist/data/product-images.json`, JSON.stringify(card));
  writeBuildJson('images.json', { card, detail });

  console.log(`build-product-images: оптимізовано ${urls.length - failed} з ${urls.length} унікальних фото.`);
}

main().catch((err) => {
  console.error(`build-product-images: ${err.message}`);
  // Не process.exit(1): див. коментар у scripts/fetch-data.mjs — примусовий вихід із
  // незакритими сокетами undici валить Node на Windows замість чистого коду 1.
  process.exitCode = 1;
});
