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

// parsePrice/parseBool живуть у src/shared/csv-values.mjs — їх потребує і
// src/shared/describe.mjs, який імпортує плейн-Node. Тут лише реекспорт, щоб решта
// клієнтського коду й далі імпортувала їх звідси.
export { parsePrice, parseBool } from '../shared/csv-values.mjs';
