// Фетч і розбір CSV-експорту Google Таблиці для білд-скриптів.
import Papa from 'papaparse';

/**
 * @param {string} spreadsheetId
 * @param {number|string} [gid]
 * @returns {string}
 */
export function sheetCsvUrl(spreadsheetId, gid = 0) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

/**
 * @param {string} url
 * @returns {Promise<Record<string, string>[]>}
 */
export async function fetchCsvRows(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  // Google на помилку доступу віддає HTML-сторінку логіну/шарингу зі статусом 200 — без цієї
  // перевірки Papa Parse розібрав би її як "рядки товарів" і ми б згенерували сміттєві сторінки.
  // Той самий захист уже є на клієнті (src/js/sheets.ts).
  if (/^\s*<(!doctype html|html)/i.test(clean)) {
    throw new Error('таблиця недоступна — Google повернув HTML замість CSV (перевірте доступ "за посиланням")');
  }
  const parsed = Papa.parse(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  return parsed.data.filter((row) => Object.values(row).some((v) => v !== ''));
}
