// Підстановка текстових блоків, відредагованих через /admin (лист "Контент" у Google Sheets).
// Якщо лист не налаштований, порожній або для конкретного блоку ще нема рядка — залишається
// статичний текст, що вже прописаний в index.html, тож відсутність даних тут не є помилкою.
//
// RU: перед завантаженням Sheet підставляється захардкоджений RU-бейзлайн (CONTENT_REGISTRY
// defaultHtmlRu), щоб RU-версія не показувала українські абзаци, поки власник не заповнив
// колонку value_ru в Sheet. Порядок пріоритету для lang=ru: value_ru із Sheet → value (UA)
// із Sheet, якщо RU-клітинку ще не заповнили → захардкоджений RU-бейзлайн, застосований нижче.
//
// applyContentBaseline() кешує оригінальний UA-innerHTML кожного блоку в data-content-original
// при першому виклику — без цього перемикання RU → UA залишало б RU-текст "застряглим",
// бо просто пропускати застосування для lang==='uk' недостатньо: потрібно явно повернути
// збережений UA-оригінал.
import { loadCsv } from './sheets';
import { SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV } from '../config';
import { CONTENT_REGISTRY } from '../admin/content-registry';
import { getLang, onLangChange } from './i18n';

function applyContentBaseline(): void {
  const lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-content-key]').forEach((el) => {
    const key = el.dataset.contentKey;
    if (!key) return;
    const original = el.dataset.contentOriginal ?? el.innerHTML;
    if (el.dataset.contentOriginal === undefined) el.dataset.contentOriginal = original;
    const block = CONTENT_REGISTRY.find((b) => b.key === key);
    el.innerHTML = lang === 'ru' && block ? block.defaultHtmlRu : original;
  });
}

export async function initContent(): Promise<void> {
  applyContentBaseline();
  onLangChange(() => applyContentBaseline());

  const { rows } = await loadCsv(SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV);
  if (rows.length === 0) return;

  const values = new Map<string, string>();
  const valuesRu = new Map<string, string>();
  for (const row of rows) {
    if (!row.key) continue;
    values.set(row.key, row.value ?? '');
    if (row.value_ru) valuesRu.set(row.key, row.value_ru);
  }

  function applySheetValues(): void {
    document.querySelectorAll<HTMLElement>('[data-content-key]').forEach((el) => {
      const key = el.dataset.contentKey;
      if (!key) return;
      const value = getLang() === 'ru' ? valuesRu.get(key) || values.get(key) : values.get(key);
      if (value) el.innerHTML = value;
    });
  }

  // Порядок при кожній зміні мови важливий: спершу applyContentBaseline() повертає
  // правильну базову мову (UA-оригінал або RU-бейзлайн), і лише потім applySheetValues()
  // накладає зверху Sheet-оверрайд, якщо він є для цієї мови.
  applySheetValues();
  onLangChange(() => {
    applyContentBaseline();
    applySheetValues();
  });
}
