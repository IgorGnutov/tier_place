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
import Papa from 'papaparse';

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

function replaceAttr(source, matchPrefix, value) {
  const re = new RegExp(`(${matchPrefix})[^"]*(")`);
  if (!re.test(source)) throw new Error(`generate-product-pages: pattern not found — ${matchPrefix}`);
  return source.replace(re, `$1${escapeAttr(value)}$2`);
}

function replaceMain(html, mainInnerHtml) {
  const startTag = '<main id="main">';
  const start = html.indexOf(startTag);
  const end = html.indexOf('</main>', start);
  if (start === -1 || end === -1) throw new Error('generate-product-pages: <main id="main"> not found in dist/index.html');
  return html.slice(0, start + startTag.length) + mainInnerHtml + html.slice(end);
}

function buildMainHtml(product) {
  const photoHtml = product.imageUrl
    ? `<img src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.title)}" loading="eager" />`
    : `<div class="product-detail__photo--placeholder">Фото немає</div>`;
  const specsHtml = product.specs.map((s) => `<li>${escapeHtml(s.label)}: ${escapeHtml(s.value)}</li>`).join('');
  const statusClass = product.inStock ? 'status--in' : 'status--out';
  const statusText = product.inStock ? 'В наявності' : 'Немає в наявності';
  const priceText = product.price !== null ? `${product.price.toLocaleString('uk-UA')} грн` : 'Ціна за запитом';
  const backHref = product.kind === 'tires' ? '/#tires' : '/#wheels';
  const productData = JSON.stringify({ key: product.key, title: product.title, sizeLine: product.size, price: product.price });

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

function buildProductPage(product, baseHtml) {
  const pageUrl = `https://tire-place.com.ua/${product.kind}/${product.slug}/`;
  const metaTitle = `${product.title} — купити в TIRE PLACE, Кривий Ріг`;
  const priceLine = product.price !== null ? `${product.price.toLocaleString('uk-UA')} грн` : 'ціна за запитом';
  const metaDescription = `${product.title}, ${product.size} — ${priceLine}. ${
    product.inStock ? 'В наявності' : 'Немає в наявності'
  } в автомагазині TIRE PLACE, Кривий Ріг.`;

  let html = baseHtml;
  html = replaceMain(html, buildMainHtml(product));
  html = html.replace(/<title data-i18n="meta\.title">[^<]*<\/title>/, `<title data-i18n="meta.title">${escapeHtml(metaTitle)}</title>`);
  html = replaceAttr(html, '<meta name="description"[^>]*content="', metaDescription);
  html = replaceAttr(html, '<link rel="canonical" id="canonical-link" href="', pageUrl);
  html = replaceAttr(html, '<meta property="og:title" content="', metaTitle);
  html = replaceAttr(html, '<meta property="og:description" content="', metaDescription);
  html = replaceAttr(html, '<meta property="og:url" id="og-url-meta" content="', pageUrl);
  html = replaceAttr(html, '<meta name="twitter:title" content="', metaTitle);
  html = replaceAttr(html, '<meta name="twitter:description" content="', metaDescription);
  if (product.imageUrl) {
    html = replaceAttr(html, '<meta property="og:image" content="', product.imageUrl);
    html = replaceAttr(html, '<meta name="twitter:image" content="', product.imageUrl);
  }

  // Немає RU-версії сторінки товару (поза межами цієї задачі) — прибираємо hreflang-альтернативи
  // й og:locale:alternate, щоб не посилатись на неіснуючу сторінку.
  html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/>/g, '');
  html = html.replace(/\s*<meta property="og:locale:alternate" content="ru_RU"\s*\/>/, '');

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: product.imageUrl ? [product.imageUrl] : undefined,
    sku: product.slug,
    offers: {
      '@type': 'Offer',
      price: product.price ?? undefined,
      priceCurrency: 'UAH',
      availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: pageUrl,
    },
  };
  html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(productJsonLd)}</script>\n</head>`);

  // Сторінка лежить на 2 рівні глибше dist/index.html — переписуємо відносні шляхи на кореневі
  // (той самий прийом, що вже застосований у generate-ru-html.mjs для /ru/; кореневий шлях
  // резолвиться однаково незалежно від глибини поточної сторінки).
  html = html.replace(/="\.\//g, '="/');
  html = html.replace(/"assets\//g, '"/assets/');
  html = html.replace(/, assets\//g, ', /assets/');

  return html;
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
    key: `wheels:${title}:${size}`,
  };
}

async function loadProducts() {
  const tiresUrl = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.tires);
  const wheelsUrl = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.wheels);

  let tireRows = [];
  let wheelRows = [];
  try {
    tireRows = await fetchCsvRows(tiresUrl);
  } catch (err) {
    console.warn(`generate-product-pages: не вдалося завантажити шини — ${err.message}`);
  }
  try {
    wheelRows = await fetchCsvRows(wheelsUrl);
  } catch (err) {
    console.warn(`generate-product-pages: не вдалося завантажити диски — ${err.message}`);
  }

  const tireSlugs = dedupeSlugs(tireRows, tireSlug);
  const wheelSlugs = dedupeSlugs(wheelRows, wheelSlug);

  return [
    ...tireRows.map((row, i) => ({ ...describeTire(row), kind: 'tires', slug: tireSlugs[i] })),
    ...wheelRows.map((row, i) => ({ ...describeWheel(row), kind: 'wheels', slug: wheelSlugs[i] })),
  ];
}

async function main() {
  const products = await loadProducts();
  if (products.length === 0) {
    console.log('generate-product-pages: немає товарів для генерації сторінок (порожні або недоступні таблиці).');
    return;
  }

  const baseHtml = readFileSync(`${root}/dist/index.html`, 'utf8');
  for (const product of products) {
    const html = buildProductPage(product, baseHtml);
    writeProductPage(product, html, root);
  }
  console.log(`generate-product-pages: згенеровано ${products.length} сторінок товару.`);
}

main();
