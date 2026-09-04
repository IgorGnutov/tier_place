// Постбілд-крок: генерує статичну, індексовану Google сторінку на кожен товар з таблиць
// "Шини"/"Диски" (аналогічно до scripts/generate-ru-html.mjs — той самий приклад: клонуємо
// вже зібраний dist/index.html і патчимо лише потрібні частини, замість рендеру з нуля).
//
// ЛОГІКА ДУБЛЮЄТЬСЯ З КЛІЄНТА (свідомо): slug-формула (src/js/slug.ts) і мапінг
// "рядок CSV → назва/характеристики" (tiresDescribe/wheelsDescribe у
// src/js/render-products.ts) продубльовані тут звичайним JS, бо цей скрипт запускається під
// Node 20 у CI й не може напряму імпортувати .ts. Змінюючи одне з двох місць — оновіть інше.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Papa from 'papaparse';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const sheetIds = JSON.parse(readFileSync(`${root}/src/data/sheet-ids.json`, 'utf8'));

function sheetCsvUrl(spreadsheetId, gid = 0) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

async function fetchCsvRows(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Google на помилку доступу віддає HTML-сторінку логіну/шарингу зі статусом 200 — без цієї
  // перевірки Papa Parse розібрав би її як "рядки товарів" і ми б згенерували сміттєві сторінки.
  // Той самий захист уже є на клієнті (src/js/sheets.ts).
  if (/^\s*<(!doctype html|html)/i.test(clean)) {
    throw new Error('таблиця недоступна — Google повернув HTML замість CSV (перевірте доступ "за посиланням")');
  }
  const parsed = Papa.parse(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  return parsed.data.filter((row) => Object.values(row).some((v) => v !== ''));
}

function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/грн\.?/gi, '').replace(/[\s ]/g, '').replace(',', '.').trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseBool(raw) {
  if (!raw) return false;
  return /^(так|yes|true|1|\+)$/i.test(raw.trim());
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '',
};

function slugify(input) {
  const translit = input.toLowerCase().split('').map((ch) => TRANSLIT[ch] ?? ch).join('');
  return translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

function tireSlug(row) {
  return slugify([row.brand, row.model, row.width, row.profile, row.diameter && `r${row.diameter}`, row.season].filter(Boolean).join('-'));
}

function wheelSlug(row) {
  return slugify(
    [row.brand, row.model, row.diameter && `r${row.diameter}`, row.width && `j${row.width}`, row.pcd && `pcd${row.pcd}`, row.et && `et${row.et}`]
      .filter(Boolean)
      .join('-')
  );
}

function dedupeSlugs(rows, slugOf) {
  const counts = new Map();
  return rows.map((row) => {
    const base = slugOf(row);
    // Порожній slug (усі колонки-ідентифікатори порожні) — не URL: повертаємо '', викликач
    // такий рядок пропускає. Та сама поведінка в src/js/slug.ts.
    if (!base) return '';
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    if (seen > 0) console.warn(`generate-product-pages: колізія slug "${base}" — застосовано суфікс -${seen + 1}`);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

/** Значення підставляється функцією-замінником, а не рядком: у рядку-заміні `$&`, `` $` ``, `$'`,
 *  `$1` мають спеціальне значення, тож назва товару з `$&` зіпсувала б результат. */
function replaceAttr(source, matchPrefix, value) {
  const re = new RegExp(`(${matchPrefix})[^"]*(")`);
  if (!re.test(source)) throw new Error(`generate-product-pages: pattern not found — ${matchPrefix}`);
  const escaped = escapeAttr(value);
  return source.replace(re, (_match, before, after) => `${before}${escaped}${after}`);
}

/** Обов'язкове видалення фрагмента: якщо шаблон не знайдено — це дрейф index.html, і краще
 *  впасти на білді, ніж мовчки залишити на сторінці товару чужий тег. */
function removeAll(source, re, label) {
  if (!re.test(source)) throw new Error(`generate-product-pages: не знайдено для видалення — ${label}`);
  re.lastIndex = 0;
  return source.replace(re, '');
}

// Один блок JSON-LD разом із коментарем-заголовком перед ним (у head вони йдуть саме так).
const JSON_LD_BLOCK_RE = /[ \t]*(?:<!--[^\r\n]*-->[ \t]*\r?\n[ \t]*)?<script type="application\/ld\+json">[\s\S]*?<\/script>[ \t]*\r?\n?/g;

/** Прибирає JSON-LD блоки з переліченими @type. Google очікує, що розмічений контент реально
 *  присутній на сторінці — Service/FAQPage/BreadcrumbList головної на сторінці товару зайві. */
function removeJsonLd(html, types) {
  const removed = new Set();
  const out = html.replace(JSON_LD_BLOCK_RE, (block) => {
    const match = /"@type"\s*:\s*"([^"]+)"/.exec(block);
    if (match && types.includes(match[1])) {
      removed.add(match[1]);
      return '';
    }
    return block;
  });
  for (const type of types) {
    if (!removed.has(type)) throw new Error(`generate-product-pages: JSON-LD блок "${type}" не знайдено в dist/index.html`);
  }
  return out;
}

/** `<` екранується, щоб рядок із таблиці (напр. "</script>") не міг закрити наш <script>. */
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Фото товару — довільні зовнішні URL, вставлені вручну в Google Таблицю (postimg.cc тощо,
// див. CLAUDE.md/.htaccess: img-src навмисно відкритий на будь-який https-хост). Публічні
// image-proxy (wsrv.nl, statically.io) блокують саме postimg.cc/зловживані хости, тож
// стискаємо самі: під час білда качаємо кожне унікальне фото один раз (товари часто ділять
// одну стокову фотографію моделі шини на кілька розмірів) і кодуємо sharp'ом у AVIF/WebP/JPEG
// — ті самі якості, що й в optimize-photos.mjs. Мініатюра (CARD_WIDTH) іде в JSON-маніфест,
// який на клієнті читає product-images.ts для карток каталогу; більший варіант (DETAIL_WIDTH)
// одразу вшивається в статичну сторінку товару нижче. Помилка на одному фото (мертве
// посилання, недоступний хост) НЕ валить білд — товар просто лишається зі старим прямим
// посиланням на оригінал, як до цієї оптимізації.
const CARD_WIDTH = 480;
const DETAIL_WIDTH = 900;
const IMAGE_FORMATS = [
  ['avif', (img) => img.avif({ quality: 55 })],
  ['webp', (img) => img.webp({ quality: 70 })],
  ['jpg', (img) => img.jpeg({ quality: 75, progressive: true, mozjpeg: true })],
];
const IMAGE_FETCH_CONCURRENCY = 6;

async function encodeImageVariant(buffer, hash, width, root) {
  const files = {};
  for (const [format, applyFormat] of IMAGE_FORMATS) {
    const relPath = `assets/products/${hash}-${width}.${format}`;
    const pipeline = applyFormat(sharp(buffer).resize({ width, withoutEnlargement: true }));
    await pipeline.toFile(`${root}/dist/${relPath}`);
    files[format] = `/${relPath}`;
  }
  return files;
}

/** Качає й стискає кожне унікальне фото товару один раз. Повертає Map "оригінальний URL →
 *  набір DETAIL_WIDTH-файлів" (для сторінок товару) і паралельно пише dist/data/product-images.json
 *  з набором CARD_WIDTH-файлів (для карток каталогу на клієнті). */
async function buildProductImageAssets(products, root) {
  const urls = [...new Set(products.map((p) => p.imageUrl).filter(Boolean))];
  const outDir = `${root}/dist/assets/products`;
  mkdirSync(outDir, { recursive: true });

  const cardManifest = {};
  const detailAssets = new Map();

  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buffer).metadata();
        const sourceWidth = meta.width ?? DETAIL_WIDTH;
        const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);

        const cardWidth = Math.min(CARD_WIDTH, sourceWidth);
        const detailWidth = Math.min(DETAIL_WIDTH, sourceWidth);

        const cardFiles = await encodeImageVariant(buffer, hash, cardWidth, root);
        // Джерело вже вужче за DETAIL_WIDTH — не кодуємо той самий розмір вдруге.
        const detailFiles = detailWidth === cardWidth ? cardFiles : await encodeImageVariant(buffer, hash, detailWidth, root);

        cardManifest[url] = cardFiles;
        detailAssets.set(url, detailFiles);
      } catch (err) {
        console.warn(`generate-product-pages: не вдалося оптимізувати фото ${url} — ${err.message}. Товар покаже оригінальне посилання.`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(IMAGE_FETCH_CONCURRENCY, urls.length) }, worker));

  mkdirSync(`${root}/dist/data`, { recursive: true });
  writeFileSync(`${root}/dist/data/product-images.json`, JSON.stringify(cardManifest));

  return detailAssets;
}

function replaceMain(html, mainInnerHtml) {
  const startTag = '<main id="main">';
  const start = html.indexOf(startTag);
  const end = html.indexOf('</main>', start);
  if (start === -1 || end === -1) throw new Error('generate-product-pages: <main id="main"> not found in dist/index.html');
  return html.slice(0, start + startTag.length) + mainInnerHtml + html.slice(end);
}

function buildPhotoHtml(product, imageSet) {
  if (!product.imageUrl) return `<div class="product-detail__photo--placeholder">Фото немає</div>`;
  if (!imageSet) {
    // Оптимізація цього фото не вдалась (buildProductImageAssets) — як і раніше, хотлінк на оригінал.
    return `<img src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.title)}" loading="eager" />`;
  }
  const sources = [
    imageSet.avif && `<source type="image/avif" srcset="${escapeAttr(imageSet.avif)}" />`,
    imageSet.webp && `<source type="image/webp" srcset="${escapeAttr(imageSet.webp)}" />`,
  ]
    .filter(Boolean)
    .join('');
  const fallbackSrc = imageSet.jpg ?? product.imageUrl;
  return `<picture>${sources}<img src="${escapeAttr(fallbackSrc)}" alt="${escapeAttr(product.title)}" loading="eager" /></picture>`;
}

function buildMainHtml(product, imageSet) {
  const photoHtml = buildPhotoHtml(product, imageSet);
  const specsHtml = product.specs.map((s) => `<li>${escapeHtml(s.label)}: ${escapeHtml(s.value)}</li>`).join('');
  const statusClass = product.inStock ? 'status--in' : 'status--out';
  const statusText = product.inStock ? 'В наявності' : 'Немає в наявності';
  const priceText = product.price !== null ? `${product.price.toLocaleString('uk-UA')} грн` : 'Ціна за запитом';
  const backHref = product.kind === 'tires' ? '/#tires' : '/#wheels';
  const productData = jsonForScript({ key: product.key, title: product.title, sizeLine: product.size, price: product.price });

  return `
    <div class="container product-detail">
      <a class="product-detail__back" href="${backHref}">← Назад до каталогу</a>
      <div class="product-detail__grid">
        <div class="product-detail__photo">${photoHtml}</div>
        <div class="product-detail__body">
          <h1 class="product-detail__title">${escapeHtml(product.title)}</h1>
          <ul class="product-detail__specs">${specsHtml}</ul>
          <span class="status ${statusClass}">${statusText}</span>
          <div class="product-detail__footer">
            <span class="product-detail__price">${priceText}</span>
            <button type="button" class="btn" id="product-buy-btn"${product.inStock ? '' : ' disabled'}>Купити</button>
          </div>
        </div>
      </div>
    </div>
    <script type="application/json" id="product-data">${productData}</script>
  `;
}

function buildProductPage(product, baseHtml, imageSet) {
  const pageUrl = `https://tire-place.com.ua/${product.kind}/${product.slug}/`;
  const metaTitle = `${product.title} — купити в TIRE PLACE, Кривий Ріг`;
  const priceLine = product.price !== null ? `${product.price.toLocaleString('uk-UA')} грн` : 'ціна за запитом';
  const metaDescription = `${product.title}, ${product.size} — ${priceLine}. ${
    product.inStock ? 'В наявності' : 'Немає в наявності'
  } в автомагазині TIRE PLACE, Кривий Ріг.`;
  // Соцмережі краще тягнути з власного домену (стабільніше, ніж покладатись, що postimg.cc
  // лишиться доступним для скрапера) — беремо JPEG-варіант, якщо фото вдалось оптимізувати.
  const ogImageUrl = imageSet?.jpg ? `https://tire-place.com.ua${imageSet.jpg}` : product.imageUrl;

  let html = baseHtml;
  html = replaceMain(html, buildMainHtml(product, imageSet));
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, () => `<title>${escapeHtml(metaTitle)}</title>`);
  html = replaceAttr(html, '<meta name="description"[^>]*content="', metaDescription);
  html = replaceAttr(html, '<link rel="canonical" id="canonical-link" href="', pageUrl);
  html = replaceAttr(html, '<meta property="og:title" content="', metaTitle);
  html = replaceAttr(html, '<meta property="og:description" content="', metaDescription);
  html = replaceAttr(html, '<meta property="og:url" id="og-url-meta" content="', pageUrl);
  html = replaceAttr(html, '<meta name="twitter:title" content="', metaTitle);
  html = replaceAttr(html, '<meta name="twitter:description" content="', metaDescription);
  if (ogImageUrl) {
    html = replaceAttr(html, '<meta property="og:image" content="', ogImageUrl);
    html = replaceAttr(html, '<meta name="twitter:image" content="', ogImageUrl);
    // Розміри 1200×900 стосувались фото вивіски з головної — до фото товару вони не підходять.
    html = removeAll(html, /[ \t]*<meta property="og:image:(?:width|height)" content="\d+" \/>[ \t]*\r?\n?/g, 'og:image:width/height');
  }

  // main.js (i18n.ts) під час старту перезаписує #canonical-link/#og-url-meta на URL головної,
  // а applyStaticTranslations() — усі теги з data-i18n/data-i18n-attr="content:meta.*" на
  // RU-рядки головної. Обидва пошуки мають нічого не знайти на сторінці товару, інакше
  // побудовані тут SEO-теги зникають одразу після виконання JS (у DOM, який індексує Google).
  html = removeAll(html, / id="canonical-link"/g, 'id="canonical-link"');
  html = removeAll(html, / id="og-url-meta"/g, 'id="og-url-meta"');
  html = removeAll(html, / data-i18n-attr="content:meta\.[A-Za-z]+"/g, 'data-i18n-attr="content:meta.*"');
  // Перемикач мови: без data-lang-link клік — звичайний перехід за href ("/" або "/ru/"),
  // а не JS-підміна контенту поточної сторінки. RU-версії сторінки товару немає.
  html = removeAll(html, / data-lang-link="(?:uk|ru)"/g, 'data-lang-link');
  html = html.replace('<a href="/" class="lang-switch__link"', () => '<a href="/" class="lang-switch__link is-active"');

  // Немає RU-версії сторінки товару (поза межами цієї задачі) — прибираємо hreflang-альтернативи
  // й og:locale:alternate, щоб не посилатись на неіснуючу сторінку.
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/>/g, '');
  html = html.replace(/\s*<meta property="og:locale:alternate" content="ru_RU"\s*\/>/, '');

  // Preload LCP-фото hero-слайдера: hero на сторінці товару немає (<main> замінено) — це був би
  // зайвий високопріоритетний запит, що конкурує з фото самого товару.
  html = removeAll(
    html,
    /[ \t]*(?:<!--[^\n]*-->[ \t]*\r?\n[ \t]*)?<link\r?\n[ \t]*rel="preload"[\s\S]*?\/>\r?\n?/g,
    '<link rel="preload" as="image">'
  );

  // Service/FAQPage/BreadcrumbList головної описують контент, якого на цій сторінці немає.
  // AutoPartsStore лишається — це загальносайтова інформація про бізнес.
  html = removeJsonLd(html, ['Service', 'FAQPage', 'BreadcrumbList']);

  // Google вимагає price+priceCurrency всередині offers, якщо offers взагалі присутній —
  // рядок без ціни ("ціна за запитом") лишає Product без offers повністю, а не з "поламаним"
  // Offer без price (інакше Rich Results Test і Search Console позначать сторінку як invalid).
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: ogImageUrl ? [ogImageUrl] : undefined,
    sku: product.slug,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    offers:
      product.price !== null
        ? {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'UAH',
            availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: pageUrl,
          }
        : undefined,
  };
  const catalogName = product.kind === 'tires' ? 'Шини' : 'Диски';
  const catalogUrl = `https://tire-place.com.ua/${product.kind === 'tires' ? '#tires' : '#wheels'}`;
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://tire-place.com.ua/' },
      { '@type': 'ListItem', position: 2, name: catalogName, item: catalogUrl },
      { '@type': 'ListItem', position: 3, name: product.title, item: pageUrl },
    ],
  };
  const headScripts =
    `  <script type="application/ld+json">${jsonForScript(productJsonLd)}</script>\n` +
    `  <script type="application/ld+json">${jsonForScript(breadcrumbJsonLd)}</script>\n</head>`;
  html = html.replace('</head>', () => headScripts);

  // Пункти меню/футера ведуть на секції головної — на сторінці товару голий хеш (#tires) нікуди
  // не веде. Кореневий /#tires працює звідусіль; заодно селектор a[data-nav-link][href="#wheels"]
  // з render-products.ts перестає збігатись, тож його preventDefault більше не перехоплює клік.
  html = html.replace(/href="#([a-z-]+)" data-nav-link/g, 'href="/#$1" data-nav-link');

  // Сторінка лежить на 2 рівні глибше dist/index.html — переписуємо відносні шляхи на кореневі
  // (той самий прийом, що вже застосований у generate-ru-html.mjs для /ru/; кореневий шлях
  // резолвиться однаково незалежно від глибини поточної сторінки).
  html = html.replace(/="\.\//g, '="/');
  html = html.replace(/"assets\//g, '"/assets/');
  html = html.replace(/, assets\//g, ', /assets/');

  return { html, ogImageUrl };
}

function writeProductPage(product, html, root) {
  const outDir = `${root}/dist/${product.kind}/${product.slug}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/index.html`, html);
}

function describeTire(row) {
  const price = parsePrice(row.price);
  const title = `${row.brand ?? ''} ${row.model ?? ''} ${row.width}/${row.profile} R${row.diameter}`.trim();
  const size = `${row.width}/${row.profile} R${row.diameter}`;
  const specs = [
    { label: 'Сезон', value: row.season || '—' },
    { label: 'Шипи', value: parseBool(row.studded) ? 'Так' : 'Ні' },
  ];
  if (row.load_index) specs.push({ label: 'Індекс навантаження', value: row.load_index });
  if (row.speed_index) specs.push({ label: 'Індекс швидкості', value: row.speed_index });
  if (row.year) specs.push({ label: 'Рік', value: row.year });
  if (row.country) specs.push({ label: 'Країна', value: row.country });
  return {
    title,
    size,
    specs,
    price,
    inStock: parseBool(row.in_stock),
    imageUrl: row.image_url?.trim() || null,
    brand: row.brand?.trim() || null,
    key: `tires:${title}:${size}`,
  };
}

function describeWheel(row) {
  const price = parsePrice(row.price);
  const title = `${row.brand ?? ''} ${row.model ?? ''} R${row.diameter} J${row.width}`.trim();
  const size = `R${row.diameter} J${row.width} PCD ${row.pcd} ET${row.et}`;
  const specs = [
    { label: 'Тип', value: row.type || '—' },
    { label: 'PCD', value: row.pcd || '—' },
    { label: 'ET', value: row.et || '—' },
    { label: 'DIA', value: row.dia || '—' },
  ];
  if (row.color) specs.push({ label: 'Колір', value: row.color });
  return {
    title,
    size,
    specs,
    price,
    inStock: parseBool(row.in_stock),
    imageUrl: row.image_url?.trim() || null,
    brand: row.brand?.trim() || null,
    key: `wheels:${title}:${size}`,
  };
}

async function loadProducts() {
  const tiresUrl = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.tires);
  const wheelsUrl = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.wheels);

  // Помилка фетчу і "таблиця порожня, але доступна" — різні речі: перше має завалити білд
  // (див. main()), друге лишається валідним станом. Тому збираємо помилки окремо від рядків.
  const errors = [];
  let tireRows = [];
  let wheelRows = [];
  try {
    tireRows = await fetchCsvRows(tiresUrl);
  } catch (err) {
    errors.push(`шини — ${err.message}`);
  }
  try {
    wheelRows = await fetchCsvRows(wheelsUrl);
  } catch (err) {
    errors.push(`диски — ${err.message}`);
  }

  const tireSlugs = dedupeSlugs(tireRows, tireSlug);
  const wheelSlugs = dedupeSlugs(wheelRows, wheelSlug);

  const products = [
    ...tireRows.map((row, i) => ({ ...describeTire(row), kind: 'tires', slug: tireSlugs[i] })),
    ...wheelRows.map((row, i) => ({ ...describeWheel(row), kind: 'wheels', slug: wheelSlugs[i] })),
  ].filter((product) => {
    // Порожній slug = усі колонки-ідентифікатори рядка порожні. Такий товар дав би URL
    // "/tires//" і перезаписав би dist/tires/index.html — пропускаємо повністю.
    if (!product.slug) {
      console.warn(`generate-product-pages: пропущено рядок без назви/розміру ("${product.title}") — порожній slug.`);
      return false;
    }
    return true;
  });

  return { products, errors };
}

function writeSitemap(products, root) {
  const today = new Date().toISOString().slice(0, 10);
  const sitemapPath = `${root}/dist/sitemap.xml`;
  const base = readFileSync(sitemapPath, 'utf8');
  const productEntries = products
    .map((p) => {
      // image:image допомагає індексуванню фото товару в Google Images окремо від Web Search —
      // беремо той самий ownDomain-URL, що вже пішов у og:image (не хотлінк на postimg.cc).
      const imageTag = p.ogImageUrl
        ? `\n    <image:image>\n      <image:loc>${escapeAttr(p.ogImageUrl)}</image:loc>\n    </image:image>`
        : '';
      return `  <url>\n    <loc>https://tire-place.com.ua/${p.kind}/${p.slug}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>${imageTag}\n  </url>`;
    })
    .join('\n');
  const xml = base.replace('</urlset>', `${productEntries}\n</urlset>`);
  writeFileSync(sitemapPath, xml);
}

async function main() {
  const { products, errors } = await loadProducts();

  // Деплой (SamKirkland/FTP-Deploy-Action) синхронізує dist/ з видаленням зайвого на сервері:
  // "успішний" білд без сторінок товару стер би з живого сайту всі вже опубліковані сторінки.
  // Тому будь-яка помилка завантаження таблиці — фатальна, і саме ДО запису будь-яких файлів:
  // білд падає, деплой не запускається, на сервері лишається попередня робоча версія.
  if (errors.length > 0) {
    throw new Error(`не вдалося завантажити дані таблиці (${errors.join('; ')}) — білд зупинено, щоб деплой не стер уже опубліковані сторінки товару.`);
  }

  if (products.length === 0) {
    // Порожня, але доступна таблиця — валідний стан (так само трактує це клієнтський loadCsv).
    console.log('generate-product-pages: немає товарів для генерації сторінок (таблиці доступні, але порожні).');
    return;
  }

  const baseHtml = readFileSync(`${root}/dist/index.html`, 'utf8');
  const detailImageAssets = await buildProductImageAssets(products, root);
  for (const product of products) {
    const imageSet = product.imageUrl ? detailImageAssets.get(product.imageUrl) : undefined;
    const { html, ogImageUrl } = buildProductPage(product, baseHtml, imageSet);
    product.ogImageUrl = ogImageUrl;
    writeProductPage(product, html, root);
  }
  writeSitemap(products, root);
  console.log(`generate-product-pages: згенеровано ${products.length} сторінок товару.`);
}

main().catch((err) => {
  console.error(`generate-product-pages: ${err.message}`);
  process.exit(1);
});
