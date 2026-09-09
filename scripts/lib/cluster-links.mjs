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

  /**
   * Ярлик рядка отримує ШТАТНІ i18n-хуки (`data-i18n` + кеш UA-оригіналу в
   * `data-i18n-original`) — рівно ті, які читає applyStaticTranslations() і які проставляє
   * generate-ru-html.mjs. Без них ярлик лишався б у мові білда після перемикання мови на
   * головній (там перемикач працює БЕЗ перезавантаження).
   * @param {string} key i18n-ключ у src/i18n/ru.json
   * @param {string} uk український оригінал
   */
  const rowLabel = (key, uk) =>
    `<p class="cluster-links__label" data-i18n="${escapeAttr(key)}" data-i18n-original="${escapeAttr(uk)}">` +
    `${escapeHtml(t(key, uk))}</p>`;

  /** @param {string} labelHtml @param {string[]} keys ключі сторінок у cluster-pages.json */
  const row = (labelHtml, keys) => {
    if (keys.length === 0) return '';
    const lis = keys
      .map((key) => {
        const { slug, linkLabel } = pageTexts[key][lang];
        // Поточна сторінка — не посилання: фасет, що лінкує сам на себе, лише розмиває вагу.
        if (slug === currentPath) return `<li><strong aria-current="page">${escapeHtml(linkLabel)}</strong></li>`;
        // Обидві мови в data-атрибутах, бо копія цих посилань живе в cluster-pages.json, а не
        // в ru.json — штатний i18n про неї не знає. Без цього після RU → UA на головній блок
        // лишався б російським і вів на /ru/… Див. src/js/cluster-links.ts.
        const uk = pageTexts[key].uk;
        const ru = pageTexts[key].ru;
        return (
          `<li><a href="${escapeAttr(`${prefix}/${slug}/`)}"` +
          ` data-uk-href="/${escapeAttr(uk.slug)}/" data-ru-href="/ru/${escapeAttr(ru.slug)}/"` +
          ` data-uk-label="${escapeAttr(uk.linkLabel)}" data-ru-label="${escapeAttr(ru.linkLabel)}"` +
          `>${escapeHtml(linkLabel)}</a></li>`
        );
      })
      .join('');
    return `<div class="cluster-links__row">${labelHtml}<ul>${lis}</ul></div>`;
  };

  const diameterKeys = facets.filter((f) => f.field === 'diameter').map((f) => f.key);
  const catalogKeys = [
    'tires',
    ...facets.filter((f) => f.field === 'season').map((f) => f.key),
    'wheels',
    ...facets.filter((f) => f.field === 'type').map((f) => f.key),
  ];

  const ariaUk = 'Розділи каталогу та послуг';
  return (
    `<nav class="cluster-links" aria-label="${escapeAttr(t('cluster.linksAria', ariaUk))}"` +
    ` data-i18n-attr="aria-label:cluster.linksAria" data-i18n-orig-aria-label="${escapeAttr(ariaUk)}">` +
    row(rowLabel('cluster.byDiameter', 'Шини за діаметром'), diameterKeys) +
    row(rowLabel('cluster.catalogRow', 'Каталог'), catalogKeys) +
    row(rowLabel('cluster.servicesRow', 'Послуги'), CONTENT_PAGE_KEYS) +
    `</nav>`
  );
}
