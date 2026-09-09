# Проміжний шар URL (хаби/фасети/послуги) + прередер каталогу — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Додати 30 нових індексованих URL (10 товарних хабів/фасетів + 5 контентних сторінок × UA/RU), вписати товарні картки в HTML головної, і зв'язати головну → фасет → товар внутрішніми посиланнями в обидві сторони.

**Architecture:** Спільний для клієнта і білд-скриптів код виноситься в `src/shared/*.mjs` (плейн-ESM, який читає і Vite, і Node 20) — це прибирає два наявних дублікати (slug-формула, `describe*`) замість того щоб додати третій. Білд стає 8-кроковим конвеєром з одним фетчем Google Sheets на весь білд (`.build/data.json`) і фінальним збиранням `sitemap.xml` з `.build/urls.json`.

**Tech Stack:** Vite 8, vanilla TypeScript (strict), плейн-ESM `.mjs` для спільного коду, Papa Parse, sharp, Node 20.

**Spec:** `docs/superpowers/specs/2026-09-09-seo-cluster-pages-design.md`

## Global Constraints

- Мова коментарів, комітів і UI-копії — **українська**; RU-копія — тільки в `src/i18n/*.json` і `src/data/cluster-pages.json`.
- Домен: `https://tire-place.com.ua` (без trailing-варіантів). Усі нові URL — з завершальним слешем.
- Поріг створення фасета: **N = 8** товарів (R19 з рівно 8 входить).
- `PAGE_SIZE = 9` — спільна константа клієнта і прередера.
- Фасетні поля: шини — `season`, `diameter`; диски — `type`. Більше жодних.
- Префікси `/tires/`, `/wheels/` не змінюються (159 URL уже опубліковані).
- `hreflang` по всьому сайту: `uk-UA` / `ru-UA` / `x-default`.
- Тестового фреймворку немає. Перевірка = інваріанти білда (падають, не логують) + `playwright-cli` по **відрендереному DOM**, ніколи по view-source.
- Помилка фетчу таблиці — **фатальна, до запису будь-яких файлів** (delete-sync деплой інакше стирає опубліковані сторінки).
- `checkJs` лишається `false`; публічні функції `src/shared/*` отримують JSDoc.
- Google-схеми, які свідомо **не** додаємо: `FAQPage`, `ItemList`, `CollectionPage`, `aggregateRating` на не-товарних сторінках.

---

## File Structure

**Нове — спільний код (плейн-ESM, без TS-синтаксису):**
- `src/shared/constants.mjs` — `PAGE_SIZE`, `SITE_URL`.
- `src/shared/normalize.mjs` — канонізація значень фасетних полів (кирилична `С` → латинська `C`).
- `src/shared/slug.mjs` — переїзд `src/js/slug.ts` + `.mjs`-дублікат із генератора.
- `src/shared/describe.mjs` — переїзд `describeTire`/`describeWheel` (обидві копії).
- `src/shared/product-card.mjs` — `productCardHtml()`: єдиний рендер картки для клієнта і статики.
- `src/shared/clusters.mjs` — фасети, поріг, розкладка рядків по фасетах, крихти.

**Нове — дані:**
- `src/data/clusters.json` — закріплені URL фасетів.
- `src/data/cluster-pages.json` — тексти всіх 15 сторінок × 2 мови.

**Нове — скрипти білда:**
- `scripts/fetch-data.mjs` — один фетч Sheets на білд → `.build/data.json`.
- `scripts/build-product-images.mjs` — виніс `buildProductImageAssets` з генератора товарів.
- `scripts/generate-cluster-pages.mjs` — хаби, фасети, послуги (UA + RU).
- `scripts/prerender-home.mjs` — картки + блок посилань на фасети в `/` і `/ru/`.
- `scripts/generate-sitemap.mjs` — збирає `dist/sitemap.xml` цілком з `.build/urls.json`.
- `scripts/lib/html-patch.mjs` — спільні хелпери патчу HTML (`replaceMain`, `replaceAttr`, `removeAll`, `removeJsonLd`, `stripI18nHooks`, `rootifyPaths`, `escapeHtml`, `escapeAttr`, `jsonForScript`).

**Нове — стилі:** `src/styles/cluster.css` (крихти, блок посилань, cluster-hero).

**Змінюється:**
- `src/js/slug.ts` — видаляється (імпорти переводяться на `src/shared/slug.mjs`).
- `src/js/render-products.ts` — `renderCard` → `productCardHtml` + делегований слухач; `describe` з `src/shared/describe.mjs`; початковий стан фільтра з фасета.
- `src/js/filters.ts` — `fieldValue` через `normalizeValue`; `writeStateToUrl` вміє писати `_facet=off`.
- `scripts/generate-product-pages.mjs` — читає `.build/data.json`, використовує спільний код, додає видимі крихти, переносить `BreadcrumbList` на `/tires/`, пише `.build/urls.json`.
- `scripts/generate-ru-html.mjs` — `hreflang` uk-UA/ru-UA, пише `.build/urls.json`.
- `index.html` — `hreflang` uk-UA/ru-UA, контейнер `#cluster-links`.
- `src/i18n/ru.json` — нові ключі для крихт/блоку посилань.
- `src/styles/main.css`, `package.json`, `tsconfig.json`, `.gitignore`.
- `public/sitemap.xml` — видаляється (генерується цілком).
- `CLAUDE.md`, `README.md`, `SEO.md`.

---

### Task 1: Спільний код-фундамент (`src/shared/*`) і канонізація діаметра

**Files:**
- Create: `src/shared/constants.mjs`, `src/shared/normalize.mjs`, `src/shared/slug.mjs`
- Delete: `src/js/slug.ts`
- Modify: `src/js/render-products.ts` (імпорт slug), `src/js/filters.ts` (`fieldValue`), `tsconfig.json`, `scripts/generate-product-pages.mjs` (видалити дублікати slug)

**Interfaces:**
- Produces:
  - `PAGE_SIZE: number`, `SITE_URL: string` з `constants.mjs`
  - `normalizeValue(field: string, raw: string): string`, `normalizeDiameter(raw: string): string` з `normalize.mjs`
  - `slugify(s)`, `tireSlug(row)`, `wheelSlug(row)`, `dedupeSlugs(rows, slugOf)` з `slug.mjs`

- [ ] **Step 1: `src/shared/constants.mjs`**

```js
// Константи, спільні для клієнта і білд-скриптів. Плейн-ESM без TS-синтаксису: цей файл
// імпортує і Vite (з .ts), і Node 20 у CI (який .ts не читає).

/** Скільки карток малює каталог за один "екран" — і на клієнті, і в прередері головної.
 *  Значення мусить бути одне: прередер, що віддав би 24 картки, зіщулився б до 9 на очах
 *  користувача одразу після старту JS (CLS). */
export const PAGE_SIZE = 9;

/** Продакшн-домен без завершального слеша. */
export const SITE_URL = 'https://tire-place.com.ua';
```

- [ ] **Step 2: `src/shared/normalize.mjs`**

```js
// Канонізація значень фасетних полів таблиці. Люди заповнюють прайс руками, тож те саме
// значення трапляється в кількох написаннях.

/** Діаметр: "16С" з КИРИЛИЧНОЮ С (U+0421) і "16C" з латинською — одне й те саме значення,
 *  але в таблиці зустрічаються обидва (перевірено: 3 рядки з кириличною, 1 з латинською).
 *  Без канонізації у фільтрі "Діаметр" з'являються два пункти-двійники, а фасет /tires/r16c/
 *  порахував би лише частину товарів. */
export function normalizeDiameter(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/[сС]/g, 'C')
    .toUpperCase();
}

/** Канонічне значення поля для порівнянь і фільтрів. Поля, не перелічені тут, лишаються
 *  як є (лише trim) — розширювати варто тільки за фактом брудних даних. */
export function normalizeValue(field, raw) {
  if (field === 'diameter') return normalizeDiameter(raw);
  return String(raw ?? '').trim();
}
```

- [ ] **Step 3: `src/shared/slug.mjs` — переїзд `src/js/slug.ts`**

Скопіювати тіло `src/js/slug.ts` дослівно, зняти TS-типи, додати JSDoc. **Не** застосовувати
`normalizeValue` — slug рахується з сирих значень, бо 159 URL уже опубліковані й формула
зміни не терпить.

```js
// Генерація URL-slug для сторінки товару з існуючих колонок CSV (без зміни таблиці).
// Раніше формула була продубльована в scripts/generate-product-pages.mjs — тепер це один
// файл на клієнта і на скрипт (плейн-ESM, Node 20 у CI не читає .ts).
//
// УВАГА: slug рахується з СИРИХ значень колонок, без normalize.mjs. 159 URL уже
// опубліковані й проіндексовані; канонізація "16С"→"16C" змінила б частину з них.

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '',
};

/** @param {string} input @returns {string} */
export function slugify(input) { /* тіло з src/js/slug.ts */ }

/** @param {Record<string,string>} row @returns {string} */
export function tireSlug(row) { /* тіло з src/js/slug.ts */ }

/** @param {Record<string,string>} row @returns {string} */
export function wheelSlug(row) { /* тіло з src/js/slug.ts */ }

/** Дедуплікація slug-ів у межах каталогу — колізії отримують суфікс -2, -3… за порядком рядків.
 *  @template T @param {T[]} rows @param {(row: T) => string} slugOf @returns {string[]} */
export function dedupeSlugs(rows, slugOf) { /* тіло з src/js/slug.ts */ }
```

- [ ] **Step 4: `tsconfig.json` — `allowJs`**

Додати в `compilerOptions`:
```json
    "allowJs": true,
    "checkJs": false,
```
`checkJs: true` на плейн-JS під `strict` дав би шум без користі — типи публічних функцій
описані JSDoc-ом, цього достатньо для консюмерів у `.ts`.

- [ ] **Step 5: Перевести імпорти клієнта і генератора**

- `src/js/render-products.ts`: `import { dedupeSlugs, tireSlug, wheelSlug } from './slug'` →
  `from '../shared/slug.mjs'`.
- Видалити `src/js/slug.ts`.
- `scripts/generate-product-pages.mjs`: видалити локальні `TRANSLIT`/`slugify`/`tireSlug`/`wheelSlug`/`dedupeSlugs`,
  додати `import { dedupeSlugs, tireSlug, wheelSlug } from '../src/shared/slug.mjs';`.
- Видалити з шапки `generate-product-pages.mjs` абзац «ЛОГІКА ДУБЛЮЄТЬСЯ З КЛІЄНТА (свідомо)» —
  він стає неправдою.

- [ ] **Step 6: `filters.ts` — канонізація в одному місці**

```ts
import { normalizeValue } from '../shared/normalize.mjs';

function fieldValue(row: CsvRow, field: FieldDef): string {
  if (field.boolean) return parseBool(row[field.key]) ? 'true' : 'false';
  return normalizeValue(field.key, row[field.key] ?? '');
}
```
Це заодно чинить наявний баг: у селекті «Діаметр» більше немає двійників `16C`/`16С`.

- [ ] **Step 7: Перевірка — typecheck і білд**

```bash
npm run typecheck
npm run build
```
Очікується: обидві команди проходять; `dist/tires/<slug>/index.html` генеруються в тій самій
кількості, що й до змін (161 URL у `dist/sitemap.xml`).

- [ ] **Step 8: Перевірка канонізації у браузері**

```bash
npx playwright-cli open http://localhost:4173/
```
У відрендереному DOM селект `#tires-diameter` має містити рівно один пункт `R16C`
(до змін було два — `R16C` і `R16С`).

- [ ] **Step 9: Коміт**

```bash
git add src/shared src/js/render-products.ts src/js/filters.ts tsconfig.json scripts/generate-product-pages.mjs
git rm src/js/slug.ts
git commit -m "refactor: спільний код клієнта і білда в src/shared, канонізація діаметра"
```

---

### Task 2: Єдиний рендер картки (`productCardHtml`) і спільний `describe`

**Files:**
- Create: `src/shared/describe.mjs`, `src/shared/product-card.mjs`
- Modify: `src/js/render-products.ts:66-171` (`renderCard` → рядковий рендер + делегування), `scripts/generate-product-pages.mjs` (видалити `describeTire`/`describeWheel`)

**Interfaces:**
- Consumes: `PAGE_SIZE` з Task 1.
- Produces:
  - `describeTire(row, t): CardInfo`, `describeWheel(row, t): CardInfo` — `t: (key, ukFallback) => string`
  - `CardInfo = { title, specs: {label,value}[], price: number|null, inStock: boolean, key, detailUrl, sizeLine, imageUrl: string|null, brand: string|null }`
  - `productCardHtml(info, imageManifest, t): string`

- [ ] **Step 1: `src/shared/describe.mjs`**

Обидві копії (`src/js/render-products.ts` `tiresDescribe`/`wheelsDescribe` і
`generate-product-pages.mjs` `describeTire`/`describeWheel`) зливаються в одну. Різниця між
ними була рівно в двох речах: клієнт проганяв ярлики через `t()`, а генератор мав
`{ label: 'Сезон' }` захардкоджено — тож `t` стає параметром.

```js
// Мапінг "рядок CSV → вміст картки/сторінки товару". Раніше дублювався між
// src/js/render-products.ts і scripts/generate-product-pages.mjs.
import { parsePrice, parseBool } from './csv-values.mjs';

/**
 * @typedef {(key: string, ukFallback: string) => string} Translate
 * @typedef {{ label: string, value: string }} Spec
 * @typedef {{ title: string, specs: Spec[], price: number|null, inStock: boolean,
 *   key: string, detailUrl: string, sizeLine: string, imageUrl: string|null,
 *   brand: string|null }} CardInfo
 */

/** @param {Record<string,string>} row @param {Translate} t @returns {CardInfo} */
export function describeTire(row, t) {
  const title = `${row.brand ?? ''} ${row.model ?? ''} ${row.width}/${row.profile} R${row.diameter}`.trim();
  const size = `${row.width}/${row.profile} R${row.diameter}`;
  return {
    title,
    specs: [
      { label: t('filters.season', 'Сезон'), value: row.season || '—' },
      { label: t('filters.studded', 'Шипи'), value: parseBool(row.studded) ? t('product.yes', 'Так') : t('product.no', 'Ні') },
      ...(row.load_index ? [{ label: t('product.loadIndex', 'Індекс навантаження'), value: row.load_index }] : []),
      ...(row.speed_index ? [{ label: t('product.speedIndex', 'Індекс швидкості'), value: row.speed_index }] : []),
      ...(row.year ? [{ label: t('filters.year', 'Рік'), value: row.year }] : []),
      ...(row.country ? [{ label: t('filters.country', 'Країна'), value: row.country }] : []),
    ],
    price: parsePrice(row.price),
    inStock: parseBool(row.in_stock),
    key: `tires:${title}:${size}`,
    detailUrl: row.__detailUrl ?? '',
    sizeLine: size,
    imageUrl: row.image_url?.trim() || null,
    brand: row.brand?.trim() || null,
  };
}

/** @param {Record<string,string>} row @param {Translate} t @returns {CardInfo} */
export function describeWheel(row, t) { /* дзеркально, за wheelsDescribe + describeWheel */ }
```

`src/shared/csv-values.mjs` — `parsePrice`/`parseBool` дослівно з `src/js/csv.ts` (плейн-ESM,
щоб `describe.mjs` не тягнув `.ts`); `src/js/csv.ts` реекспортує їх звідти, щоб не мати
третьої копії:

```ts
export { parsePrice, parseBool } from '../shared/csv-values.mjs';
```

**Свідома різниця з поточним генератором:** старий `describeTire` у скрипті клав у specs
`Сезон`/`Шипи` завжди і не мав `detailUrl`; новий уніфікований варіант дає той самий набір,
що бачить користувач у картці. Сторінка товару від цього не змінюється візуально — той самий
перелік характеристик.

- [ ] **Step 2: `src/shared/product-card.mjs`**

```js
// Єдиний рендер картки товару: цей самий рядок HTML віддає і клієнтський каталог
// (render-products.ts, grid.innerHTML), і прередер головної, і сторінки хаба/фасета.
// Фізично один код — саме тому статика й клієнт не можуть намалювати різні картки.
import { escapeHtml, escapeAttr } from './html-escape.mjs';

/** @param {import('./describe.mjs').CardInfo} info
 *  @param {Record<string, {avif?:string, webp?:string, jpg?:string}>} imageManifest
 *  @param {import('./describe.mjs').Translate} t
 *  @returns {string} */
export function productCardHtml(info, imageManifest, t) {
  // ... <article class="product-card"> з тією самою структурою, що будував renderCard:
  //   <a class="product-card__link" href=…>  (без href, якщо detailUrl порожній)
  //     <div class="product-card__photo">     (лише якщо imageUrl !== undefined)
  //     <h3 class="product-card__title">
  //   <ul class="product-card__specs">
  //   <span class="status status--in|status--out">
  //   <div class="product-card__footer">
  //     <span class="product-card__price">
  //     <div class="product-card__actions">
  //       <button class="btn btn--small" data-buy="<info.key>" [disabled]>
}
```

Три речі, які **не** переносяться один-в-один із DOM-версії:

1. `img.addEventListener('error', …)` (плейсхолдер замість зламаної іконки) неможливий
   інлайном — CSP `script-src 'self'` без `'unsafe-inline'` заборонив би `onerror=`. Замість
   цього в Step 3 ставиться **один** делегований слухач `error` на гріді у фазі **capture**
   (події `error` від `<img>` не бублять, але в capture-фазі на предку спрацьовують).
2. `data-buy="<key>"` замість замикання на кожній кнопці.
3. `imageUrl === undefined` (жодного фото-блоку) від `imageUrl === null` (плейсхолдер)
   відрізняється так само, як у `renderCard` — `describe*` завжди віддає `string|null`, тож
   на практиці блок є завжди; ключ `undefined` лишається для сумісності виклику.

`src/shared/html-escape.mjs` — `escapeHtml`/`escapeAttr` дослівно з `generate-product-pages.mjs`.

- [ ] **Step 3: `render-products.ts` — рядковий рендер і делегування**

Замінити `renderCard` та місце виклику:

```ts
import { productCardHtml } from '../shared/product-card.mjs';

// Карти "ключ товару → CardInfo" для делегованого обробника "Купити": одне замикання на
// грід замість PAGE_SIZE замикань на кожне перемальовування.
const cardsByKey = new Map<string, CardInfo>();

grid.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy]');
  if (!btn || btn.disabled) return;
  const info = cardsByKey.get(btn.dataset.buy!);
  if (!info) return;
  addItem({ key: info.key, title: info.title, sizeLine: info.sizeLine, price: info.price });
  showToast(t('product.addedToCart', 'Додано в кошик'));
});

// Фото не завантажилось (сторінка перегляду Google Drive замість файлу, видалене фото) —
// показуємо плейсхолдер. capture: true, бо подія error від <img> не бублює.
grid.addEventListener(
  'error',
  (e) => {
    const img = e.target as HTMLElement;
    if (!(img instanceof HTMLImageElement)) return;
    const photo = img.closest('.product-card__photo');
    if (!photo) return;
    photo.innerHTML = '';
    photo.classList.add('product-card__photo--placeholder');
  },
  true
);
```

У `renderResults()`:
```ts
const shown = filtered.slice(0, visibleCount).map((row) => config.describe(row));
cardsByKey.clear();
shown.forEach((info) => cardsByKey.set(info.key, info));
grid.innerHTML = shown.map((info) => productCardHtml(info, imageManifest, t)).join('');
```

`tiresDescribe`/`wheelsDescribe` у `render-products.ts` замінюються на
`(row) => describeTire(row, t)` / `(row) => describeWheel(row, t)`.

- [ ] **Step 4: `generate-product-pages.mjs` — прибрати другу копію**

Видалити локальні `describeTire`/`describeWheel`, `parsePrice`, `parseBool`, `escapeHtml`,
`escapeAttr`; імпортувати з `src/shared/*`. `t` для UA-сторінок товару — тривіальна
`(_key, uk) => uk`.

- [ ] **Step 5: Перевірка**

```bash
npm run typecheck && npm run build
npx playwright-cli open http://localhost:4173/
```
У відрендереному DOM: 9 карток на `#tires-grid`, клік «Купити» додає позицію в кошик
(бейдж `#cart-badge` = 1), картка веде на `/tires/<slug>/`.

- [ ] **Step 6: Коміт**

```bash
git add -A && git commit -m "refactor: єдиний productCardHtml і describe для клієнта й білда"
```

---

### Task 3: Один фетч таблиці на білд (`.build/data.json`) і виніс оптимізації фото

**Files:**
- Create: `scripts/fetch-data.mjs`, `scripts/build-product-images.mjs`, `scripts/lib/sheets.mjs`
- Modify: `scripts/generate-product-pages.mjs`, `package.json`, `.gitignore`

**Interfaces:**
- Produces:
  - `.build/data.json` = `{ fetchedAt: string, tires: CsvRow[], wheels: CsvRow[], reviews: CsvRow[] }`
  - `.build/images.json` = `{ card: Manifest, detail: Manifest }`, `Manifest = Record<url, {avif?,webp?,jpg?}>`
  - `dist/data/product-images.json` = `Manifest` (лише `card`)
  - `scripts/lib/sheets.mjs`: `fetchCsvRows(url): Promise<CsvRow[]>`, `sheetCsvUrl(id, gid)`

- [ ] **Step 1: `scripts/lib/sheets.mjs`** — `sheetCsvUrl` + `fetchCsvRows` дослівно з `generate-product-pages.mjs` (разом із перевіркою «Google віддав HTML-сторінку логіну замість CSV»).

- [ ] **Step 2: `scripts/fetch-data.mjs`**

```js
// Крок 2 конвеєра: ЄДИНИЙ фетч Google Sheets на весь білд. Далі всі генератори читають
// .build/data.json, а не таблицю. Причина не в швидкості: три незалежних звернення дають
// реальний шанс, що сторінки одного білда побудуються з різних знімків прайсу (власник
// редагує таблицю під час деплою).
//
// Будь-яка помилка тут — ФАТАЛЬНА і спрацьовує ДО запису будь-яких файлів у dist/.
// Деплой (SamKirkland/FTP-Deploy-Action) синхронізує dist/ з видаленням зайвого: "успішний"
// білд без товарів стер би з живого сайту всі вже опубліковані сторінки.
// Порожня, але доступна таблиця (0 рядків) — валідний стан, не помилка.
```
Читає `src/data/sheet-ids.json`, фетчить `tires`, `wheels` і (якщо `gids.reviews` не `null`)
`reviews`. Збирає помилки в масив, і якщо він не порожній — `throw` з переліком. Пише
`.build/data.json` (`mkdirSync('.build', { recursive: true })`).

- [ ] **Step 3: `scripts/build-product-images.mjs`**

Переносить `CARD_WIDTH`/`DETAIL_WIDTH`/`IMAGE_FORMATS`/`encodeImageVariant`/`buildProductImageAssets`
з `generate-product-pages.mjs` без зміни логіки (включно з «помилка на одному фото не валить
білд»). Джерело URL-ів — `.build/data.json` (`image_url` шин і дисків). Пише
`dist/data/product-images.json` (card) і `.build/images.json` (`{card, detail}`).

- [ ] **Step 4: `generate-product-pages.mjs` — читати `.build/*`**

`loadProducts()` більше не фетчить: читає `.build/data.json`; `buildProductImageAssets`
замінюється читанням `.build/images.json` → `new Map(Object.entries(images.detail))`.
Фатальна перевірка помилок фетчу переїжджає у `fetch-data.mjs` (коментар про delete-sync — теж).

- [ ] **Step 5: `package.json` — конвеєр**

```json
"build": "vite build && node scripts/fetch-data.mjs && node scripts/build-product-images.mjs && node scripts/generate-ru-html.mjs && node scripts/generate-product-pages.mjs && node scripts/generate-cluster-pages.mjs && node scripts/prerender-home.mjs && node scripts/generate-sitemap.mjs",
```
(кроки 6–8 з'являються в Tasks 6, 9, 10 — до того часу хвіст команди додається поступово,
щоб `npm run build` лишався зеленим після кожної таски.)

- [ ] **Step 6: `.gitignore`** — додати `.build/`.

- [ ] **Step 7: Перевірка**

```bash
npm run build
node -e "const d=require('node:fs').readFileSync('.build/data.json','utf8');const j=JSON.parse(d);console.log(j.tires.length, j.wheels.length, j.reviews.length)"
ls dist/tires | wc -l
```
Очікується: `143 16 <N>`; кількість каталогів у `dist/tires` така сама, як до змін.

Перевірка фатальності (руками, один раз): підмінити `spreadsheetId` на сміття →
`npm run build` падає з ненульовим кодом **до** появи `dist/tires/`.

- [ ] **Step 8: Коміт**

```bash
git add -A && git commit -m "build: один фетч таблиці на білд (.build/data.json), виніс оптимізації фото"
```

---

### Task 4: Модель фасетів (`clusters.json` + `clusters.mjs`) та інваріанти

**Files:**
- Create: `src/data/clusters.json`, `src/shared/clusters.mjs`

**Interfaces:**
- Consumes: `normalizeValue` (Task 1), `dedupeSlugs`/`tireSlug`/`wheelSlug` (Task 1).
- Produces:
  - `FACET_THRESHOLD = 8`
  - `FACET_FIELDS = { tires: ['season','diameter'], wheels: ['type'] }`
  - `listFacetPages(clusters): FacetPage[]`, `FacetPage = { key, kind, field, slug, value, path }`
  - `rowsForFacet(rows, field, value): CsvRow[]`
  - `suggestNewFacets(rows, kind, clusters): {field, value, count}[]`
  - `assertNoSlugCollisions(facetPages, products): void` (throw)
  - `facetForProduct(row, kind, facetPages): FacetPage | null`

- [ ] **Step 1: `src/data/clusters.json`**

Значення взяті з фактичного стану таблиці на 2026-09-09 (143 шини / 16 дисків) із порогом ≥8
**після** канонізації діаметра:

```json
{
  "tires": {
    "season": [
      { "slug": "winter", "value": "Зима" }
    ],
    "diameter": [
      { "slug": "r14", "value": "14" },
      { "slug": "r15", "value": "15" },
      { "slug": "r16", "value": "16" },
      { "slug": "r17", "value": "17" },
      { "slug": "r18", "value": "18" },
      { "slug": "r19", "value": "19" }
    ]
  },
  "wheels": {
    "type": [
      { "slug": "cast", "value": "Литі" }
    ]
  }
}
```

Не входять (нижче порогу): Всесезонна (3), R13 (2), R15C (7), R16C (4 після злиття
кириличної/латинської C), R20 (5), Штамповані (3), Ковані (2), усі діаметри дисків (1–5).

- [ ] **Step 2: `src/shared/clusters.mjs`**

```js
// Визначення фасетних сторінок: які поля взагалі стають URL, який поріг на створення і як
// рядок прайсу співвідноситься з фасетом.
//
// Ключова властивість: URL фасета ЗАКРІПЛЕНИЙ у src/data/clusters.json, а поріг діє лише на
// СТВОРЕННЯ нової сторінки. Проіндексований /tires/r19/ мусить лишатись з HTTP 200, навіть
// якщо залишок упав до нуля — інакше кожна зміна прайсу викидала б URL з індексу.
import { normalizeValue } from './normalize.mjs';

/** Скільки товарів мусить бути, щоб ЗАПРОПОНУВАТИ новий фасет. Консервативний: закріплений
 *  URL живе назавжди, тож напівпорожні сторінки — гірше, ніж їх відсутність. */
export const FACET_THRESHOLD = 8;

/** Поля, які взагалі можуть стати URL. Решта колонок (width, profile, brand, pcd, et, year,
 *  country) лишаються тільки клієнтськими фільтрами — за 143 рядками окрема сторінка на
 *  точний розмір дала б 1–3 товари, тобто thin content. */
export const FACET_FIELDS = { tires: ['season', 'diameter'], wheels: ['type'] };

export function listFacetPages(clusters) { /* → [{key:'tires/r16', kind:'tires', field:'diameter', slug:'r16', value:'16', path:'tires/r16'}] */ }
export function rowsForFacet(rows, field, value) { /* normalizeValue-порівняння */ }
export function suggestNewFacets(rows, kind, clusters) { /* значення ≥ FACET_THRESHOLD, яких немає у clusters.json */ }
export function facetForProduct(row, kind, facetPages) { /* diameter > season для шин, type для дисків */ }
export function assertNoSlugCollisions(facetPages, products) { /* throw з назвами обох сторінок */ }
```

`assertNoSlugCollisions` — інваріант із §4.4 спеки:

```js
export function assertNoSlugCollisions(facetPages, products) {
  const bySlug = new Map(products.map((p) => [`${p.kind}/${p.slug}`, p]));
  for (const facet of facetPages) {
    const clash = bySlug.get(facet.path);
    if (clash) {
      throw new Error(
        `колізія slug: фасетна сторінка /${facet.path}/ (${facet.field}=${facet.value}) ` +
          `і товар "${clash.title}" претендують на той самий URL. Один із них безслідно зник би з сайту.`
      );
    }
  }
}
```

`suggestNewFacets` теж мусить валити білд у одному випадку — коли канонізація дала два
різних канонічних значення для одного slug у `clusters.json` (§9):

```js
// Два рядки clusters.json з різними value, але однаковим slug — це або описка, або
// незавершена канонізація. Тихо взяти перший означало б згенерувати сторінку, що показує
// половину товарів.
```

- [ ] **Step 3: Перевірка — розкладка рядків**

```bash
node -e "
import('./src/shared/clusters.mjs').then(async (C) => {
  const fs = await import('node:fs');
  const clusters = JSON.parse(fs.readFileSync('src/data/clusters.json','utf8'));
  const data = JSON.parse(fs.readFileSync('.build/data.json','utf8'));
  for (const f of C.listFacetPages(clusters)) {
    const rows = C.rowsForFacet(f.kind === 'tires' ? data.tires : data.wheels, f.field, f.value);
    console.log(f.path, rows.length);
  }
  console.log('suggest tires', C.suggestNewFacets(data.tires, 'tires', clusters));
  console.log('suggest wheels', C.suggestNewFacets(data.wheels, 'wheels', clusters));
});
"
```
Очікується: `tires/winter 140`, `tires/r14 14`, `tires/r15 21`, `tires/r16 26`, `tires/r17 36`,
`tires/r18 20`, `tires/r19 8`, `wheels/cast 11`; обидва `suggest` — порожні масиви.

- [ ] **Step 4: Коміт**

```bash
git add -A && git commit -m "feat: модель фасетних сторінок (clusters.json + clusters.mjs)"
```

---

### Task 5: Тексти кластерних сторінок (`cluster-pages.json`)

**Files:**
- Create: `src/data/cluster-pages.json`

**Interfaces:**
- Produces: `ClusterPageText = { slug, h1, title, description, intro, faq: {q,a}[] }`, доступний
  як `pages[key][lang]`; `key` ∈ 15 ключів; `lang` ∈ `uk`|`ru`.

**Обов'язковий контракт:** `slug` — **повний** відносний шлях без слешів по краях
(`"tires"`, `"tires/r16"`, `"shynomontazh"` / `"shinomontazh"`). Per-language (Р11): у
контентних сторінок UA і RU слаги різні, у товарних — однакові.

- [ ] **Step 1: Каркас файлу з 15 ключами × 2 мови**

Ключі рівно такі (інші генератор відкине як осиротілі, відсутні — заваляють білд):
`tires`, `wheels`, `tires/winter`, `tires/r14`, `tires/r15`, `tires/r16`, `tires/r17`,
`tires/r18`, `tires/r19`, `wheels/cast`, `shynomontazh`, `farbuvannya-dyskiv`,
`zberihannya-shyn`, `akumulyatory`, `kontakty`.

- [ ] **Step 2: Розведення з головною (§4.3) — жорстке правило для `h1`/`title`**

| Сторінка | `h1` | `title` |
|---|---|---|
| головна (не чіпаємо) | Шини та диски в Кривому Розі | Шини, диски, акумулятори Кривий Ріг — TIRE PLACE |
| `tires` | Купити шини в Кривому Розі | Шини в Кривому Розі — купити зимові та всесезонні \| TIRE PLACE |
| `tires/r16` | Шини R16 у Кривому Розі | Шини R16 у Кривому Розі — купити \| TIRE PLACE |
| `tires/winter` | Зимові шини в Кривому Розі | Зимові шини Кривий Ріг — купити з доставкою \| TIRE PLACE |
| `wheels` | Купити диски в Кривому Розі | Диски в Кривому Розі — литі та штамповані \| TIRE PLACE |
| `wheels/cast` | Литі диски в Кривому Розі | Литі диски Кривий Ріг — купити \| TIRE PLACE |

RU-дзеркала за тим самим шаблоном («Шины R16 в Кривом Роге» тощо).

- [ ] **Step 3: `intro` — 800–1500 знаків унікального тексту на кожну сторінку × 2 мови**

`intro` — готовий HTML (`<p>…</p>`), який іде в сторінку як є. Не переказ головної: кожен
фасет пише про своє (типові авто під цей діаметр, чим зимова гума відрізняється, що таке
литий диск проти штампованого). Контентні сторінки (`shynomontazh`, `farbuvannya-dyskiv`,
`zberihannya-shyn`, `akumulyatory`) описують послугу: що входить, скільки триває, як записатись.

- [ ] **Step 4: `faq` — 3–5 питань на сторінку**

Видимі `<details>`, **без** `FAQPage`-схеми (з серпня 2023 Google показує FAQ-rich-results
лише авторитетним урядовим і медичним сайтам — той самий принцип, що вже зафіксований для
`shippingDetails`).

- [ ] **Step 5: Перевірка — покриття ключів**

```bash
node -e "
const fs=require('node:fs');
const pages=JSON.parse(fs.readFileSync('src/data/cluster-pages.json','utf8'));
const need=['tires','wheels','tires/winter','tires/r14','tires/r15','tires/r16','tires/r17','tires/r18','tires/r19','wheels/cast','shynomontazh','farbuvannya-dyskiv','zberihannya-shyn','akumulyatory','kontakty'];
const bad=[];
for(const k of need) for(const l of ['uk','ru']){
  const p=pages[k]?.[l];
  if(!p) { bad.push(k+'/'+l+': немає'); continue; }
  for(const f of ['slug','h1','title','description','intro']) if(!p[f]) bad.push(k+'/'+l+': порожнє '+f);
  const len=p.intro.replace(/<[^>]+>/g,'').length;
  if(len<800) bad.push(k+'/'+l+': intro '+len+' знаків (<800)');
}
console.log(bad.length? bad.join('\n') : 'OK: 15×2 сторінок, усі поля заповнені');
"
```
Очікується: `OK: 15×2 сторінок, усі поля заповнені`.

- [ ] **Step 6: Коміт**

```bash
git add src/data/cluster-pages.json && git commit -m "content: тексти 15 кластерних сторінок UA+RU"
```

---

### Task 6: Генератор кластерних сторінок

**Files:**
- Create: `scripts/generate-cluster-pages.mjs`, `scripts/lib/html-patch.mjs`, `src/styles/cluster.css`
- Modify: `src/styles/main.css`, `src/i18n/ru.json`, `package.json`

**Interfaces:**
- Consumes: `.build/data.json`, `.build/images.json`, `src/data/clusters.json`,
  `src/data/cluster-pages.json`, `dist/index.html` (UA-оболонка), `dist/ru/index.html` (RU-оболонка),
  `listFacetPages`/`rowsForFacet`/`suggestNewFacets`/`assertNoSlugCollisions` (Task 4),
  `productCardHtml`/`describeTire`/`describeWheel` (Task 2), `PAGE_SIZE` (Task 1).
- Produces: `dist/<path>/index.html` × 15, `dist/ru/<path>/index.html` × 15; дописує
  `.build/urls.json`.

- [ ] **Step 1: `scripts/lib/html-patch.mjs`** — виніс хелперів патчу з `generate-product-pages.mjs`

`replaceMain`, `replaceAttr`, `removeAll`, `removeJsonLd`, `rootifyPaths`, `jsonForScript`,
плюс новий `stripI18nHooks(html)`:

```js
/** Зрізає хуки, які main.js перезаписує на старті. БЕЗ цього побудовані тут SEO-теги
 *  зникають із DOM, який індексує Google, а у view-source усе виглядає правильно — це
 *  найпідліший тип регресії в цьому проєкті, тож зрізання обов'язкове і падає, якщо
 *  шаблон не знайдено. */
export function stripI18nHooks(html) {
  let out = removeAll(html, / id="canonical-link"/g, 'id="canonical-link"');
  out = removeAll(out, / id="og-url-meta"/g, 'id="og-url-meta"');
  out = removeAll(out, / data-i18n-attr="content:meta\.[A-Za-z]+"/g, 'data-i18n-attr="content:meta.*"');
  return out;
}
```
`generate-product-pages.mjs` переводиться на ці ж хелпери (третьої копії не заводимо).

- [ ] **Step 2: Оболонка — UA з `dist/index.html`, RU з `dist/ru/index.html`**

RU-сторінки клонуються **з уже перекладеної** `dist/ru/index.html`, а не з `index.html` — так
хедер, футер і `meta` вже російські, і генератору лишається лише `<main>`, `title`,
`description`, `canonical`, `og:*`, крихти й JSON-LD. Саме тому крок 6 конвеєра іде **після**
кроку 4 (`generate-ru-html.mjs`).

- [ ] **Step 3: `<main>` товарної сторінки (хаб/фасет)**

Структура (ids збігаються з головною, тому клієнтський `initCatalog` підхоплює сторінку
без жодних змін у `initCatalogs()`):

```html
<div class="container cluster-page">
  <nav class="breadcrumbs" aria-label="Навігація по сайту">
    <ol>
      <li><a href="/">Головна</a></li>
      <li><a href="/tires/">Шини</a></li>
      <li aria-current="page">R16</li>
    </ol>
  </nav>
  <h1>Шини R16 у Кривому Розі</h1>
  <div class="cluster-page__intro">…intro з cluster-pages.json…</div>

  <div class="cluster-links">
    <p class="cluster-links__label">Шини за діаметром</p>
    <ul>…R14 · R15 · <strong aria-current="page">R16</strong> · R17 · R18 · R19…</ul>
    <p class="cluster-links__label">Ще</p>
    <ul><li><a href="/tires/winter/">Зимові шини</a></li><li><a href="/tires/">Усі шини →</a></li></ul>
  </div>

  <!-- той самий каталог, що на головній: фільтри + сорт + чипси + грід + "показати ще" -->
  <form class="filters" id="tires-filters" data-product-type="tires"
        data-facet-field="diameter" data-facet-value="16">…</form>
  <div class="results-bar"><span id="tires-count" aria-live="polite">Знайдено: 26</span>…</div>
  <div class="product-grid" id="tires-grid" aria-live="polite">…PAGE_SIZE карток…</div>
  <div class="load-more" id="tires-load-more-wrap"><button class="btn btn--outline" id="tires-load-more">Показати ще</button></div>

  <section class="cluster-faq">…<details>…</details>…</section>
</div>
```

Три обов'язкові деталі:

1. `#tires-count` віддається вже заповненим (`Знайдено: 26`) і **без** `data-i18n="product.loading"` —
   інакше клієнтський i18n впише «Завантаження…» назад.
2. Грід віддає рівно `PAGE_SIZE` карток, відфільтрованих за фасетом, у порядку таблиці
   (клієнт за замовчуванням сортування не застосовує — тож пост-JS грід ідентичний).
3. Порожній фасет (0 товарів після зміни залишків) → замість гріду блок
   «Зараз немає в наявності» + посилання на сусідні розміри, і сторінка все одно віддається
   з HTTP 200. Видалення URL — завжди свідомий ручний акт.

- [ ] **Step 4: `<main>` контентної сторінки (послуги/контакти)**

Крихти → `h1` → `intro` → `faq` → CTA-кнопка (`href` = `buildTelegramLink`-подібне
`t.me/<user>?text=…`, як у `render-service.ts`) → блок посилань на `/tires/`, `/wheels/`
і сусідні послуги.

- [ ] **Step 5: Патч `head`**

`title`, `description`, `canonical`, `og:title`, `og:description`, `og:url`, `twitter:title`,
`twitter:description` — з `cluster-pages.json`. Потім `stripI18nHooks(html)`.
`og:image`/`og:image:width`/`height` лишаються (фото вивіски).

- [ ] **Step 6: `hreflang` — власна взаємна пара**

На відміну від сторінок товару (де зрізається повністю) — переписується:

```html
<link rel="alternate" hreflang="uk-UA"    href="https://tire-place.com.ua/tires/r16/" />
<link rel="alternate" hreflang="ru-UA"    href="https://tire-place.com.ua/ru/tires/r16/" />
<link rel="alternate" hreflang="x-default" href="https://tire-place.com.ua/tires/r16/" />
```
`og:locale`/`og:locale:alternate` лишаються ті, що дала оболонка (RU-оболонка вже має `ru_RU`).

- [ ] **Step 7: Перемикач мови — справжня навігація**

```js
// Текст цих сторінок живе в cluster-pages.json, а не в ru.json, тож клієнтський i18n його
// не знає і на UA-сторінці залишив би опис російським. Тому data-lang-link зрізається, а
// перемикач стає звичайним переходом /tires/r16/ ↔ /ru/tires/r16/.
// НАСЛІДОК, прийнятий свідомо: на головній перемикач перекладає на місці, на кластерних —
// переходить.
```
Зрізати ` data-lang-link="(uk|ru)"`, підставити `href` двійників, повісити `is-active` на
поточну мову.

- [ ] **Step 8: Навігація і відносні шляхи**

`href="#<hash>" data-nav-link` → `href="/#<hash>" data-nav-link` (голий хеш на не-головній
нікуди не веде, а `a[data-nav-link][href="#wheels"]` з `initCatalogTabs` перехопив би клік);
`rootifyPaths(html)` для `./`-шляхів; зрізати `<link rel="preload" as="image">` (hero тут немає).

- [ ] **Step 9: JSON-LD**

`removeJsonLd(html, ['Service', 'FAQPage', 'BreadcrumbList'])` — лишається `AutoPartsStore`.
Додається власний `BreadcrumbList` (Головна → Шини → R16). На сторінках послуг додається
`Service` з `provider: AutoPartsStore` і `areaServed: { "@type": "City", "name": "Кривий Ріг" }`.
`FAQPage`/`ItemList`/`CollectionPage`/`aggregateRating` — не додаються (див. Global Constraints).

- [ ] **Step 10: Інваріанти генератора**

```js
// Немає тексту в cluster-pages.json для сторінки, яку треба згенерувати → падіння з
// переліком, щоб сторінка без опису не поїхала в прод тихо.
if (missingText.length) throw new Error(`generate-cluster-pages: немає текстів у cluster-pages.json для: ${missingText.join(', ')}`);
```
плюс `assertNoSlugCollisions(facetPages, products)` і підказка про нові фасети —
**і в лог, і в `$GITHUB_STEP_SUMMARY`** (інакше нове значення ≥N ніхто не помітить):

```js
const hints = [...suggestNewFacets(data.tires, 'tires', clusters), ...suggestNewFacets(data.wheels, 'wheels', clusters)];
if (hints.length && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Нові фасети, які перетнули поріг ${FACET_THRESHOLD}\n` +
    hints.map((h) => `- \`${h.kind}.${h.field}\` = **${h.value}** (${h.count} товарів) — додайте рядок у \`src/data/clusters.json\`, щоб сторінка створилась\n`).join(''));
}
```
Сторінка при цьому **не** створюється і CI нічого не комітить — закріплення URL завжди ручне.

- [ ] **Step 11: `src/styles/cluster.css` + `src/i18n/ru.json`**

`.breadcrumbs`, `.cluster-page`, `.cluster-page__intro`, `.cluster-links`, `.cluster-faq`;
підключити в `src/styles/main.css`. У `ru.json` — ключі `breadcrumbs.home`,
`clusterLinks.byDiameter`, `clusterLinks.allTires`, `clusterLinks.allWheels`, `facet.empty`
(для блоку «зараз немає в наявності», який рендериться і клієнтом теж).

- [ ] **Step 12: `package.json`** — додати `&& node scripts/generate-cluster-pages.mjs` після `generate-product-pages.mjs`.

- [ ] **Step 13: Перевірка — файли й відрендерений DOM**

```bash
npm run build
ls dist/tires dist/wheels dist/ru/tires
npm run preview
```

`playwright-cli` по відрендереному DOM (не view-source!):
- `/tires/r16/` — `canonical` = `https://tire-place.com.ua/tires/r16/`, `og:url` те саме,
  `title` з `cluster-pages.json`, три `hreflang` (`uk-UA`/`ru-UA`/`x-default`) — усе вціліло
  **після** старту `main.js`;
- `/ru/tires/r16/` — тіло російською (хедер, футер, `h1`, `intro`);
- крихти видимі, клікабельні, ведуть на існуючі URL;
- перемикач мови на `/tires/r16/` веде на `/ru/tires/r16/`, а не на `/ru/`;
- `#tires-count` = `Знайдено: 26` і не перетворюється на «Завантаження…»;
- селект `#tires-diameter` = `R16`, чипс «Діаметр: R16» присутній.

- [ ] **Step 14: Перевірка порожнього фасета**

Тимчасово додати в `clusters.json` `{ "slug": "r22", "value": "22" }` (0 товарів) + текст у
`cluster-pages.json`, зібрати, переконатись, що `dist/tires/r22/index.html` існує й показує
«зараз немає в наявності» + сусідні розміри, і **відкатити** обидві правки.

- [ ] **Step 15: Коміт**

```bash
git add -A && git commit -m "feat: генератор хабів, фасетів і сторінок послуг (UA + RU)"
```

---

### Task 7: Крихти на сторінках товару і переадресація `BreadcrumbList`

**Files:**
- Modify: `scripts/generate-product-pages.mjs`, `src/styles/product-detail.css`

**Interfaces:**
- Consumes: `facetForProduct` (Task 4), `listFacetPages` (Task 4).

**Проблема (перевірено на живому сайті):** сторінка товару — плаский шар без вихідних
посилань: `0` посилань на інші товари або каталог, видимих крихт немає, середня ланка
`BreadcrumbList` указує на `https://tire-place.com.ua/#tires` — якір головної, а не документ.

- [ ] **Step 1: Видимі крихти замість «← Назад до каталогу»**

У `buildMainHtml` замінити `<a class="product-detail__back" href="/#tires">` на той самий
`<nav class="breadcrumbs">`, що на кластерних сторінках: `Головна → Шини → R16 → <назва>`
(ланка фасета присутня, лише якщо для товару є відповідна фасетна сторінка).

- [ ] **Step 2: `BreadcrumbList` — на документи, не на якорі**

```js
// Було: item = "https://tire-place.com.ua/#tires" — якір головної, тобто ланка вела не на
// документ. Стало: /tires/ (хаб) і, якщо є, /tires/r16/ (фасет).
```
Позиції: 1 Головна `/`, 2 Шини `/tires/`, 3 фасет `/tires/r16/` (за наявності), остання — товар.

- [ ] **Step 3: `product-detail.css`** — прибрати `.product-detail__back`, стилі крихт беруться з `cluster.css`.

- [ ] **Step 4: Перевірка**

```bash
npm run build && npm run preview
```
`playwright-cli` на будь-якій `/tires/<slug>/`: крихти видимі, кожне посилання веде на
існуючий файл у `dist/`; `BreadcrumbList` у DOM містить `/tires/` і `/tires/r16/`, і жодного
`#tires`.

- [ ] **Step 5: Коміт**

```bash
git add -A && git commit -m "feat: видимі крихти на сторінках товару, BreadcrumbList на /tires/"
```

---

### Task 8: Фасет як початковий стан фільтра на клієнті

**Files:**
- Modify: `src/js/render-products.ts`, `src/js/filters.ts`

**Interfaces:**
- Consumes: `data-facet-field`/`data-facet-value` на `#<prefix>-filters` (Task 6, Step 3).
- Produces: `writeStateToUrl(prefix, fields, state, priceMin, priceMax, facetOff?)`.

- [ ] **Step 1: `filters.ts` — прапорець «фасет знято»**

```ts
/** На фасетній сторінці фасет підставляється як початковий стан фільтра. Щоб знятий
 *  користувачем фасет не повертався після перезавантаження (а шароване посилання показувало
 *  саме те, що бачив користувач), знімання фіксується параметром <prefix>_facet=off. */
export function isFacetOff(prefix: string): boolean {
  return new URLSearchParams(window.location.search).get(`${prefix}_facet`) === 'off';
}
```
`writeStateToUrl` отримує 6-й необов'язковий параметр `facetOff` і виставляє/прибирає
`${prefix}_facet`. Наявний блок «прибираємо всі старі параметри цього каталогу» вже
чистить `${prefix}_*`, тож окремого видалення не треба.

- [ ] **Step 2: `render-products.ts` — початковий стан**

```ts
const facetField = form.dataset.facetField ?? '';
const facetValue = form.dataset.facetValue ?? '';
let state: FilterState = readStateFromUrl(idPrefix, fields);
// URL-параметри мають пріоритет: шароване посилання показує рівно те, що в ньому написано.
if (facetField && facetValue && !isFacetOff(idPrefix) && !state[facetField]) {
  state[facetField] = facetValue;
}
```
У `onFiltersChanged()` передавати `facetOff = Boolean(facetField) && !state[facetField]`.

**Знімання фасета не змінює `canonical`** — це той самий документ з іншим станом фільтра,
тож нічого в `head` не чіпаємо.

- [ ] **Step 3: Перевірка**

```bash
npm run typecheck && npm run build && npm run preview
```
`playwright-cli` на `/tires/r16/`:
- при завантаженні: чипс «Діаметр: R16», `Знайдено: 26`;
- клік `×` на чипсі: `Знайдено: 143`, URL містить `tires_facet=off`;
- перезавантаження цього URL: фасет **не** повернувся, `Знайдено: 143`;
- `canonical` після обох дій — `https://tire-place.com.ua/tires/r16/`.

- [ ] **Step 4: Коміт**

```bash
git add -A && git commit -m "feat: фасет як початковий (знімний) стан фільтра каталогу"
```

---

### Task 9: Прередер головної (`/` і `/ru/`)

**Files:**
- Create: `scripts/prerender-home.mjs`
- Modify: `index.html` (контейнер `#cluster-links`), `package.json`

**Interfaces:**
- Consumes: `.build/data.json`, `.build/images.json`, `src/data/clusters.json`,
  `productCardHtml` + `describe*` (Task 2), `PAGE_SIZE` (Task 1), `src/i18n/ru.json` (RU-ярлики).
- Produces: перезаписані `dist/index.html`, `dist/ru/index.html`; дописує `.build/urls.json`.

**Чому крок 7, а не раніше:** генератори кроків 5–6 клонують `dist/index.html`; якби картки
вписались до них, кожен клон тягнув би їх за собою. `replaceMain()` їх виріже, але
коректність не має триматись на цьому.

- [ ] **Step 1: `index.html` — контейнер для блоку посилань**

Всередині секції каталогу, під `.section-head`:
```html
<!-- Блок посилань на хаби/фасети. Наповнюється на білді (scripts/prerender-home.mjs) з
     src/data/clusters.json — у dev лишається порожнім, це нормально. -->
<div class="cluster-links" id="cluster-links"></div>
```

- [ ] **Step 2: `scripts/prerender-home.mjs`**

Для кожної мови (`uk` → `dist/index.html`, `ru` → `dist/ru/index.html`):
1. Замінити вміст `<div class="product-grid" id="tires-grid" …></div>` на `PAGE_SIZE` карток
   з `productCardHtml(describeTire(row, t), images.card, t)` у порядку таблиці; те саме для
   `wheels`.
2. Замінити текст `#tires-count` на `Знайдено: 143` (`Найдено: 143` для RU) і **зрізати з
   цього вузла** `data-i18n="product.loading"` — інакше клієнтський i18n впише
   «Завантаження…» назад.
3. Наповнити `#cluster-links`: «Шини за діаметром: R14 · R15 · R16 · R17 · R18 · R19»,
   «Зимові шини», «Усі шини →», «Литі диски». RU-варіант — з тими ж URL, але з
   префіксом `/ru/` і російськими ярликами з `ru.json`.
4. `load-more`-обгортка лишається `hidden` — клієнт вирішує сам після завантаження даних.

RU-`t` будується з `src/i18n/ru.json` + `ru-meta.json` тим самим способом, що в
`generate-ru-html.mjs` (`(key, uk) => STRINGS[key] ?? uk`), тож ярлики карток («В наличии»,
«Купить») не розходяться з клієнтськими.

**Не збільшувати кількість карток.** Якщо потрібно більше внутрішніх посилань із головної —
інструмент саме блок `#cluster-links`, а не 24 картки: клієнт малює 9, і 24 зіщулились би
до 9 на очах користувача (CLS).

- [ ] **Step 3: `package.json`** — додати `&& node scripts/prerender-home.mjs`.

- [ ] **Step 4: Перевірка — HTML і пост-JS DOM ідентичні**

```bash
npm run build
node -e "const h=require('node:fs').readFileSync('dist/index.html','utf8');console.log('карток:',(h.match(/class=\"product-card\"/g)||[]).length, '| count:', /id=\"tires-count\"[^>]*>([^<]*)/.exec(h)[1])"
grep -c 'product-card"' dist/ru/index.html
npm run preview
```
Очікується: 18 карток (9 шин + 9 дисків), `Знайдено: 143`.

`playwright-cli`: скриншот `/` з увімкненим JS і `--no-javascript` — 9 карток на гріді
шин в обох випадках, ті самі назви в тому самому порядку. Те саме для `/ru/` (картки
російськими ярликами).

- [ ] **Step 5: Коміт**

```bash
git add -A && git commit -m "feat: прередер карток каталогу і блоку посилань на / і /ru/"
```

---

### Task 10: Єдиний генератор `sitemap.xml` і `hreflang` uk-UA/ru-UA

**Files:**
- Create: `scripts/generate-sitemap.mjs`
- Delete: `public/sitemap.xml`
- Modify: `index.html`, `scripts/generate-ru-html.mjs`, `scripts/generate-product-pages.mjs`, `scripts/generate-cluster-pages.mjs`, `scripts/prerender-home.mjs`, `package.json`

**Interfaces:**
- Consumes: `.build/urls.json` — масив `{ loc, lastmod?, changefreq?, priority?, alternates?: {hreflang, href}[], images?: string[] }`.
- Produces: `dist/sitemap.xml`.

**Чому так:** зараз `public/sitemap.xml` містить 2 рукописних записи, а
`generate-product-pages.mjs` дописує перед `</urlset>`. З трьома генераторами це стає
порядко-залежним, тож кожен крок пише свої URL у `.build/urls.json` (корінь репо, у
`.gitignore`, **не** в `dist/` — інакше поїде на прод), а фінальний крок збирає файл цілком.

- [ ] **Step 1: `.build/urls.json` — дописування з кожного кроку**

Хелпер у `scripts/lib/urls.mjs`:
```js
/** Дописує URL у .build/urls.json. Файл створює fetch-data.mjs (порожнім масивом), тож
 *  кожен білд починається з чистого списку — інакше видалені сторінки лишались би в sitemap. */
export function appendUrls(entries) { /* read-modify-write .build/urls.json */ }
```
`fetch-data.mjs` (крок 2) створює `.build/urls.json` = `[]`.
`prerender-home.mjs` дописує `/` і `/ru/` з `xhtml:link`-парами.
`generate-product-pages.mjs` — 159 товарних URL з `image:image`.
`generate-cluster-pages.mjs` — 30 URL з парами `uk-UA`/`ru-UA`/`x-default`.

- [ ] **Step 2: `scripts/generate-sitemap.mjs`**

Читає `.build/urls.json`, дедуплікує за `loc`, сортує (головна → кластерні → товарні), пише
`dist/sitemap.xml` з namespace-ами `xhtml` і `image` (як у поточному файлі). Падає, якщо
список порожній — це означало б, що попередні кроки не виконались, а деплой стер би sitemap.

- [ ] **Step 3: `hreflang` uk-UA/ru-UA по всьому сайту**

`index.html`: `hreflang="uk"` → `uk-UA`, `hreflang="ru"` → `ru-UA` (три `<link rel="alternate">`
у `head` і атрибути `hreflang` на посиланнях перемикача). Вимога аудиту 1.4 — робиться
одним рухом разом із генератором, щоб теги лишились консистентними.
`<html lang="uk">`/`lang="ru"` **не** чіпаємо: `i18n.ts` виставляє
`document.documentElement.lang = getLang()` і розійшовся б із розміткою.

- [ ] **Step 4: `package.json`** — додати `&& node scripts/generate-sitemap.mjs` останнім; видалити `public/sitemap.xml`.

- [ ] **Step 5: Перевірка — усі URL із sitemap існують як файли**

```bash
npm run build
node -e "
const fs=require('node:fs');
const xml=fs.readFileSync('dist/sitemap.xml','utf8');
const locs=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
const missing=locs.filter(l=>{
  const p='dist'+new URL(l).pathname+(l.endsWith('/')?'index.html':'');
  return !fs.existsSync(p);
});
console.log('URL у sitemap:',locs.length,'| відсутні файли:',missing.length, missing.slice(0,10));
"
```
Очікується: `191` URL (2 головні + 159 товарних + 30 кластерних) і `0` відсутніх файлів.

- [ ] **Step 6: Коміт**

```bash
git add -A && git commit -m "build: єдиний генератор sitemap.xml, hreflang uk-UA/ru-UA"
```

---

### Task 11: Документація і фінальна браузерна верифікація

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `SEO.md`

- [ ] **Step 1: `CLAUDE.md` — правило про `src/shared/`**

Три абзаци про «логіка дублюється свідомо» (slug-формула, `describe*`, sheet-URL) стають
неправдою — замінити на:

> **Спільний код клієнта і скриптів живе в `src/shared/*.mjs`** — плейн-ESM без TS-синтаксису,
> бо цей самий файл імпортує і Vite (з `.ts`), і плейн-Node у CI (Node 20 не читає `.ts`).
> Ніяких «свідомих дублікатів» більше немає: `slug.mjs`, `describe.mjs`, `product-card.mjs`,
> `normalize.mjs`, `constants.mjs`, `clusters.mjs`. `tsconfig.json` має `allowJs: true`,
> `checkJs: false` — типи публічних функцій описані JSDoc-ом.

Плюс новий розділ про 8-кроковий конвеєр білда і чому порядок кроків 2, 6→7 не випадковий.

- [ ] **Step 2: `README.md`**

Контракти `src/data/clusters.json` і `src/data/cluster-pages.json`: як додати новий фасет
(рядок у `clusters.json` + ключ у `cluster-pages.json`, інакше білд падає), що поріг N=8 діє
лише на створення, і що видалення URL — завжди ручний акт.

- [ ] **Step 3: `SEO.md`** — оновити перелік URL сайту (191) і зняти пункти, які закриває ця робота.

- [ ] **Step 4: Фінальна верифікація — повний чекліст §9 спеки**

Через `playwright-cli`, у **відрендереному DOM**:

| Що | Де |
|---|---|
| `canonical`, `og:url`, `hreflang`, `title` вціліли після старту `main.js` | `/tires/r16/`, `/ru/tires/r16/` |
| тіло RU-сторінки російською | `/ru/tires/r16/` |
| `BreadcrumbList` є, видимі крихти клікабельні й ведуть на існуючі URL | `/tires/r16/`, сторінка товару |
| перемикач мови веде на двійника, а не на головну | `/tires/r16/` ↔ `/ru/tires/r16/` |
| прередерені 9 карток і пост-JS 9 карток ідентичні | `/`, `/ru/` |
| порожній фасет віддає 200 з «немає в наявності» | зроблено в Task 6, Step 14 |
| усі URL із `dist/sitemap.xml` існують як файли | зроблено в Task 10, Step 5 |

- [ ] **Step 5: Коміт**

```bash
git add -A && git commit -m "docs: src/shared, конвеєр білда, контракти clusters.json"
```

**Ручні перевірки власником після деплою:** Rich Results Test на одну фасетну і одну
товарну сторінку; Search Console → «Перевірка URL» → «Переглянути просканований HTML» на
`/ru/tires/r16/`.

---

## Не в цьому обсязі (Фаза 2)

- бренд-фасети `/tires/sailun/` — після того, як перша партія стане в індекс (Р8);
- RU-версії сторінок товару — потребує відв'язки `generate-ru-html.mjs` від `index.html`;
- `/tires/r15c/`, `/tires/r20/`, `/wheels/stamped/` — коли перетнуть N=8;
- сторінки під точні розміри (`225/65 R17`) — лише якщо асортимент виросте в рази.
