// Генерація URL-slug для сторінки товару з існуючих колонок CSV (без зміни таблиці).
// Раніше формула була продубльована в scripts/generate-product-pages.mjs звичайним JS —
// тепер це один файл на клієнта і на скрипт (плейн-ESM: Node 20 у CI не читає .ts).
//
// УВАГА: slug рахується з СИРИХ значень колонок, свідомо БЕЗ normalize.mjs. 159 URL уже
// опубліковані й проіндексовані; канонізація "16С"→"16C" змінила б частину з них.

/** @type {Record<string, string>} */
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '',
};

/**
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
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

/**
 * @param {Record<string, string>} row
 * @returns {string}
 */
export function tireSlug(row) {
  const parts = [row.brand, row.model, row.width, row.profile, row.diameter && `r${row.diameter}`, row.season];
  return slugify(parts.filter(Boolean).join('-'));
}

/**
 * @param {Record<string, string>} row
 * @returns {string}
 */
export function wheelSlug(row) {
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

/**
 * Дедуплікація slug-ів у межах одного каталогу — колізії отримують суфікс -2, -3... за
 * порядком рядків.
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} slugOf
 * @returns {string[]}
 */
export function dedupeSlugs(rows, slugOf) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  return rows.map((row) => {
    const base = slugOf(row);
    // Порожній slug (усі колонки-ідентифікатори порожні) — не URL: повертаємо '', викликач
    // такий рядок пропускає.
    if (!base) return '';
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    if (seen > 0) console.warn(`slug: колізія "${base}" — застосовано суфікс -${seen + 1}`);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}
