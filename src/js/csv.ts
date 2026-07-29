// Парсинг CSV (лапки, коми в значеннях, \r\n, BOM) через Papa Parse.
import Papa from 'papaparse';

export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  // Google Sheets інколи віддає CSV з BOM на початку — прибираємо, щоб не зламати перший заголовок.
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const result = Papa.parse<CsvRow>(clean, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  return result.data.filter((row) => Object.values(row).some((v) => v !== ''));
}

// Нормалізація ціни: прибирає пробіли, "грн", коми як роздільник тисяч.
export function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/грн\.?/gi, '')
    .replace(/[\s ]/g, '')
    .replace(',', '.')
    .trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function parseBool(raw: string | undefined): boolean {
  if (!raw) return false;
  return /^(так|yes|true|1|\+)$/i.test(raw.trim());
}
