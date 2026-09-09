# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TIRE PLACE — a single-page static landing site for a tire/wheel/battery shop in Kryvyi Rih, Ukraine
(Vite + vanilla TypeScript, no framework, no backend). Product/service data (tires/wheels) is
fetched client-side as CSV from published Google Sheets, live-only — no local demo CSV. The
"Контент" text-override sheet still has a local demo CSV fallback. Primary language for code
comments, commit-facing docs, and UI copy is Ukrainian — match that when editing existing files.

## Commands

```bash
npm install
npm run dev             # Vite dev server
npm run build           # 8-кроковий конвеєр, див. "Build pipeline" нижче
npm run preview         # preview built dist/
npm run typecheck       # tsc --noEmit
npm run optimize:photos # scripts/optimize-photos.mjs — generate AVIF/WebP/JPEG at 480/768/1200/1920px
```

There is no test suite/framework configured in this repo — `typecheck` is the only automated check.
There is no linter configured either.

## Architecture

**Build pipeline — 8 кроків, порядок трьох із них не випадковий:**

```
1. vite build                                → dist/index.html, dist/admin/
2. node scripts/fetch-data.mjs               → .build/data.json      (ФАТАЛЬНО при помилці)
3. node scripts/build-product-images.mjs     → dist/data/product-images.json + .build/images.json
4. node scripts/generate-ru-html.mjs         → dist/ru/index.html    (RU-оболонка)
5. node scripts/generate-product-pages.mjs   → dist/{tires,wheels}/<slug>/
6. node scripts/generate-cluster-pages.mjs   → хаби, фасети, послуги (UA + RU)
7. node scripts/prerender-home.mjs           → картки в dist/index.html і dist/ru/index.html
8. node scripts/generate-sitemap.mjs         → dist/sitemap.xml
```

- **Крок 2 — один фетч Sheets на весь білд.** Три незалежних звернення давали реальний шанс, що
  сторінки одного білда побудуються з різних знімків прайсу (власник редагує таблицю під час
  деплою). Фатальна перевірка «таблиця недоступна» живе тут і спрацьовує **до** запису будь-яких
  файлів у `dist/` — delete-sync деплой інакше стер би вже опубліковані сторінки.
- **Прередер — крок 7, після генераторів.** Кроки 4–6 клонують `dist/index.html`; якби картки
  вписались раніше, кожен клон тягнув би їх за собою. `replaceMain()` їх виріже, але коректність
  не має триматись на цьому. Крок чіпає обидві мови: картки в `dist/ru/index.html` потребують
  російських ярликів.
- **Sitemap — крок 8, з накопичувача.** Кроки 5–7 лише **дописують** свої URL у `.build/urls.json`
  (корінь репо, у `.gitignore`, свідомо **не** в `dist/`), а фінальний крок віддає файл цілком.
  Раніше `public/sitemap.xml` містив рукописні записи, а генератор дописував перед `</urlset>` —
  із трьома генераторами це стало порядко-залежним. `public/sitemap.xml` більше немає.
- Проміжні артефакти — тільки в `.build/`. Ніякого dev-прев'ю кроків 4–8 (`npm run dev` їх не
  показує).

**Спільний код клієнта і скриптів — `src/shared/*.mjs`:**
Плейн-ESM **без TS-синтаксису**, бо ті самі файли імпортує і Vite (з `.ts`), і плейн-Node у CI
(Node 20 не читає `.ts`). Це не стиль, а вимога: раніше slug-формула й мапінг «рядок CSV →
назва/характеристики» були свідомо продубльовані між клієнтом і генератором — тепер копій немає.
`tsconfig.json` має `allowJs: true`, `checkJs: false` (strict-перевірка плейн-JS дала б шум без
користі); типи публічних функцій описані JSDoc-ом.

| Файл | Що в ньому |
|---|---|
| `constants.mjs` | `PAGE_SIZE` (9 — спільна для клієнта і прередера), `SITE_URL` |
| `normalize.mjs` | канонізація значень фасетних полів (кирилична `С` → латинська `C`) |
| `slug.mjs` | `slugify`/`tireSlug`/`wheelSlug`/`dedupeSlugs` — **рахуються з сирих значень**, без `normalize` (159 URL уже опубліковані) |
| `describe.mjs` | `describeTire`/`describeWheel(row, t)` — `t` параметр, бо скрипт передає UA-заглушку, клієнт свій `t` з `i18n.ts` |
| `product-card.mjs` | `productCardHtml(info, manifest, t)` — картка як рядок HTML |
| `clusters.mjs` | фасети, поріг, розкладка рядків, крихти, інваріанти |
| `csv-values.mjs`, `html-escape.mjs` | `parsePrice`/`parseBool`, `escapeHtml`/`escapeAttr` |

`scripts/lib/*.mjs` — те саме для скриптів між собою: `html-patch.mjs` (патч клонованого HTML),
`sheets.mjs`, `build-dir.mjs`, `urls.mjs`, `cluster-links.mjs`.

**Data flow (Google Sheets → CSV → render):**
- `src/config.ts` is the single place for Google Sheet URLs, contact info, and cache TTL. An empty
  `SHEET_CONTENT_CSV` string means "use only the local demo CSV" (see `sheetCsvUrl()`);
  `SHEET_TIRES_CSV`/`SHEET_WHEELS_CSV` have no such local fallback (see below). The raw
  `spreadsheetId`/`gids` live in `src/data/sheet-ids.json`; `config.ts` imports that JSON and builds
  the export URLs from it, so `scripts/generate-product-pages.mjs` (plain Node, can't import `.ts`)
  can read the same IDs. Edit the IDs in the JSON, everything else in `config.ts`.
- `src/js/sheets.ts` exports two loaders. `loadLiveCsv(sheetUrl)` fetches only the live sheet
  (caching successful parses in `sessionStorage` for `SHEET_CACHE_TTL_MS`, 5 min) and on any
  failure — network error, HTTP error, Google returning an HTML login page (public sharing not
  enabled), or an empty-but-reachable sheet (0 data rows) — returns `source: 'error'`, never
  falling back to anything. `render-products.ts` (tires/wheels catalogs) uses this exclusively:
  product data must always come from the live sheet; on failure it shows an explicit
  "Товари на даний момент не доступні" error state with a retry button. There is no local demo CSV
  for tires/wheels at all (removed on purpose — it was never reachable in practice and only caused
  confusion about which data was "real"). `loadCsv(sheetUrl, localUrl)` keeps the old
  fetch-then-fall-back-to-local-file behavior and is used only by `content.ts`/`admin/content-tab.ts`
  (the "Контент" sheet) — a soft text-override feature, not product data, where falling back to a
  locally bundled default is fine.
- `public/.htaccess` sets a CSP; `connect-src` must include `https://*.googleusercontent.com`
  (the Sheets CSV export redirect target) and `img-src` must allow arbitrary `https:` hosts (product
  photo URLs pasted into the sheet can point anywhere, e.g. postimg.cc) — tightening either silently
  breaks sheet loading or product photos without throwing any visible error.
- `src/js/csv.ts` wraps Papa Parse (BOM stripping, header/value trimming) plus `parsePrice` /
  `parseBool` normalizers so sheet columns can contain messy human input (`"1 200 грн"`, `так/ni`,
  `+/-`, etc).
- `src/js/filters.ts` implements generic *dependent* select filtering: `optionsForField` computes
  the options for one field based on rows matching every *other* currently-selected field, so
  choosing a value in one dropdown narrows what's selectable in the others. Filter state also
  round-trips through URL query params (`readStateFromUrl`/`writeStateToUrl`, prefixed per catalog
  e.g. `tires_brand=...`) so filtered views are shareable/bookmarkable.
- `src/js/render-products.ts` (`initCatalogs`) drives both the tires and wheels catalogs through one
  generic `initCatalog(config)` — `CatalogConfig` supplies the DOM id prefix, sheet/local URLs,
  `FieldDef[]` for that catalog's filterable columns, and a `describe(row)` function that maps a raw
  CSV row into card content (title, specs, price, stock, prebuilt Telegram message text). Adding a
  new filterable column means adding to `TIRES_FIELDS`/`WHEELS_FIELDS` and to the corresponding
  Google Sheet header row — no other catalog logic needs to change.
  Also owns the Tires/Wheels tab switcher (`initCatalogTabs`), which toggles panel visibility and
  syncs `#tires`/`#wheels` hash navigation from the header menu.
- `src/js/render-service.ts` wires up the tire-fitting/battery CTA buttons with prefilled Telegram
  links — the service section has no price table, just description + "book" button.
- The service/battery CTA buttons are the only remaining direct-Telegram actions: `render-service.ts`
  just sets their `.href` to a `t.me/<user>?text=...` deep link (`buildTelegramLink` in config.ts)
  with a prefilled message — no copy-to-clipboard fallback button anywhere. Note `?text=` prefill
  isn't reliable in every Telegram client for private chats, so the message may not appear
  pre-typed. Product "Купити" buttons no longer use Telegram at all — see the next bullet.
- **Cart & checkout:** `src/js/cart.ts` holds cart state (`localStorage`-backed, one cart shared
  across tires/wheels) with `addItem`/`updateQty`/`removeItem`/`onChange` subscription.
  `src/js/cart-ui.ts` renders the header cart icon/badge and the slide-out drawer with the
  checkout form (name, phone, delivery method — pickup or Nova Poshta with city/branch —
  optional comment). `render-products.ts`'s "Купити" button calls `cart.addItem()` (no longer a
  direct Telegram link). Checkout POSTs through `src/js/order-api.ts` to the same Apps Script Web
  App as `/admin` (`CONTENT_API_URL`), which appends a row to a "Замовлення" sheet and relays the
  order to a Telegram bot chat — see `README.md`, "Кошик і замовлення", for the bot setup steps
  and the sheet's exact column contract.

**Product detail pages (`/tires/<slug>/`, `/wheels/<slug>/`) — generated at build time, not
client-rendered:**
- `scripts/generate-product-pages.mjs` (крок 5) читає `.build/data.json`, потім для кожного рядка
  клонує вже зібраний `dist/index.html`, замінює вміст `<main id="main">` на розмітку товару,
  патчить SEO-теги в `<head>` і пише `dist/<kind>/<slug>/index.html` — той самий прийом
  clone-and-patch, що `scripts/generate-ru-html.mjs` для `/ru/`. Свої URL дописує в
  `.build/urls.json` (крок 8 збирає sitemap). Dev-прев'ю цих сторінок немає.
- Фетч більше не тут: помилка завантаження таблиці — фатальна на **кроці 2**
  (`scripts/fetch-data.mjs`), до запису будь-яких файлів. Порожня, але доступна таблиця (0 рядків)
  — валідний стан, обробляється саме так за задумом.
- **Видимі крихти + `BreadcrumbList`:** `Головна → Шини → R15 → назва`, де ланка фасета присутня,
  якщо для товару є закріплена фасетна сторінка (`facetForProduct` у `src/shared/clusters.mjs`; для
  R13/R20, у яких немає свого діаметра-фасета, підставляється сезонний). Раніше середня ланка вела
  на `https://tire-place.com.ua/#tires` — якір головної, а не документ. JSON-LD будується з того
  самого переліку, що видимий на сторінці — цього прямо вимагає Google.
- **Product photo optimization (`scripts/build-product-images.mjs`, крок 3):**
  product photos are arbitrary external URLs pasted into the sheet (postimg.cc etc. — see the CSP
  note above) and are never resized/compressed at the source. Public image-resize proxies
  (wsrv.nl/images.weserv.nl, statically.io) were tried and rejected — they block postimg.cc by
  policy or have disabled their proxy endpoint outright, so depending on one in production would be
  fragile. Instead, the build downloads every *distinct* `image_url` once (many rows share one stock
  photo per model) and re-encodes it with `sharp` into local AVIF/WebP/JPEG at two widths: 480px
  (`CARD_WIDTH` → `dist/data/product-images.json` — a manifest the client-rendered catalog
  fetches at runtime, see `src/js/product-images.ts`/`render-products.ts`) and 900px (`DETAIL_WIDTH` → `.build/images.json`,
  embedded directly as a `<picture>` in the generated detail HTML, also used for `og:image`/
  `twitter:image`/JSON-LD `image` so social scrapers don't depend on postimg.cc staying up). A
  source narrower than a target width is not upscaled (both widths collapse to one file set). A
  failure on one photo (dead link, unsupported format) is non-fatal — it's logged and that product
  falls back to hotlinking the original URL, same as before this existed. `public/data/product-images.json`
  ships a `{}` stub so `npm run dev`/local preview don't 404 on the manifest fetch; the real build
  overwrites it in `dist/`.
- The generated pages load the shared, unmodified `main.js`, which mutates `<head>` on startup:
  `i18n.ts`'s `updateHeadForLang()` rewrites `#canonical-link`/`#og-url-meta` to the homepage URL,
  and `applyStaticTranslations()` overwrites anything carrying `data-i18n`/`data-i18n-attr`. The
  generator therefore *strips* those hooks (`id="canonical-link"`, `id="og-url-meta"`,
  `data-i18n-attr="content:meta.*"`, `data-lang-link`) so the build-time tags survive in the rendered
  DOM Google indexes. If you add a new `<head>` tag that `main.js` touches by id or `data-i18n*`,
  strip it there too — and verify in the rendered DOM (DevTools/Playwright), never in view-source.
  For the same reason nav anchors get rewritten from `href="#tires"` to `href="/#tires"`: a bare hash
  points at homepage sections that don't exist here, and `initCatalogTabs`'s
  `a[data-nav-link][href="#wheels"]` handler would otherwise swallow the click.
- Slug-формула і мапінг «рядок CSV → назва/характеристики» **більше не дублюються**: обидві живуть
  у `src/shared/slug.mjs` і `src/shared/describe.mjs`, а картку в обох місцях малює одна
  `src/shared/product-card.mjs`. Див. «Спільний код клієнта і скриптів» вище.

**Кластерні сторінки (хаби, фасети, послуги) — 15 UA × 2 мови = 30 URL:**
- `scripts/generate-cluster-pages.mjs` (крок 6) генерує `/tires/`, `/wheels/` (хаби),
  `/tires/winter/`, `/tires/r14…r19/`, `/wheels/cast/` (фасети) і 5 контентних сторінок
  (`/shynomontazh/`, `/farbuvannya-dyskiv/`, `/zberihannya-shyn/`, `/akumulyatory/`,
  `/kontakty/`) плюс RU-дзеркала під `/ru/`. UA-сторінки клонуються з `dist/index.html`, RU —
  з **уже перекладеної** `dist/ru/index.html`, тому хедер/футер/базові meta там уже російські.
  Звідси й порядок кроків: 6 після 4.
- **Розмітка каталогу не дублюється, а вирізається з оболонки** (`extractCatalogPanel`): панель
  `<div class="tab-panel" id="tires">` разом із фільтрами, сортуванням, чипсами, грідом і
  «показати ще». Ids збігаються з головною, тож клієнтський `initCatalog` підхоплює фасетну
  сторінку без жодних змін, а правка фільтрів в `index.html` автоматично доїжджає сюди.
  `role="tabpanel"`/`aria-labelledby` зрізаються (tablist тут немає), `is-active` додається
  обов'язково — `.tab-panel` без нього має `display: none`.
- **Дві JSON-таблиці даних, обидві в `src/data/`:**
  - `clusters.json` — **закріплені URL** фасетів. Поріг `FACET_THRESHOLD = 8` товарів діє лише на
    *створення*: сторінка, що вже є у файлі, генерується **завжди**, навіть із 0 товарів
    («зараз немає в наявності» + сусідні розміри, HTTP 200) — проіндексований URL мусить
    лишатись живим. Нове значення ≥ порогу білд підказує в лог **і в `$GITHUB_STEP_SUMMARY`**,
    але сторінку не створює: закріплення URL — завжди свідомий ручний акт. Видалення рядка =
    зникнення URL із сайту.
  - `cluster-pages.json` — тексти (`slug`, `linkLabel`, `h1`, `title`, `description`, `intro`,
    `faq`, для послуг `serviceType`), окремо на кожну мову. `slug` — **повний** відносний шлях
    без слешів по краях; у контентних сторінок UA і RU слаги різні
    (`farbuvannya-dyskiv` / `pokraska-diskov`), у товарних однакові. **Відсутній ключ для
    сторінки, яку треба згенерувати → білд падає** з переліком.
- Фасетні поля — тільки `season` і `diameter` для шин, `type` для дисків (`FACET_FIELDS`). Решта
  колонок лишаються клієнтськими фільтрами: за 143 рядками сторінка під точний розмір дала б
  1–3 товари, тобто thin content. Бренд-фасети — окрема фаза (найволатильніше поле прайсу).
- **Фасет як початковий стан фільтра:** сторінка віддає `data-facet-field`/`data-facet-value` на
  формі, `initCatalog` стартує з ним, показує в чипсах і **дозволяє зняти**. Знімання фіксується
  параметром `<prefix>_facet=off` — інакше фасет повертався б після перезавантаження, а шароване
  «без фільтра» посилання показувало б фільтр. `canonical` при цьому не змінюється: це той самий
  документ з іншим станом фільтра.
- **Дві пастки в даних, обидві закриті інваріантами, що валять білд:**
  1. `16С` (кирилична С) і `16C` (латинська) — одне значення; `src/shared/normalize.mjs`
     канонізує, і це заодно вилікувало наявний баг фільтра «Діаметр» (два пункти-двійники).
     Slug-формула нормалізацію **не** застосовує — 159 URL уже опубліковані.
  2. Слаги фасетів і товарів в одному просторі імен (`/tires/r16/` і `/tires/sailun-…-r16-zyma/`);
     `assertNoSlugCollisions` валить білд із назвами обох сторінок.
- **`hreflang` тут переписується, а не зрізається** (на сторінках товару — навпаки): власна
  взаємна пара `uk-UA`/`ru-UA`/`x-default`. Уся решта сайту теж на `uk-UA`/`ru-UA`; `<html lang>`
  свідомо лишається `uk`/`ru`, бо `i18n.ts` виставляє `document.documentElement.lang = getLang()`
  і розійшовся б із розміткою.
- **Перемикач мови на цих сторінках — справжня навігація** `/tires/r16/` ↔ `/ru/tires/r16/`, а не
  JS-переклад на місці: текст живе в `cluster-pages.json`, якого клієнтський i18n не знає, тож він
  залишив би опис російським на UA-сторінці. Наслідок, прийнятий свідомо: поведінка перемикача на
  головній і на кластерних сторінках різна.
- **JSON-LD:** зрізаються `Service`/`FAQPage`/`BreadcrumbList` головної, лишається
  `AutoPartsStore`, додається власний `BreadcrumbList`; на сторінках послуг ще `Service` з
  `provider` і `areaServed: Кривий Ріг`. Свідомо **не** додаємо `FAQPage` (з серпня 2023 Google
  показує FAQ-rich-results лише авторитетним урядовим і медичним сайтам — видимий FAQ лишаємо,
  схему ні), `ItemList`/`CollectionPage` (товари знаходяться по звичайних `<a href>`) і
  `aggregateRating` (див. `SEO.md`).
- **Головна структурно не змінюється** (Р3 дизайну): меню лишається на якорях `#tires`/`#wheels`,
  інакше секція каталогу на головній стала б недосяжною з меню. `/tires/` досяжний із блоку
  посилань `#cluster-links` і з крихт. Розведення з головною — через `title`/`H1`/текст.

**Static asset handling — why `public/` matters here:**
Vite only auto-copies assets it can statically discover (`<img src>`, `import`). The hero slider
(`src/js/hero-slider.ts`) builds image paths at runtime as strings (`` `${base}-${width}.${ext}` ``
for responsive AVIF/WebP/JPEG sources), which Vite's static analysis can't see. So anything
referenced *dynamically* — slider photos and the "Контент" demo/fallback CSV — must live under `public/`
(copied verbatim into `dist/`), not under `src/` or a bare top-level `assets/`/`data/`. When adding
new dynamically-referenced files, put them in `public/`.

The first slide in `src/data/gallery.ts` is the LCP image and is duplicated as a real, eager
`<img>` in `index.html` (plus a `<link rel="preload">` in `<head>`) for fast first paint. If you
reorder slides so a different photo becomes first, update both of those `index.html` spots to match.
(Product detail pages have no hero, so the generator drops that preload `<link>` from its clones.)

**Двомовність (`/` UA + `/ru/`) — RU перекладається на білді, не лише в рантаймі:**
- Рядки живуть у трьох JSON, і це свідомо JSON, а не `.ts`: їх читає і клієнт, і плейн-Node
  скрипт (Node 20 у CI не може імпортувати `.ts`, як і для `generate-product-pages.mjs`).
  `src/i18n/ru.json` — тіло сторінки (`data-i18n` / `data-i18n-html` / `data-i18n-attr`),
  `src/i18n/ru-meta.json` — `head`/`meta.*`, `src/i18n/ru-content.json` — RU-бейзлайни блоків
  `data-content-key` (ключ = ключ у `CONTENT_REGISTRY`). `src/i18n/strings.ts` лише зливає перші
  два в `RU_STRINGS`; `content-registry.ts` підмішує третій у `defaultHtmlRu` кожного блоку.
  Додаючи ключ у розмітку — додай переклад у відповідний JSON, інакше вузол лишиться українським
  (це не помилка, а дефолт: «слово однакове в обох мовах»).
- `scripts/generate-ru-html.mjs` бере `dist/index.html` і віддає `dist/ru/index.html` **уже
  перекладеним у HTML** — і `head`, і тіло. Це не косметика: Googlebot індексує з затримкою й не
  гарантує виконання JS, а соцботи не виконують його взагалі, тож доки перекладався лише `head`,
  сторінка під «шины Кривой Рог» не містила в тексті ні «шины», ні «Кривой Рог».
- Клієнтський i18n лишається робочим **поверх** цього. Щоб перемикач RU → UA не закешував
  російський текст як «оригінал» і не залишив сторінку російською, генератор проставляє UA-оригінал
  у ті самі атрибути, які `i18n.ts`/`content.ts` читають першими: `data-i18n-original`,
  `data-i18n-orig-<attr>`, `data-content-original`. Тому клієнтського коду цей крок не потребує —
  але якщо мінятимеш назви цих кеш-атрибутів у `i18n.ts`/`content.ts`, зміни їх і в генераторі.
- Генератор збирає всі правки по незміненому HTML і застосовує їх з кінця (інакше вставлений
  `data-i18n-original="&lt;span data-i18n=…"` наступний прохід прийняв би за справжній хук), падає
  на перетині діапазонів (перекладений вузол усередині іншого перекладеного вузла) і падає, якщо
  якийсь прохід не переклав жодного вузла — інакше перейменований хук молча віддав би українську
  сторінку під RU-мета, тобто рівно той баг, який тут вилікували.
- `<h1>` віддано під ключовий запит («Шини та диски в Кривому Розі» / `hero.h1`), а назва бренду
  свідомо лишається поза `<h1>` — у `.hero__brand`. Не повертай бренд у `<h1>`.

**Other modules:** `nav.ts` (burger menu, active-link highlighting, header shadow on scroll),
`hero-slider.ts` (vanilla crossfade slider — autoplay, swipe, ARIA), `map.ts` (lazy-inserts the
Google Maps iframe so it doesn't block initial load). `src/main.ts` is the single entry point that
wires up every module's `init*()` function.

**Styling:** plain CSS (Grid/Flexbox/custom properties/`clamp()`, no Tailwind/Bootstrap), split by
section under `src/styles/` and assembled via `src/styles/main.css`. `src/styles/variables.css`
holds shared tokens.

`vite.config.ts` uses `base: './'` (relative asset paths) so the same build works unmodified at a
domain root (Netlify/Cloudflare Pages) or in a GitHub Pages repo subpath.

## Content/config that lives in one place

- **Contacts, socials, map, hours, sheet URLs:** `src/config.ts` — always edit here, not scattered
  across `index.html`.
- **Sheet column contracts:** the exact header names each CSV must have (tires/wheels/service) are
  documented in `README.md` — changing a `describe()`/`FieldDef` key in code must stay in sync with
  the corresponding Google Sheet header, since sheet data is read by header name.
- **Фасетні URL і тексти кластерних сторінок:** `src/data/clusters.json` (які URL існують) і
  `src/data/cluster-pages.json` (уся їхня копія, UA+RU). Додати фасет = рядок у першому **і** ключ
  у другому, інакше білд падає. Порядок сторінок у блоці перелінковки — `CONTENT_PAGE_KEYS` у
  `scripts/lib/cluster-links.mjs`.
- Opening hours are confirmed (daily 9:00-17:00); the "(графік уточнювати)" note in
  `CONTACTS.hoursNote` is deliberate — the owner does occasionally shift them. The same interval is
  duplicated in `index.html`'s `openingHoursSpecification` JSON-LD, so change both together.
  See `SEO.md` for the full list of remaining placeholders before "finalizing" anything domain- or
  contact-related. The production domain is `tire-place.com.ua` (hosted at adm.tools,
  deployed via `.github/workflows/deploy.yml` on push to `main`), already set in `index.html` SEO
  tags і `public/robots.txt`. `sitemap.xml` тепер генерується цілком
  (`scripts/generate-sitemap.mjs`), рукописного файлу в `public/` немає.
