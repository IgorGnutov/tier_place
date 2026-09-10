// Крок 7 конвеєра: вписує товарні картки й блок посилань на фасети в HTML головної — і в
// dist/index.html, і в dist/ru/index.html.
//
// Закриває блокер аудиту: у HTML головної товарів не було взагалі (у гріді стояло
// «Завантаження…», а картки домальовував клієнт), тобто Googlebot і соцботи бачили сторінку
// без жодного товару.
//
// ЧОМУ КРОК 7, А НЕ РАНІШЕ: generate-ru-html.mjs і генератори сторінок клонують
// dist/index.html. Якби картки вписались до них, кожен клон тягнув би їх за собою.
// replaceMain() їх виріже, але коректність не має триматись на цьому.
//
// РІВНО PAGE_SIZE = 9 карток у порядку таблиці — стільки ж малює клієнт за замовчуванням, тож
// прередерений і пост-JS грід ідентичні. Збільшувати кількість не треба: 24 картки зіщулились
// би до 9 на очах користувача (CLS). Якщо потрібно більше внутрішніх посилань із головної —
// інструмент саме блок #cluster-links, а не грід.
import { readFileSync, writeFileSync } from 'node:fs';
import { root, readBuildJson } from './lib/build-dir.mjs';
import { appendUrls } from './lib/urls.mjs';
import { clusterLinksHtml, langPrefix } from './lib/cluster-links.mjs';
import { makeT } from './lib/i18n.mjs';
import { SITE_URL, PAGE_SIZE } from '../src/shared/constants.mjs';
import { describeTire, describeWheel } from '../src/shared/describe.mjs';
import { productCardHtml } from '../src/shared/product-card.mjs';
import { dedupeSlugs, tireSlug, wheelSlug } from '../src/shared/slug.mjs';
import { escapeHtml } from '../src/shared/html-escape.mjs';

const LABEL = 'prerender-home';

const data = readBuildJson('data.json', 'scripts/fetch-data.mjs');
const images = readBuildJson('images.json', 'scripts/build-product-images.mjs');

const CATALOGS = [
  { kind: 'tires', rows: data.tires, slugOf: tireSlug, describe: describeTire },
  { kind: 'wheels', rows: data.wheels, slugOf: wheelSlug, describe: describeWheel },
];

/**
 * @param {string} html
 * @param {'tires'|'wheels'} kind
 * @param {string} cardsHtml
 * @returns {string}
 */
function fillGrid(html, kind, cardsHtml) {
  const gridOpen = `<div class="product-grid" id="${kind}-grid" aria-live="polite">`;
  if (!html.includes(`${gridOpen}</div>`)) {
    throw new Error(`порожній грід #${kind}-grid не знайдено — прередер уже застосований або index.html змінився`);
  }
  return html.replace(`${gridOpen}</div>`, `${gridOpen}${cardsHtml}</div>`);
}

/**
 * Готове число замість «Завантаження…» + зрізаний data-i18n="product.loading" з цього вузла.
 * Без зрізання клієнтський applyStaticTranslations() впише «Завантаження…» назад одразу після
 * старту JS — тобто прередер було б видно лише до першого кадру після виконання скрипта.
 * @param {string} html @param {'tires'|'wheels'} kind @param {string} text @returns {string}
 */
function fillCount(html, kind, text) {
  const re = new RegExp(`<span id="${kind}-count"([^>]*)>[^<]*</span>`);
  if (!re.test(html)) throw new Error(`#${kind}-count не знайдено в index.html`);
  return html.replace(re, (_m, attrs) => {
    const clean = attrs
      .replace(/ data-i18n="product\.loading"/, '')
      .replace(/ data-i18n-original="[^"]*"/, '');
    return `<span id="${kind}-count"${clean}>${escapeHtml(text)}</span>`;
  });
}

/** @param {string} lang @param {string} file */
function prerender(lang, file) {
  const t = makeT(lang);
  let html = readFileSync(file, 'utf8');

  for (const catalog of CATALOGS) {
    const slugs = dedupeSlugs(catalog.rows, catalog.slugOf);
    const cards = catalog.rows
      .slice(0, PAGE_SIZE)
      .map((row, i) =>
        productCardHtml(
          // Посилання мусить лишатись у поточній мові: картка в dist/ru/index.html веде на
          // /ru/tires/<slug>/, інакше клік із RU-головної відкривав би українську сторінку
          // товару (мова визначається виключно зі шляху — див. i18n.ts getLang()).
          catalog.describe(
            { ...row, __detailUrl: slugs[i] ? `${langPrefix(lang)}/${catalog.kind}/${slugs[i]}/` : '' },
            t
          ),
          images.card,
          t
        )
      )
      .join('');
    html = fillGrid(html, catalog.kind, cards);
    html = fillCount(html, catalog.kind, `${t('product.foundLabel', 'Знайдено')}: ${catalog.rows.length}`);
  }

  const placeholder = '<div id="cluster-links"></div>';
  if (!html.includes(placeholder)) throw new Error('немає контейнера <div id="cluster-links"></div> в index.html');
  // currentPath = '' — на головній жодне посилання блоку не "поточне".
  html = html.replace(placeholder, () => clusterLinksHtml('', lang, t));

  writeFileSync(file, html);
  return html;
}

function main() {
  prerender('uk', `${root}dist/index.html`);
  prerender('ru', `${root}dist/ru/index.html`);

  const alternates = [
    { hreflang: 'uk-UA', href: `${SITE_URL}/` },
    { hreflang: 'ru-UA', href: `${SITE_URL}/ru/` },
    { hreflang: 'x-default', href: `${SITE_URL}/` },
  ];
  appendUrls([
    { loc: `${SITE_URL}/`, changefreq: 'weekly', priority: '1.0', alternates },
    { loc: `${SITE_URL}/ru/`, changefreq: 'weekly', priority: '0.9', alternates },
  ]);

  console.log(
    `${LABEL}: вписано по ${PAGE_SIZE} карток у кожен грід ` +
      `(шини ${data.tires.length}, диски ${data.wheels.length}) в / і /ru/.`
  );
}

try {
  main();
} catch (err) {
  console.error(`${LABEL}: ${err.message}`);
  process.exitCode = 1;
}
