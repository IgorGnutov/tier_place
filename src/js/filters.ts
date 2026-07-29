// Генерична логіка залежних фільтрів: рахує, які значення селекта лишаються
// доступними з урахуванням уже обраних значень інших полів.
import type { CsvRow } from './csv';
import { parseBool } from './csv';

export interface FieldDef {
  key: string;
  label: string;
  boolean?: boolean;
}

export type FilterState = Record<string, string>;

function fieldValue(row: CsvRow, field: FieldDef): string {
  if (field.boolean) return parseBool(row[field.key]) ? 'true' : 'false';
  return (row[field.key] ?? '').trim();
}

function fieldDisplay(field: FieldDef, value: string): string {
  if (field.boolean) return value === 'true' ? 'Так' : 'Ні';
  return value;
}

function rowMatchesField(row: CsvRow, field: FieldDef, selected: string): boolean {
  if (!selected) return true;
  return fieldValue(row, field) === selected;
}

export function rowMatchesState(row: CsvRow, fields: FieldDef[], state: FilterState): boolean {
  return fields.every((f) => rowMatchesField(row, f, state[f.key] ?? ''));
}

/** Унікальні доступні значення для поля з урахуванням усіх ІНШИХ активних фільтрів. */
export function optionsForField(
  rows: CsvRow[],
  fields: FieldDef[],
  state: FilterState,
  targetKey: string
): { value: string; label: string }[] {
  const target = fields.find((f) => f.key === targetKey);
  if (!target) return [];

  const otherFields = fields.filter((f) => f.key !== targetKey);
  const candidateRows = rows.filter((row) => rowMatchesState(row, otherFields, state));

  const seen = new Map<string, string>();
  for (const row of candidateRows) {
    const value = fieldValue(row, target);
    if (value === '' || seen.has(value)) continue;
    seen.set(value, fieldDisplay(target, value));
  }

  return Array.from(seen.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => {
      const na = Number.parseFloat(a.value);
      const nb = Number.parseFloat(b.value);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.label.localeCompare(b.label, 'uk');
    });
}

export function filterRows(
  rows: CsvRow[],
  fields: FieldDef[],
  state: FilterState,
  priceMin: number | null,
  priceMax: number | null,
  getPrice: (row: CsvRow) => number | null
): CsvRow[] {
  return rows.filter((row) => {
    if (!rowMatchesState(row, fields, state)) return false;
    const price = getPrice(row);
    if (priceMin !== null && (price === null || price < priceMin)) return false;
    if (priceMax !== null && (price === null || price > priceMax)) return false;
    return true;
  });
}

export { fieldDisplay };

// --- Синхронізація стану фільтра з URL (query-параметри), щоб посилання можна було шарити ---

export function readStateFromUrl(prefix: string, fields: FieldDef[]): FilterState {
  const params = new URLSearchParams(window.location.search);
  const state: FilterState = {};
  fields.forEach((f) => {
    const v = params.get(`${prefix}_${f.key}`);
    if (v) state[f.key] = v;
  });
  return state;
}

export function readRangeFromUrl(prefix: string): { min: string; max: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    min: params.get(`${prefix}_min`) ?? '',
    max: params.get(`${prefix}_max`) ?? '',
  };
}

export function writeStateToUrl(
  prefix: string,
  fields: FieldDef[],
  state: FilterState,
  priceMin: string,
  priceMax: string
): void {
  const params = new URLSearchParams(window.location.search);
  // Спершу прибираємо всі старі параметри цього каталогу.
  Array.from(params.keys()).forEach((key) => {
    if (key.startsWith(`${prefix}_`)) params.delete(key);
  });
  fields.forEach((f) => {
    const v = state[f.key];
    if (v) params.set(`${prefix}_${f.key}`, v);
  });
  if (priceMin) params.set(`${prefix}_min`, priceMin);
  if (priceMax) params.set(`${prefix}_max`, priceMax);

  const query = params.toString();
  const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', newUrl);
}
