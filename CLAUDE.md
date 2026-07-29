# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TIRE PLACE — a single-page static landing site for a tire/wheel/battery shop in Kryvyi Rih, Ukraine
(Vite + vanilla TypeScript, no framework, no backend). Product/service data is fetched client-side
as CSV from published Google Sheets, with local demo CSVs as fallback. Primary language for code
comments, commit-facing docs, and UI copy is Ukrainian — match that when editing existing files.

## Commands

```bash
npm install
npm run dev             # Vite dev server
npm run build           # build to dist/
npm run preview         # preview built dist/
npm run typecheck       # tsc --noEmit
npm run optimize:photos # scripts/optimize-photos.mjs — generate AVIF/WebP/JPEG at 480/768/1200/1920px
```

There is no test suite/framework configured in this repo — `typecheck` is the only automated check.
There is no linter configured either.

## Architecture

**Data flow (Google Sheets → CSV → render):**
- `src/config.ts` is the single place for Google Sheet URLs, contact info, and cache TTL. An empty
  `SHEET_*_CSV` string means "use only the local demo CSV" (see `sheetCsvUrl()`).
- `src/js/sheets.ts` (`loadCsv`) fetches the sheet CSV, caching successful parses in
  `sessionStorage` for `SHEET_CACHE_TTL_MS` (5 min). On any failure — network error, HTTP error, or
  Google returning an HTML login page (public sharing not enabled) — it falls back to the local CSV
  in `public/data/`. An empty-but-reachable sheet (0 data rows) is treated the same as unreachable.
  Callers get back `{ rows, source: 'sheet'|'local'|'cache', error }`; `render-products.ts` and
  `render-service.ts` use a non-null `error` to show a "showing demo data" warning next to the count
  even when rows rendered successfully from the fallback.
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
- `src/js/render-service.ts` renders the tire-fitting price list similarly (table on wide screens,
  cards on narrow).
- Buy actions build a `t.me/<user>?text=...` deep link (`buildTelegramLink` in config.ts) with a
  prefilled message; because `?text=` prefill isn't reliable in every Telegram client for private
  chats, every buy button is paired with a "copy request text" fallback button (`telegram.ts`).

**Static asset handling — why `public/` matters here:**
Vite only auto-copies assets it can statically discover (`<img src>`, `import`). The hero slider
(`src/js/hero-slider.ts`) builds image paths at runtime as strings (`` `${base}-${width}.${ext}` ``
for responsive AVIF/WebP/JPEG sources), which Vite's static analysis can't see. So anything
referenced *dynamically* — slider photos and the demo/fallback CSVs — must live under `public/`
(copied verbatim into `dist/`), not under `src/` or a bare top-level `assets/`/`data/`. When adding
new dynamically-referenced files, put them in `public/`.

The first slide in `src/data/gallery.ts` is the LCP image and is duplicated as a real, eager
`<img>` in `index.html` (plus a `<link rel="preload">` in `<head>`) for fast first paint. If you
reorder slides so a different photo becomes first, update both of those `index.html` spots to match.

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
- Known placeholders not yet filled in by the site owner: `CONTACTS.instagramUrl` (`#`),
  `CONTACTS.hoursNote` (approximate), and the `tireplace.com.ua` domain placeholder used across
  `index.html` SEO tags, `public/robots.txt`, and `public/sitemap.xml` — see `SEO.md` for the full
  list before "finalizing" anything domain- or contact-related.
