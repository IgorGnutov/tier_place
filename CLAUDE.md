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
npm run build           # vite build → scripts/generate-ru-html.mjs → scripts/generate-product-pages.mjs
npm run preview         # preview built dist/
npm run typecheck       # tsc --noEmit
npm run optimize:photos # scripts/optimize-photos.mjs — generate AVIF/WebP/JPEG at 480/768/1200/1920px
```

There is no test suite/framework configured in this repo — `typecheck` is the only automated check.
There is no linter configured either.

## Architecture

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
- `scripts/generate-product-pages.mjs` runs last in `npm run build`. It fetches the same tires/wheels
  sheet CSVs the browser does, then for every row clones the already-built `dist/index.html`, swaps
  the inside of `<main id="main">` for that product's markup, patches the `<head>` SEO tags, and
  writes `dist/<kind>/<slug>/index.html` — the same clone-and-patch technique
  `scripts/generate-ru-html.mjs` uses for `/ru/`. It also appends one `<url>` per product to
  `dist/sitemap.xml`. There is no dev preview of these pages (`npm run dev` won't show them), same
  as for `/ru/`.
- A fetch failure (network, HTTP error, or Google returning its HTML login page instead of CSV) is
  **fatal** — the script exits non-zero before writing anything. This is deliberate: the deploy
  action delete-syncs `dist/` onto the server, so a "successful" build with zero product pages would
  wipe every already-published product page off the live site. An empty-but-reachable sheet (0 rows)
  is a legitimate non-fatal case and does exactly that, by design.
- **Product photo optimization (`buildProductImageAssets` in `generate-product-pages.mjs`):**
  product photos are arbitrary external URLs pasted into the sheet (postimg.cc etc. — see the CSP
  note above) and are never resized/compressed at the source. Public image-resize proxies
  (wsrv.nl/images.weserv.nl, statically.io) were tried and rejected — they block postimg.cc by
  policy or have disabled their proxy endpoint outright, so depending on one in production would be
  fragile. Instead, the build downloads every *distinct* `image_url` once (many rows share one stock
  photo per model) and re-encodes it with `sharp` into local AVIF/WebP/JPEG at two widths: 480px
  (`CARD_WIDTH`, written to `dist/data/product-images.json` — a manifest the client-rendered catalog
  fetches at runtime, see `src/js/product-images.ts`/`render-products.ts`) and 900px (`DETAIL_WIDTH`,
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
- **Slug formula and CSV-row→title/specs mapping are duplicated on purpose.** `src/js/slug.ts`
  (client, links the catalog cards) and the plain-JS copies inside `generate-product-pages.mjs`
  (Node 20 in CI cannot import `.ts`, and adding a transpiler for one script isn't worth it) must
  stay identical — same as the sheet-column-name sync obligation below. Changing the slug parts, the
  transliteration table, or `describeTire`/`describeWheel` vs `tiresDescribe`/`wheelsDescribe` in one
  place *requires* the same edit in the other, or catalog cards will link to URLs that were never
  generated.

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
- Known placeholders not yet filled in by the site owner: `CONTACTS.hoursNote` (approximate) —
  see `SEO.md` for the full list before "finalizing" anything domain- or contact-related. The production domain is `tire-place.com.ua` (hosted at adm.tools,
  deployed via `.github/workflows/deploy.yml` on push to `main`), already set in `index.html` SEO
  tags, `public/robots.txt`, and `public/sitemap.xml`.
