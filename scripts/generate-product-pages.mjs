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
  console.log(`generate-product-pages: знайдено ${products.length} товар(ів):`);
  for (const p of products) {
    console.log(`  /${p.kind}/${p.slug}/ — ${p.title} — ${p.price ?? 'ціна за запитом'}`);
  }
}

main();
