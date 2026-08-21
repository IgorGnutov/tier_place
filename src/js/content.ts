// Підстановка текстових блоків, відредагованих через /admin (лист "Контент" у Google Sheets).
// Якщо лист не налаштований, порожній або для конкретного блоку ще нема рядка — залишається
// статичний текст, що вже прописаний в index.html, тож відсутність даних тут не є помилкою.
import { loadCsv } from './sheets';
import { SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV } from '../config';

export async function initContent(): Promise<void> {
  const { rows } = await loadCsv(SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV);
  if (rows.length === 0) return;

  const content = new Map<string, string>();
  for (const row of rows) {
    if (row.key) content.set(row.key, row.value ?? '');
  }

  document.querySelectorAll<HTMLElement>('[data-content-key]').forEach((el) => {
    const key = el.dataset.contentKey;
    const value = key ? content.get(key) : undefined;
    if (value) el.innerHTML = value;
  });
}
