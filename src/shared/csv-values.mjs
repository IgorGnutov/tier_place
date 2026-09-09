// Нормалізатори значень CSV. Живуть тут, а не в src/js/csv.ts, бо їх потребує
// src/shared/describe.mjs, який імпортує і плейн-Node (він .ts не читає).
// src/js/csv.ts реекспортує їх звідси, тож копії немає.

/**
 * Ціна: прибирає пробіли (звичайні й нерозривні), "грн", кому як десятковий роздільник.
 * @param {string | undefined} raw
 * @returns {number | null}
 */
export function parsePrice(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/грн\.?/gi, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(',', '.')
    .trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * @param {string | undefined} raw
 * @returns {boolean}
 */
export function parseBool(raw) {
  if (!raw) return false;
  return /^(так|yes|true|1|\+)$/i.test(raw.trim());
}
