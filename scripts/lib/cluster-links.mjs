// Блок перелінковки на хаби, фасети й сторінки послуг. Спільний для двох кроків конвеєра:
// generate-cluster-pages.mjs вставляє його в кожну кластерну сторінку, а prerender-home.mjs —
// у секцію каталогу на головній (#cluster-links).
//
// Це головний інструмент, що веде Google з головної у фасет і між фасетами. Саме він, а не
// збільшення кількості карток у гріді: клієнт малює PAGE_SIZE = 9, і 24 картки в HTML
// зіщулились би до 9 на очах користувача одразу після старту JS (CLS).
import { readFileSync } from 'node:fs';
import { root } from './build-dir.mjs';
import { listFacetPages } from '../../src/shared/clusters.mjs';
import { escapeHtml, escapeAttr } from '../../src/shared/html-escape.mjs';

export const clusters = JSON.parse(readFileSync(`${root}src/data/clusters.json`, 'utf8'));
export const pageTexts = JSON.parse(readFileSync(`${root}src/data/cluster-pages.json`, 'utf8'));

/** Контентні сторінки в порядку, в якому вони стоять у блоці. Підписи посилань беруться з
 *  cluster-pages.json (linkLabel), а не з i18n-словника: там уся копія цих сторінок, включно
 *  з RU-варіантом. */
export const CONTENT_PAGE_KEYS = [
  'shynomontazh',
  'farbuvannya-dyskiv',
  'zberihannya-shyn',
  'akumulyatory',
  'kontakty',
];

/** Префікс шляху для мови: RU-версії живуть під /ru/. @param {string} lang @returns {string} */
export const langPrefix = (lang) => (lang === 'ru' ? '/ru' : '');

/**
 * @param {string} currentPath шлях поточної сторінки без слешів по краях (як `slug` у
 *   cluster-pages.json). Порожній рядок для головної — тоді жодне посилання не "поточне".
 * @param {string} lang
 * @param {import('../../src/shared/describe.mjs').Translate} t
 * @returns {string}
 */
export function clusterLinksHtml(currentPath, lang, t) {
  const prefix = langPrefix(lang);
  const facets = listFacetPages(clusters);

  /** @param {string} label @param {string[]} keys ключі сторінок у cluster-pages.json */
  const row = (label, keys) => {
    if (keys.length === 0) return '';
    const lis = keys
      .map((key) => {
        const { slug, linkLabel } = pageTexts[key][lang];
        // Поточна сторінка — не посилання: фасет, що лінкує сам на себе, лише розмиває вагу.
        return slug === currentPath
          ? `<li><strong aria-current="page">${escapeHtml(linkLabel)}</strong></li>`
          : `<li><a href="${escapeAttr(`${prefix}/${slug}/`)}">${escapeHtml(linkLabel)}</a></li>`;
      })
      .join('');
    return `<div class="cluster-links__row"><p class="cluster-links__label">${escapeHtml(label)}</p><ul>${lis}</ul></div>`;
  };

  const diameterKeys = facets.filter((f) => f.field === 'diameter').map((f) => f.key);
  const catalogKeys = [
    'tires',
    ...facets.filter((f) => f.field === 'season').map((f) => f.key),
    'wheels',
    ...facets.filter((f) => f.field === 'type').map((f) => f.key),
  ];

  return (
    `<nav class="cluster-links" aria-label="${escapeAttr(t('cluster.linksAria', 'Розділи каталогу та послуг'))}">` +
    row(t('cluster.byDiameter', 'Шини за діаметром'), diameterKeys) +
    row(t('cluster.catalogRow', 'Каталог'), catalogKeys) +
    row(t('cluster.servicesRow', 'Послуги'), CONTENT_PAGE_KEYS) +
    `</nav>`
  );
}
