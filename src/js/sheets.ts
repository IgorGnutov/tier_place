// Завантаження CSV з Google Sheets із кешем у sessionStorage та фолбеком на локальний файл.
import { parseCsv, type CsvRow } from './csv';
import { SHEET_CACHE_TTL_MS } from '../config';

interface CacheEntry {
  ts: number;
  rows: CsvRow[];
}

export interface LoadResult {
  rows: CsvRow[];
  source: 'sheet' | 'local' | 'cache' | 'error';
  error: string | null;
}

function readCache(key: string): CsvRow[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > SHEET_CACHE_TTL_MS) return null;
    return entry.rows;
  } catch {
    return null;
  }
}

function writeCache(key: string, rows: CsvRow[]): void {
  try {
    const entry: CacheEntry = { ts: Date.now(), rows };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage може бути недоступний (приватний режим) — просто пропускаємо кеш.
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  // Google Sheets на помилку доступу віддає HTML-сторінку логіну зі статусом 200 — ловимо це окремо.
  if (/^\s*<!DOCTYPE html/i.test(text)) throw new Error('Таблиця недоступна (перевірте доступ "за посиланням")');
  return text;
}

/** Завантажує й парсить CSV; кидає помилку, якщо рядків немає (порожня/ще не заповнена таблиця). */
async function fetchAndParseSheet(url: string): Promise<CsvRow[]> {
  const text = await fetchText(url);
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('Таблиця поки порожня (немає рядків із даними)');
  return rows;
}

async function fetchSheetCached(sheetUrl: string): Promise<LoadResult> {
  const cacheKey = `sheet-cache:${sheetUrl}`;
  const cached = readCache(cacheKey);
  if (cached) return { rows: cached, source: 'cache', error: null };
  const rows = await fetchAndParseSheet(sheetUrl);
  writeCache(cacheKey, rows);
  return { rows, source: 'sheet', error: null };
}

/**
 * Завантажує CSV лише з живої таблиці — без будь-якого локального фолбека. Товарні каталоги
 * (шини/диски) мають показувати або живі дані, або явну помилку (result.source === 'error'),
 * ніколи заглушку.
 */
export async function loadLiveCsv(sheetUrl: string): Promise<LoadResult> {
  try {
    return await fetchSheetCached(sheetUrl);
  } catch (err) {
    return { rows: [], source: 'error', error: err instanceof Error ? err.message : 'Таблиця недоступна' };
  }
}

/**
 * Завантажує CSV: спершу sheetUrl (з кешем sessionStorage), при невдачі — localUrl.
 * Якщо sheetUrl порожній — одразу йде в localUrl (навмисний dev-режим "таблицю ще не
 * налаштували", див. SHEET_*_CSV в config.ts). Використовується лише для листа "Контент" —
 * це soft-фіча текстових оверрайдів, для якої застарілий локальний текст безпечний фолбек.
 */
export async function loadCsv(sheetUrl: string, localUrl: string): Promise<LoadResult> {
  if (sheetUrl) {
    try {
      return await fetchSheetCached(sheetUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Таблиця недоступна';
      try {
        const localRows = await fetchAndParseSheet(localUrl);
        return { rows: localRows, source: 'local', error: message };
      } catch (localErr) {
        return {
          rows: [],
          source: 'local',
          error: localErr instanceof Error ? localErr.message : 'Не вдалося завантажити дані',
        };
      }
    }
  }

  try {
    const rows = await fetchAndParseSheet(localUrl);
    return { rows, source: 'local', error: null };
  } catch (err) {
    return {
      rows: [],
      source: 'local',
      error: err instanceof Error ? err.message : 'Не вдалося завантажити дані',
    };
  }
}
