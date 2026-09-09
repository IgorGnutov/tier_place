// Визначення фасетних сторінок: які поля взагалі стають URL, який поріг на створення і як
// рядок прайсу співвідноситься з фасетом.
//
// Ключова властивість: URL фасета ЗАКРІПЛЕНИЙ у src/data/clusters.json, а поріг діє лише на
// СТВОРЕННЯ нової сторінки. Проіндексований /tires/r19/ мусить лишатись з HTTP 200, навіть
// якщо залишок упав до нуля — інакше кожна зміна прайсу викидала б URL з індексу.
import { normalizeValue } from './normalize.mjs';

/** Скільки товарів мусить бути, щоб ЗАПРОПОНУВАТИ новий фасет. Поріг свідомо консервативний:
 *  закріплений URL живе назавжди, тож постійні напівпорожні сторінки — гірше, ніж їх
 *  відсутність. R19 із рівно 8 товарами входить. */
export const FACET_THRESHOLD = 8;

/** Поля, які взагалі можуть стати URL. Решта колонок (width, profile, brand, pcd, et, year,
 *  country) лишаються тільки клієнтськими фільтрами: за 143 рядками окрема сторінка під
 *  точний розмір дала б 1–3 товари, тобто thin content. Бренд — окрема фаза (найволатильніше
 *  поле прайсу, закріплювати такі URL назавжди зарано).
 *  @type {Record<'tires'|'wheels', string[]>} */
export const FACET_FIELDS = { tires: ['season', 'diameter'], wheels: ['type'] };

/** Ярлик фасета для крихт, заголовків і блоку посилань: діаметр показуємо як "R16".
 * @param {string} field
 * @param {string} value
 * @returns {string}
 */
export function facetLabel(field, value) {
  return field === 'diameter' ? `R${value}` : value;
}

/**
 * @typedef {{
 *   key: string,
 *   kind: 'tires'|'wheels',
 *   field: string,
 *   slug: string,
 *   value: string,
 *   path: string,
 *   label: string,
 * }} FacetPage
 */

/**
 * Розгортає src/data/clusters.json у плоский перелік фасетних сторінок.
 * Падає, якщо той самий slug у межах каталогу заявлений двічі з різними значеннями — це або
 * описка, або незавершена канонізація, і тихо взяти перший означало б згенерувати сторінку,
 * яка показує половину товарів.
 * @param {Record<string, any>} clusters
 * @returns {FacetPage[]}
 */
export function listFacetPages(clusters) {
  /** @type {FacetPage[]} */
  const pages = [];
  for (const kind of /** @type {('tires'|'wheels')[]} */ (['tires', 'wheels'])) {
    /** @type {Map<string, string>} */
    const seenSlugs = new Map();
    for (const field of FACET_FIELDS[kind]) {
      for (const entry of clusters[kind]?.[field] ?? []) {
        const canonical = normalizeValue(field, entry.value);
        const previous = seenSlugs.get(entry.slug);
        if (previous !== undefined && previous !== canonical) {
          throw new Error(
            `clusters.json: slug "${kind}/${entry.slug}" заявлений двічі з різними канонічними ` +
              `значеннями ("${previous}" і "${canonical}") — сторінка показала б лише частину товарів.`
          );
        }
        seenSlugs.set(entry.slug, canonical);
        pages.push({
          key: `${kind}/${entry.slug}`,
          kind,
          field,
          slug: entry.slug,
          value: canonical,
          path: `${kind}/${entry.slug}`,
          label: facetLabel(field, canonical),
        });
      }
    }
  }
  return pages;
}

/**
 * Рядки прайсу, що належать фасету. Порівняння — по канонічному значенню, тому "16С" з
 * кириличною С потрапляє в /tires/r16c/ разом із латинським "16C".
 * @param {Record<string, string>[]} rows
 * @param {string} field
 * @param {string} value
 * @returns {Record<string, string>[]}
 */
export function rowsForFacet(rows, field, value) {
  const canonical = normalizeValue(field, value);
  return rows.filter((row) => normalizeValue(field, row[field]) === canonical);
}

/**
 * Значення, які перетнули поріг, але не закріплені в clusters.json. Сторінка для них НЕ
 * створюється — генератор лише підказує (у лог і в $GITHUB_STEP_SUMMARY).
 * @param {Record<string, string>[]} rows
 * @param {'tires'|'wheels'} kind
 * @param {Record<string, any>} clusters
 * @returns {{ kind: string, field: string, value: string, count: number }[]}
 */
export function suggestNewFacets(rows, kind, clusters) {
  const out = [];
  for (const field of FACET_FIELDS[kind]) {
    const pinned = new Set((clusters[kind]?.[field] ?? []).map((e) => normalizeValue(field, e.value)));
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const row of rows) {
      const value = normalizeValue(field, row[field]);
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const [value, count] of counts) {
      if (count >= FACET_THRESHOLD && !pinned.has(value)) out.push({ kind, field, value, count });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Фасет, у крихтах якого показуємо цей товар. Діаметр інформативніший за сезон (усі шини в
 * прайсі зимові), тому він у пріоритеті; для дисків — тип.
 * @param {Record<string, string>} row
 * @param {'tires'|'wheels'} kind
 * @param {FacetPage[]} facetPages
 * @returns {FacetPage | null}
 */
export function facetForProduct(row, kind, facetPages) {
  const priority = kind === 'tires' ? ['diameter', 'season'] : ['type'];
  for (const field of priority) {
    const match = facetPages.find(
      (page) => page.kind === kind && page.field === field && page.value === normalizeValue(field, row[field])
    );
    if (match) return match;
  }
  return null;
}

/**
 * Слаги фасетів і товарів живуть в одному просторі імен (/tires/r16/ і
 * /tires/sailun-…-r16-zyma/). Колізія мусить ВАЛИТИ білд із назвами обох сторінок — інакше
 * один товар безслідно зникає з сайту.
 * @param {FacetPage[]} facetPages
 * @param {{ kind: string, slug: string, title: string }[]} products
 */
export function assertNoSlugCollisions(facetPages, products) {
  const bySlug = new Map(products.map((p) => [`${p.kind}/${p.slug}`, p]));
  for (const facet of facetPages) {
    const clash = bySlug.get(facet.path);
    if (clash) {
      throw new Error(
        `колізія slug: фасетна сторінка /${facet.path}/ (${facet.field}=${facet.value}) і товар ` +
          `"${clash.title}" претендують на той самий URL — один із них безслідно зник би з сайту.`
      );
    }
  }
}
