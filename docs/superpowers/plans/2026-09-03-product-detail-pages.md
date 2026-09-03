# Indexable Product Detail Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every tire/wheel row from the Google Sheets catalog its own static, Google-indexable
URL (`/tires/<slug>/`, `/wheels/<slug>/`) showing photo, title, specs, price and a working "Купити"
button, generated at build time — plus a manual "rebuild now" trigger in `/admin`.

**Architecture:** A post-build Node script (`scripts/generate-product-pages.mjs`) fetches the same
Google Sheets CSV the client uses, computes a stable slug per row, clones the already-built
`dist/index.html` per product (patching only `<head>` SEO tags and the `<main id="main">` content),
and rewrites asset paths to root-absolute — the same technique the repo already uses for
`dist/ru/index.html`. Catalog cards link to these pages client-side. Freshness comes from a
GitHub Actions `schedule` trigger plus an on-demand "Оновити товари зараз" button in `/admin` that
dispatches the existing `workflow_dispatch` via the Apps Script backend.

**Tech Stack:** Vite + vanilla TypeScript, Papa Parse (CSV), plain Node ESM scripts (no bundler at
build-script level, matching `scripts/generate-ru-html.mjs`/`scripts/optimize-photos.mjs`), Google
Apps Script (`admin/apps-script/Code.gs`), GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-09-03-product-detail-pages-design.md](../specs/2026-09-03-product-detail-pages-design.md)

## Global Constraints

- Primary language for UI copy and code comments is Ukrainian — match existing files (per `CLAUDE.md`).
- No test framework or linter is configured in this repo — `npm run typecheck` is the only
  automated check. Every task below verifies with `npm run typecheck`, a manual script run, or
  `npm run build && npm run preview` inspection instead of unit tests — do not add a test framework.
- `src/config.ts` stays the single place a human edits sheet URLs/IDs (per `CLAUDE.md`) — the new
  `src/data/sheet-ids.json` holds the raw IDs, `config.ts` still builds the final URLs.
- The `.mjs` build scripts run under Node 20 in CI (`.github/workflows/deploy.yml` pins
  `node-version: 20`) and cannot import `.ts` files directly — logic shared with client TypeScript
  (slug formula, CSV row → title/specs mapping) is intentionally duplicated in plain JS, per the
  spec's documented trade-off. Keep both copies in sync when editing either.
- Product detail pages are Ukrainian-only (no `/ru/` variant) — this is explicitly out of scope
  per the spec.

---

## Task 1: Extract Google Sheet IDs into shared JSON, refactor `config.ts`

**Files:**
- Create: `src/data/sheet-ids.json`
- Modify: `src/config.ts:1-18`

**Interfaces:**
- Produces: `src/data/sheet-ids.json` shape `{ "spreadsheetId": string, "gids": { "tires": number, "wheels": number, "content": number } }`, consumed by Task 3's build script (as plain JSON via `JSON.parse(readFileSync(...))`, not a TS import).

- [ ] **Step 1: Create `src/data/sheet-ids.json` with the current IDs**

```json
{
  "spreadsheetId": "1lughMmzLw0Ve_Ftwy6MUvlBiP9bVEIV8V41ojxKq2u0",
  "gids": {
    "tires": 0,
    "wheels": 1073589868,
    "content": 383695862
  }
}
```

- [ ] **Step 2: Update `src/config.ts` to build URLs from this JSON**

Replace lines 1–18 of `src/config.ts` (everything up to and including the `SHEET_CONTENT_CSV`/`LOCAL_CONTENT_CSV` exports) with:

```ts
// Єдине місце з посиланнями на джерела даних і контактною інформацією.
// Якщо SHEET_*_CSV порожній рядок — сайт автоматично бере демо-дані з /data/*.csv.
// Самі spreadsheetId/gid зберігаються в src/data/sheet-ids.json — той самий файл читає
// й scripts/generate-product-pages.mjs (build-скрипт не може імпортувати цей .ts напряму).
import sheetIds from './data/sheet-ids.json';

function sheetCsvUrl(spreadsheetId: string, gid = 0): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export const SHEET_TIRES_CSV = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.tires);
export const SHEET_WHEELS_CSV = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.wheels);

// Локальні демо-CSV як фолбек, якщо посилання вище порожнє або таблиця недоступна.
export const LOCAL_TIRES_CSV = 'data/tires.csv';
export const LOCAL_WHEELS_CSV = 'data/wheels.csv';

// Лист "Контент" — тексти, редаговані через /admin. Порожній рядок — адмінка ще не налаштована,
// сайт показує тексти, захардкоджені прямо в index.html.
export const SHEET_CONTENT_CSV = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.content);
export const LOCAL_CONTENT_CSV = 'data/content.csv';
```

Leave the rest of the file (`CONTENT_API_URL`, `SHEET_CACHE_TTL_MS`, `GA_MEASUREMENT_ID`, `MAP_PLACE_URL`, `CONTACTS`, `buildTelegramLink`) untouched.

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors (confirms `resolveJsonModule` picks up the new JSON import cleanly — it's already `true` in `tsconfig.json`).

Run: `npm run dev`, open the homepage, confirm the tires/wheels catalog still loads rows (Network tab shows the same `export?format=csv&gid=...` URLs as before).

- [ ] **Step 4: Commit**

```bash
git add src/data/sheet-ids.json src/config.ts
git commit -m "Extract Google Sheet IDs into shared JSON for build-script reuse"
```

---

## Task 2: Slug generation + link catalog cards to detail pages

**Files:**
- Create: `src/js/slug.ts`
- Modify: `src/js/render-products.ts:26-38` (CardInfo), `:68-142` (renderCard), `:162-208` (initCatalog rows setup), `:333-374` (tiresDescribe/wheelsDescribe)
- Modify: `src/styles/products.css` (append `.product-card__link` rule)

**Interfaces:**
- Produces: `slugify(input: string): string`, `tireSlug(row: CsvRow): string`, `wheelSlug(row: CsvRow): string`, `dedupeSlugs<T>(rows: T[], slugOf: (row: T) => string): string[]` — all pure, no DOM/i18n deps. Consumed by `render-products.ts` here, and mirrored in plain JS by Task 3's build script.
- Consumes: `CsvRow` type from `./csv` (type-only import).

- [ ] **Step 1: Create `src/js/slug.ts`**

```ts
// Генерація URL-slug для сторінки товару з існуючих колонок CSV (без зміни таблиці).
// Та сама формула продубльована в scripts/generate-product-pages.mjs звичайним JS — це
// скрипт для Node 20 у CI, який не може імпортувати .ts. Змінюючи формулу тут, оновіть і там.
import type { CsvRow } from './csv';

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '',
};

export function slugify(input: string): string {
  const translit = input
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
  return translit
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function tireSlug(row: CsvRow): string {
  const parts = [row.brand, row.model, row.width, row.profile, row.diameter && `r${row.diameter}`, row.season];
  return slugify(parts.filter(Boolean).join('-'));
}

export function wheelSlug(row: CsvRow): string {
  const parts = [
    row.brand,
    row.model,
    row.diameter && `r${row.diameter}`,
    row.width && `j${row.width}`,
    row.pcd && `pcd${row.pcd}`,
    row.et && `et${row.et}`,
  ];
  return slugify(parts.filter(Boolean).join('-'));
}

/** Дедуплікація slug-ів у межах одного каталогу — колізії отримують суфікс -2, -3... за порядком рядків. */
export function dedupeSlugs<T>(rows: T[], slugOf: (row: T) => string): string[] {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const base = slugOf(row);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    if (seen > 0) console.warn(`slug: колізія "${base}" — застосовано суфікс -${seen + 1}`);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}
```

- [ ] **Step 2: Verify the pure function manually before wiring it in**

Run: `node -e "const s = require('child_process'); console.log('manual check next')"` — skip; instead run:

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: no errors (this compiles `slug.ts` along with the rest of `src/`, since `tsconfig.json` includes `src`).

- [ ] **Step 3: Add `detailUrl` to `CardInfo` and compute it in `initCatalog`**

In `src/js/render-products.ts`, add the import at the top (near the other `./` imports):

```ts
import { dedupeSlugs, tireSlug, wheelSlug } from './slug';
```

In the `CardInfo` interface (currently lines 26–38), add one field after `key`:

```ts
  /** Абсолютний шлях на статичну сторінку товару, напр. "/tires/continental-.../" */
  detailUrl: string;
```

In `initCatalog`, right after `const rows = result.rows;` (currently around line 200), add:

```ts
  const slugOf = idPrefix === 'tires' ? tireSlug : wheelSlug;
  dedupeSlugs(rows, slugOf).forEach((slug, i) => {
    rows[i].__detailUrl = `/${idPrefix}/${slug}/`;
  });
```

`CsvRow` is `Record<string, string>`, so assigning an extra `__detailUrl` string key type-checks without casting — it's read back the same way `row.image_url` already is.

- [ ] **Step 4: Read `__detailUrl` in both `describe` functions**

In `tiresDescribe` (currently lines 333–353), add to the returned object:

```ts
    detailUrl: row.__detailUrl ?? '',
```

Do the same in `wheelsDescribe` (currently lines 355–374).

- [ ] **Step 5: Wrap the card's photo + title in a link, in `renderCard`**

Replace the top of `renderCard` (currently lines 68–96, from `function renderCard` through the closing of the title block) with:

```ts
function renderCard(info: CardInfo): HTMLElement {
  const card = document.createElement('article');
  card.className = 'product-card';

  const link = document.createElement('a');
  link.className = 'product-card__link';
  link.href = info.detailUrl;

  if (info.imageUrl !== undefined) {
    const photo = document.createElement('div');
    photo.className = 'product-card__photo';
    if (info.imageUrl) {
      const img = document.createElement('img');
      img.src = info.imageUrl;
      img.alt = info.title;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        photo.innerHTML = '';
        photo.classList.add('product-card__photo--placeholder');
      });
      photo.appendChild(img);
    } else {
      photo.classList.add('product-card__photo--placeholder');
    }
    link.appendChild(photo);
  }

  const title = document.createElement('h3');
  title.className = 'product-card__title';
  title.textContent = info.title;
  link.appendChild(title);

  card.appendChild(link);
```

The rest of `renderCard` (specs list, status span, footer with price/buy button) stays exactly as-is — those still append to `card`, not `link`.

- [ ] **Step 6: Add the `.product-card__link` CSS rule**

Append to `src/styles/products.css`:

```css
/* Обгортка фото+назви картки посиланням на сторінку товару — не повинна ламати існуючий layout. */
.product-card__link {
  display: contents;
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run dev`, open the homepage, open the tires catalog, inspect a product card in DevTools.
Expected: the card's photo/title are inside an `<a href="/tires/<slug>/">`, layout unchanged from before, clicking it navigates to `/tires/<slug>/` (a 404 is expected at this point — the page doesn't exist until Task 4 — that's fine for this step).

- [ ] **Step 8: Commit**

```bash
git add src/js/slug.ts src/js/render-products.ts src/styles/products.css
git commit -m "Link catalog cards to per-product detail page URLs"
```

---

## Task 3: Build-script data layer — fetch, slug, describe (no HTML yet)

**Files:**
- Create: `scripts/generate-product-pages.mjs`

**Interfaces:**
- Produces (internal to this script, extended in Task 4): `sheetCsvUrl`, `fetchCsvRows`, `parsePrice`, `parseBool`, `slugify`, `tireSlug`, `wheelSlug`, `dedupeSlugs`, `describeTire`, `describeWheel`, and a `main()` that currently only logs results.

- [ ] **Step 1: Create the script with data-layer functions and a smoke-test `main()`**

```js
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
```

- [ ] **Step 2: Run it standalone and verify the output**

Run: `node scripts/generate-product-pages.mjs`
Expected: either a list of `/tires/<slug>/ — <title> — <price>` / `/wheels/<slug>/ — ...` lines matching what's currently in the live Google Sheets (cross-check count against what the homepage catalog shows in the browser), or the "немає товарів" message if the sheets are still empty demo placeholders — both are valid outcomes at this step, since this task doesn't write any files yet.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-product-pages.mjs
git commit -m "Add data layer (fetch/slug/describe) for product page generator"
```

---

## Task 4: Generate the static product-detail HTML pages

**Files:**
- Modify: `scripts/generate-product-pages.mjs` (extend `main()`, add HTML assembly functions)

**Interfaces:**
- Consumes: `dist/index.html` (must exist — this script runs after `vite build` in the real pipeline; for manual testing in this task, run `npm run build` with the `vite build` step only, or the full `npm run build` once Task 7 wires this script in).
- Produces: `dist/<kind>/<slug>/index.html` per product, containing `<button id="product-buy-btn">` and `<script type="application/json" id="product-data">` — consumed by Task 5's client JS.

- [ ] **Step 1: Add escaping and meta-patching helpers**

Add above `describeTire`:

```js
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
```

- [ ] **Step 2: Add the product `<main>` markup builder**

```js
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
```

- [ ] **Step 3: Add the full-page builder + writer**

```js
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
```

- [ ] **Step 4: Wire it into `main()`**

Replace the body of `main()` from Step 1 of Task 3 with:

```js
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
```

- [ ] **Step 5: Verify end-to-end (manual, before it's wired into `npm run build`)**

Run: `npm run build` (this still only runs `vite build && node scripts/generate-ru-html.mjs` at this point — Task 7 adds this script to the chain), then run:

```bash
node scripts/generate-product-pages.mjs
```

Expected console output: `generate-product-pages: згенеровано N сторінок товару.`

Then inspect one generated file:

```bash
cat "dist/tires/<a-real-slug-from-the-console-output>/index.html"
```

Expected: a full HTML document with the site's real header/footer, a `<main>` containing the product's title/specs/price/"Купити" button, a `<title>` and `og:title` matching the product, a `<script type="application/ld+json">` with `@type: "Product"`, and every asset path starting with `/assets/` (not `./assets/` or bare `assets/`).

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-product-pages.mjs
git commit -m "Generate static per-product HTML pages with SEO tags and JSON-LD"
```

---

## Task 5: Wire up the "Купити" button on product detail pages

**Files:**
- Modify: `src/js/render-products.ts` (add new exported function, near the bottom of the file)
- Modify: `src/main.ts:1-40`

**Interfaces:**
- Produces: `initProductBuyButton(): void`, exported from `render-products.ts`, called once from `main.ts`. No-ops if `#product-data`/`#product-buy-btn` are absent (i.e., on every page except a generated product page).
- Consumes: `#product-data` (`<script type="application/json">` with `{key, title, sizeLine, price}`, written by Task 4's generator) and `#product-buy-btn` (written by the same generator), `addItem` from `./cart`, `showToast` from `./telegram`, `t` from `./i18n`.

- [ ] **Step 1: Add `initProductBuyButton` to `render-products.ts`**

Append at the end of `src/js/render-products.ts`:

```ts
/** Кнопка "Купити" на статичній сторінці товару (generate-product-pages.mjs). No-op на будь-якій
 *  іншій сторінці, де #product-data/#product-buy-btn відсутні — картка каталогу має свою окрему
 *  логіку в renderCard(). */
export function initProductBuyButton(): void {
  const dataEl = document.getElementById('product-data');
  const buyBtn = document.getElementById('product-buy-btn') as HTMLButtonElement | null;
  if (!dataEl || !buyBtn) return;

  let product: { key: string; title: string; sizeLine: string; price: number | null };
  try {
    product = JSON.parse(dataEl.textContent ?? '{}');
  } catch {
    return;
  }

  buyBtn.addEventListener('click', () => {
    if (buyBtn.disabled) return;
    addItem({ key: product.key, title: product.title, sizeLine: product.sizeLine, price: product.price });
    showToast(t('product.addedToCart', 'Додано в кошик'));
  });
}
```

- [ ] **Step 2: Call it from `main.ts`**

In `src/main.ts`, add `initProductBuyButton` to the existing import from `./js/render-products`:

```ts
import { initCatalogs, initCatalogTabs, initProductBuyButton } from './js/render-products';
```

And add a call near the other `init*()` calls at the bottom:

```ts
initProductBuyButton();
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build && node scripts/generate-product-pages.mjs && npm run preview`, open a generated product URL (e.g. `http://localhost:4173/tires/<slug>/`), click "Купити".
Expected: a "Додано в кошик" toast appears, the header cart badge increments, and opening the cart drawer shows the item with the right title/size/price.

- [ ] **Step 4: Commit**

```bash
git add src/js/render-products.ts src/main.ts
git commit -m "Wire the Купити button on generated product detail pages to the cart"
```

---

## Task 6: Regenerate `dist/sitemap.xml` with product URLs

**Files:**
- Modify: `scripts/generate-product-pages.mjs` (add `writeSitemap`, call it from `main()`)

**Interfaces:**
- Consumes: `dist/sitemap.xml` (already present at this point — `vite build` copies `public/sitemap.xml` there verbatim before this script runs).

- [ ] **Step 1: Add the sitemap writer**

```js
function writeSitemap(products, root) {
  const today = new Date().toISOString().slice(0, 10);
  const sitemapPath = `${root}/dist/sitemap.xml`;
  const base = readFileSync(sitemapPath, 'utf8');
  const productEntries = products
    .map(
      (p) =>
        `  <url>\n    <loc>https://tire-place.com.ua/${p.kind}/${p.slug}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`
    )
    .join('\n');
  const xml = base.replace('</urlset>', `${productEntries}\n</urlset>`);
  writeFileSync(sitemapPath, xml);
}
```

- [ ] **Step 2: Call it at the end of `main()`**

Add right after the `for (const product of products)` loop in `main()`, before the `console.log('generate-product-pages: згенеровано...')` line:

```js
  writeSitemap(products, root);
```

- [ ] **Step 3: Verify**

Run: `npm run build && node scripts/generate-product-pages.mjs`, then:

```bash
grep -c "<url>" dist/sitemap.xml
```

Expected: `2 + N` (the 2 static entries already in `public/sitemap.xml`, plus one per generated product — cross-check `N` against the `generate-product-pages: згенеровано N сторінок товару.` line printed just before).

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-product-pages.mjs
git commit -m "Append generated product URLs to dist/sitemap.xml"
```

---

## Task 7: Wire the generator into `npm run build`

**Files:**
- Modify: `package.json:9`

**Interfaces:**
- None (pipeline wiring only).

- [ ] **Step 1: Update the build script**

In `package.json`, change:

```json
    "build": "vite build && node scripts/generate-ru-html.mjs",
```

to:

```json
    "build": "vite build && node scripts/generate-ru-html.mjs && node scripts/generate-product-pages.mjs",
```

- [ ] **Step 2: Verify the full pipeline from a clean `dist/`**

Run:

```bash
rm -rf dist
npm run build
```

Expected: no errors; console shows both `generate-ru-html: dist/ru/index.html generated` and `generate-product-pages: згенеровано N сторінок товару.`; `dist/` contains `ru/index.html`, `tires/<slug>/index.html` for every tire, `wheels/<slug>/index.html` for every wheel, and an updated `sitemap.xml`.

Run: `npm run preview`, click through 2–3 product links from the homepage catalog, confirm each opens its detail page correctly (not a 404).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Generate product detail pages as part of npm run build"
```

---

## Task 8: Product detail page styling

**Files:**
- Create: `src/styles/product-detail.css`
- Modify: `src/styles/main.css:11` (append import)

**Interfaces:**
- Consumes: CSS custom properties from `src/styles/variables.css` (`--space-*`, `--color-*`, `--radius-*`, `--font-*`, `--fs-*`) and existing shared classes `.status`/`.status--in`/`.status--out`/`.btn` (already defined in other files under `src/styles/`).
- Styles the exact class names emitted by Task 4's `buildMainHtml`: `.product-detail`, `.product-detail__back`, `.product-detail__grid`, `.product-detail__photo`, `.product-detail__photo--placeholder`, `.product-detail__body`, `.product-detail__title`, `.product-detail__specs`, `.product-detail__footer`, `.product-detail__price`.

- [ ] **Step 1: Create `src/styles/product-detail.css`**

```css
/* Сторінка товару (шини/диски) — розмітку генерує scripts/generate-product-pages.mjs під час білда. */
.product-detail {
  padding: var(--space-xl) 0;
}

.product-detail__back {
  display: inline-block;
  margin-bottom: var(--space-md);
  color: var(--color-text-muted);
  text-decoration: none;
}

.product-detail__back:hover {
  color: var(--color-accent);
}

.product-detail__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-lg);
}

@media (min-width: 768px) {
  .product-detail__grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}

.product-detail__photo {
  background: var(--color-bg-raised);
  border-radius: var(--radius-lg);
  overflow: hidden;
  aspect-ratio: 4 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-detail__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-detail__photo--placeholder {
  color: var(--color-text-muted);
  font-size: var(--fs-small);
}

.product-detail__title {
  font-family: var(--font-heading);
  font-size: var(--fs-h2);
  margin: 0 0 var(--space-sm);
}

.product-detail__specs {
  list-style: none;
  margin: 0 0 var(--space-md);
  padding: 0;
  display: grid;
  gap: var(--space-xs);
  color: var(--color-text-muted);
}

.product-detail__footer {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.product-detail__price {
  font-family: var(--font-heading);
  font-size: var(--fs-h3);
  color: var(--color-accent);
}
```

- [ ] **Step 2: Import it in `main.css`**

Append to `src/styles/main.css` (after `@import './cart.css';`):

```css
@import './product-detail.css';
```

- [ ] **Step 3: Verify — full manual walkthrough**

Run: `npm run build && npm run preview`, then in the browser:

1. Open the homepage, click a tire card → lands on `/tires/<slug>/` with correct layout (photo left/details right on desktop, stacked on mobile — resize the window to check).
2. View page source (`Ctrl+U`, not DevTools Elements) → confirm the `<title>`, `meta description`, and `<script type="application/ld+json">` contain the product's real title/price, not the homepage's.
3. Click "← Назад до каталогу" → lands on `/#tires` (or `/#wheels` for a wheel page) with that tab active.
4. Click "Купити" → toast appears, cart badge increments (already verified in Task 5, re-check here now that styling is in place).
5. Open the browser console → no errors logged (confirms `hero-slider.ts`/`map.ts`/`nav.ts`/`content.ts` all no-op cleanly without their homepage DOM).

- [ ] **Step 4: Commit**

```bash
git add src/styles/product-detail.css src/styles/main.css
git commit -m "Style the product detail page"
```

---

## Task 9: Scheduled rebuild for data freshness

**Files:**
- Modify: `.github/workflows/deploy.yml:3-6`

**Interfaces:**
- None (CI trigger only).

- [ ] **Step 1: Add the `schedule` trigger**

Change:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

to:

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:
```

- [ ] **Step 2: Verify**

Run: `git diff .github/workflows/deploy.yml` — confirm only the `schedule:` block was added, `push`/`workflow_dispatch` and the `jobs:` section are untouched.

There is no way to locally test a GitHub Actions `schedule` trigger — verification of the actual cron firing happens after this is merged and pushed (out of scope for this task to prove; the YAML syntax is what's being verified here).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Rebuild and redeploy every 6 hours to pick up sheet changes"
```

---

## Task 10: Manual "Оновити товари зараз" button in `/admin`

**Files:**
- Modify: `admin/apps-script/Code.gs:1-23` (header comment), `:51-110` (`doPost`), append new function near `checkPassword_`
- Modify: `src/admin/main.ts:59-92` (`renderTabsShell`)
- Modify: `src/styles/admin.css` (append `.admin-toolbar__actions` rule)
- Modify: `README.md` (append setup note under "Кошик і замовлення" or as its own subsection)

**Interfaces:**
- Produces (Apps Script side): new `doPost` action `rebuildProducts`, function `triggerRebuild_()`.
- Consumes (client side): `callApi('rebuildProducts', { password })` from `src/admin/api.ts` (already exists, no changes needed there — it's a generic `{action, ...payload}` POST helper).

- [ ] **Step 1: Update the `Code.gs` header comment's setup list**

In the numbered setup list near the top of `admin/apps-script/Code.gs` (step 2, "Project Settings (⚙) → Script Properties → додати властивості"), add two more bullet lines after `CHAT_ID`:

```
 *    - GITHUB_TOKEN — fine-grained Personal Access Token з правом "Actions: write" лише на цей
 *      репозиторій (GitHub → Settings → Developer settings → Fine-grained tokens)
 *    - GITHUB_REPO — "власник/репозиторій", напр. "IgorGnutov/tire_place"
```

- [ ] **Step 2: Add the `rebuildProducts` branch to `doPost`**

In `admin/apps-script/Code.gs`, inside `doPost` (currently lines 51–110), add a new `if` block — right after the existing `if (action === 'restoreOrder') { ... }` block and before the final `return jsonResponse({ ok: false, error: 'Невідома дія' });`:

```js
  if (action === 'rebuildProducts') {
    if (!checkPassword_(payload.password)) {
      return jsonResponse({ ok: false, error: 'Неправильний пароль' });
    }
    return jsonResponse(triggerRebuild_());
  }
```

- [ ] **Step 3: Add the `triggerRebuild_` function**

Add this function anywhere below `checkPassword_` in `admin/apps-script/Code.gs`:

```js
/**
 * Запускає вже наявний workflow_dispatch у .github/workflows/deploy.yml через GitHub REST API —
 * той самий job (npm run build + FTP-деплой), що інакше чекав би розкладу schedule.
 */
function triggerRebuild_() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var repo = PropertiesService.getScriptProperties().getProperty('GITHUB_REPO');
  if (!token || !repo) {
    return { ok: false, error: 'GITHUB_TOKEN або GITHUB_REPO не налаштовані в Script Properties' };
  }

  var url = 'https://api.github.com/repos/' + repo + '/actions/workflows/deploy.yml/dispatches';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
    },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code !== 204) {
    return { ok: false, error: 'GitHub API повернув код ' + code + ': ' + response.getContentText() };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Add the button to the admin toolbar**

In `src/admin/main.ts`, inside `renderTabsShell` (currently lines 59–92), replace the toolbar's inner HTML:

```ts
  mainEl.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-tabs" role="tablist">
        <button class="admin-tabs__btn" data-tab="orders" role="tab" type="button">Замовлення</button>
        <button class="admin-tabs__btn" data-tab="content" role="tab" type="button">Тексти</button>
      </div>
      <div class="admin-toolbar__actions">
        <button class="btn btn--outline btn--small" id="admin-rebuild" type="button">Оновити товари зараз</button>
        <button class="btn btn--outline btn--small" id="admin-logout" type="button">Вийти</button>
      </div>
    </div>
    <div id="admin-tab-content"></div>
  `;

  document.getElementById('admin-rebuild')?.addEventListener('click', async () => {
    const btn = document.getElementById('admin-rebuild') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      const result = await callApi('rebuildProducts', { password });
      if (result.ok) {
        showStatus('Оновлення запущено, зміни з’являться на сайті протягом кількох хвилин');
      } else {
        showStatus(result.error || 'Не вдалося запустити оновлення', true);
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
```

(The existing `document.getElementById('admin-logout')?.addEventListener(...)` block right below stays exactly as-is.)

- [ ] **Step 5: Add the toolbar-actions CSS rule**

Append to `src/styles/admin.css`:

```css
.admin-toolbar__actions {
  display: flex;
  gap: var(--space-sm);
}
```

- [ ] **Step 6: Document the setup in README.md**

Append this subsection right after the "### Одноразове налаштування бота" section (after its "Порада з безпеки" paragraph) in `README.md`:

```markdown
## Оновити товари поза розкладом

Сторінки товару (`/tires/<slug>/`, `/wheels/<slug>/`) перегенеровуються автоматично при кожному
пуші в `main` і кожні 6 годин за розкладом (GitHub Actions). Щоб не чекати — у `/admin` є кнопка
**"Оновити товари зараз"**, яка запускає той самий деплой одразу.

### Одноразове налаштування

1. Створіть fine-grained Personal Access Token: GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → New token. Обмежте його лише цим репозиторієм і
   дайте право **Actions: Read and write**.
2. У тому самому Apps Script (Project Settings → Script Properties), де вже є `ADMIN_PASSWORD`,
   `BOT_TOKEN`, `CHAT_ID` — додайте:
   - `GITHUB_TOKEN` — токен з кроку 1;
   - `GITHUB_REPO` — `власник/репозиторій`, напр. `IgorGnutov/tire_place`.
3. Deploy → Manage deployments → New version (URL лишається той самий).

**Порада з безпеки:** токен дає лише право запускати Actions цього репозиторію (не читання/запис
коду) — але все одно тримайте його в секреті так само, як `BOT_TOKEN`.
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck`
Expected: no errors.

Manual (requires a deployed Apps Script with `GITHUB_TOKEN`/`GITHUB_REPO` set, and this branch's `Code.gs` pasted into the live Apps Script project per the repo's existing deploy convention — see README "⚠️ Важливо: порядок викочування" precedent):
1. Open `/admin`, log in, click "Оновити товари зараз".
2. Expected: button disables briefly, then a status toast reads "Оновлення запущено, зміни з’являться на сайті протягом кількох хвилин".
3. Open the repo's GitHub Actions tab → confirm a new "Deploy to hosting" run started around that time.

- [ ] **Step 8: Commit**

```bash
git add admin/apps-script/Code.gs src/admin/main.ts src/styles/admin.css README.md
git commit -m "Add on-demand product rebuild trigger to /admin"
```

---

## Self-Review Notes

- **Spec coverage:** §1 slug/routing → Task 2 (client) + Task 3 (build). §2 data source →
  Task 1 + Task 3. §3 page assembly → Task 4. §4 SEO tags → Task 4. §5 Купити/cart →
  Task 5. §6 sitemap → Task 6. §7 build pipeline → Task 7. §8 scheduled rebuild → Task 9.
  §8.1 admin rebuild button → Task 10. §9 catalog integration → Task 2. §CSS → Task 8. All
  spec sections have a task.
- **Type consistency checked:** `CardInfo.detailUrl` (Task 2) is read by `renderCard` (Task 2) and
  written by `tiresDescribe`/`wheelsDescribe` (Task 2) — same task, same names. `product-data` JSON
  shape `{key, title, sizeLine, price}` is written by `buildMainHtml` (Task 4) and read by
  `initProductBuyButton` (Task 5) with matching field names. `#product-buy-btn` id is written by
  Task 4 and queried by Task 5. Slug functions (`slugify`/`tireSlug`/`wheelSlug`/`dedupeSlugs`) have
  identical names and behavior in both the TS version (Task 2) and the JS duplicate (Task 3), as the
  spec requires.
- **No placeholders:** every step above has literal code, not a description of code.
