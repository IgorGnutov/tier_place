// Крок 9 конвеєра: фід товарів для Google Merchant Center → dist/merchant-feed.xml
// (RSS 2.0 з атрибутами простору імен g:, https://support.google.com/merchants/answer/7052112).
//
// ЧОМУ ФІД, А НЕ GOOGLE ТАБЛИЦЯ ЯК ДЖЕРЕЛО ДАНИХ: Merchant Center із таблиці читає лише ПЕРШУ
// вкладку (тобто "Шини", без "Дисків") і лише англійські назви атрибутів — title, link,
// availability, price у форматі "2300 UAH". Колонки нашого прайсу (brand/model/width/in_stock…)
// зроблені під сайт, тож усі товари відхилялись без назви, ціни, посилання й наявності.
//
// Джерело — .build/products.json від generate-product-pages.mjs (крок 5): ті самі slug, назви й
// фото власного домену, що вже записані в dist/. Це не зручність, а вимога: Merchant обходить
// сторінку товару й порівнює ціну/наявність у фіді з JSON-LD Offer на ній — розбіжність дає
// відхилення товарів за невідповідність ціни. Один знімок прайсу на весь білд (крок 2) робить
// розбіжність неможливою.
//
// У Merchant Center: джерело даних "Файл → заплановане завантаження" з URL
// https://tire-place.com.ua/merchant-feed.xml, країна Україна, мова українська. Див. README.md,
// "Google Merchant Center".
import { writeFileSync } from 'node:fs';
import { root, readBuildJson } from './lib/build-dir.mjs';
import { escapeHtml } from '../src/shared/html-escape.mjs';
import { SITE_URL } from '../src/shared/constants.mjs';

const LABEL = 'generate-merchant-feed';

// Товар "під замовлення" (немає на складі, але приймаємо замовлення) — це backorder, а Google
// для backorder вимагає availability_date. Точної дати надходження в прайсі немає, тому
// фіксований строк від моменту білда. Дата не "старіє": deploy.yml перезбирає сайт кожні 6 год.
const BACKORDER_DAYS = 3;

// Обмеження Merchant Center на довжину значень.
const MAX_ID = 50;
const MAX_TITLE = 150;

/** ISO 8601 без мілісекунд — у такому вигляді Google наводить приклади availability_date. */
function isoDate(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Той самий розподіл станів, що в JSON-LD Offer сторінки товару (generate-product-pages.mjs):
 *  InStock / BackOrder / OutOfStock. */
function availabilityOf(product) {
  if (product.inStock) return 'in_stock';
  if (product.onOrder) return 'backorder';
  return 'out_of_stock';
}

function productType(product) {
  const category = product.kind === 'tires' ? 'Шини' : 'Диски';
  const leaf = (product.kind === 'tires' ? product.row.season : product.row.type)?.trim();
  return leaf ? `${category} > ${leaf}` : category;
}

function description(product) {
  const sizePart = product.sizeLine && !product.title.includes(product.sizeLine) ? `, ${product.sizeLine}` : '';
  const specs = product.specs.map((s) => `${s.label}: ${s.value}`).join('; ');
  return `${product.title}${sizePart}. ${specs}. Автомагазин TIRE PLACE, Кривий Ріг.`;
}

/** @param {string} tag @param {unknown} value */
function el(tag, value) {
  return `      <g:${tag}>${escapeHtml(value)}</g:${tag}>\n`;
}

function main() {
  const products = readBuildJson('products.json', 'scripts/generate-product-pages.mjs');
  const backorderDate = isoDate(new Date(Date.now() + BACKORDER_DAYS * 24 * 60 * 60 * 1000));

  const skipped = { noPrice: [], noImage: [] };
  const seenIds = new Set();
  let items = '';
  let count = 0;

  for (const product of products) {
    // price і image_link — обов'язкові атрибути: без них Merchant однаково відхилить товар,
    // тож не засмічуємо діагностику акаунта завідомо невалідними рядками.
    if (product.price === null) {
      skipped.noPrice.push(product.title);
      continue;
    }
    if (!product.ogImageUrl) {
      skipped.noImage.push(product.title);
      continue;
    }

    // id — з колонки "id" прайсу: стабільний, не змінюється при правці назви чи розміру (на
    // відміну від slug). Merchant привʼязує до id історію й статистику товару. Порожній чи
    // повторний id → slug із префіксом каталогу, щоб товар не перезаписав інший.
    let id = product.productId;
    if (!id || seenIds.has(id) || id.length > MAX_ID) {
      const fallback = `${product.kind}-${product.slug}`.slice(0, MAX_ID);
      if (id) console.warn(`${LABEL}: id "${id}" повторюється або задовгий — для "${product.title}" взято "${fallback}".`);
      id = fallback;
    }
    seenIds.add(id);

    const availability = availabilityOf(product);
    items +=
      '    <item>\n' +
      el('id', id) +
      el('title', product.title.slice(0, MAX_TITLE)) +
      el('description', description(product)) +
      el('link', `${SITE_URL}/${product.kind}/${product.slug}/`) +
      el('image_link', product.ogImageUrl) +
      el('availability', availability) +
      (availability === 'backorder' ? el('availability_date', backorderDate) : '') +
      el('price', `${product.price.toFixed(2)} UAH`) +
      el('condition', 'new') +
      (product.brand ? el('brand', product.brand) : '') +
      el('product_type', productType(product)) +
      '    </item>\n';
    count++;
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
    '  <channel>\n' +
    '    <title>TIRE PLACE — шини та диски</title>\n' +
    `    <link>${SITE_URL}/</link>\n` +
    '    <description>Шини та диски в автомагазині TIRE PLACE, Кривий Ріг</description>\n' +
    items +
    '  </channel>\n' +
    '</rss>\n';
  writeFileSync(`${root}dist/merchant-feed.xml`, xml);

  for (const [reason, titles] of Object.entries(skipped)) {
    if (titles.length === 0) continue;
    const what = reason === 'noPrice' ? 'без ціни' : 'без фото';
    console.warn(`${LABEL}: пропущено ${titles.length} товар(ів) ${what}: ${titles.join(', ')}.`);
  }
  console.log(`${LABEL}: у фіді ${count} товарів (dist/merchant-feed.xml).`);
}

try {
  main();
} catch (err) {
  console.error(`${LABEL}: ${err.message}`);
  process.exit(1);
}
