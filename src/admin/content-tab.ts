// Вкладка "Тексти" адмінки: список текстових блоків з rich text editor (Quill).
// Читання поточних значень йде тим самим loadCsv, що й на публічному сайті; запис — через
// callApi('save', ...) з src/admin/api.ts.
import 'quill/dist/quill.snow.css';
import Quill from 'quill';
import { loadCsv } from '../js/sheets';
import { SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV } from '../config';
import { CONTENT_REGISTRY, type ContentBlock } from './content-registry';
import { callApi, showStatus } from './api';

function openEditor(
  scope: HTMLElement,
  block: ContentBlock,
  currentHtml: string,
  password: string,
  lang: 'uk' | 'ru',
  onSaved: (newHtml: string) => void
): void {
  const head = scope.querySelector('.admin-block__lang-head') as HTMLElement;
  const editBtn = head.querySelector('[data-edit]') as HTMLButtonElement;
  const preview = scope.querySelector('.admin-block__preview') as HTMLElement;
  editBtn.hidden = true;

  const editorWrap = document.createElement('div');
  editorWrap.className = 'admin-editor';
  const editorHost = document.createElement('div');
  editorWrap.appendChild(editorHost);

  const actions = document.createElement('div');
  actions.className = 'admin-editor__actions';
  actions.innerHTML = `
    <button class="btn btn--small" data-save>Зберегти</button>
    <button class="btn btn--outline btn--small" data-cancel>Скасувати</button>
  `;
  editorWrap.appendChild(actions);

  preview.replaceWith(editorWrap);

  const quill = new Quill(editorHost, {
    theme: 'snow',
    modules: {
      toolbar: [['bold', 'italic', 'underline'], ['link'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']],
    },
  });
  quill.root.innerHTML = currentHtml;

  function exitEditor(finalHtml: string): void {
    const newPreview = document.createElement('div');
    newPreview.className = 'admin-block__preview';
    newPreview.innerHTML = finalHtml;
    editorWrap.replaceWith(newPreview);
    editBtn.hidden = false;
  }

  actions.querySelector('[data-cancel]')?.addEventListener('click', () => exitEditor(currentHtml));

  actions.querySelector('[data-save]')?.addEventListener('click', async () => {
    const saveBtn = actions.querySelector('[data-save]') as HTMLButtonElement;
    saveBtn.disabled = true;
    const html = quill.root.innerHTML;

    try {
      const result = await callApi('save', { password, key: block.key, html, lang });
      if (result.ok) {
        onSaved(html);
        exitEditor(html);
        showStatus('Збережено');
      } else {
        showStatus((result.error as string) || 'Не вдалося зберегти', true);
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

export async function initContentTab(container: HTMLElement, password: string): Promise<void> {
  container.innerHTML = '<p class="state-message">Завантаження…</p>';

  const { rows } = await loadCsv(SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV);
  const values = new Map<string, string>();
  const valuesRu = new Map<string, string>();
  for (const row of rows) {
    if (!row.key) continue;
    values.set(row.key, row.value ?? '');
    valuesRu.set(row.key, row.value_ru ?? '');
  }

  const groups = new Map<string, ContentBlock[]>();
  for (const block of CONTENT_REGISTRY) {
    const list = groups.get(block.group) ?? [];
    list.push(block);
    groups.set(block.group, list);
  }

  container.innerHTML = '';

  for (const [groupName, blocks] of groups) {
    const section = document.createElement('section');
    section.className = 'admin-group';
    section.innerHTML = `<h2>${groupName}</h2>`;

    for (const block of blocks) {
      const currentHtml = values.get(block.key) || block.defaultHtml;
      const currentRuHtml = valuesRu.get(block.key) || block.defaultHtmlRu;
      const item = document.createElement('article');
      item.className = 'admin-block';
      item.innerHTML = `
        <div class="admin-block__head">
          <span class="admin-block__label">${block.label}</span>
        </div>
        <div class="admin-block__lang" data-lang="uk">
          <div class="admin-block__lang-head">
            <span class="admin-block__lang-tag">UA</span>
            <button class="btn btn--outline btn--small" data-edit>Редагувати</button>
          </div>
          <div class="admin-block__preview">${currentHtml}</div>
        </div>
        <div class="admin-block__lang" data-lang="ru">
          <div class="admin-block__lang-head">
            <span class="admin-block__lang-tag">RU</span>
            <button class="btn btn--outline btn--small" data-edit>Редагувати</button>
          </div>
          <div class="admin-block__preview">${currentRuHtml}</div>
        </div>
      `;
      section.appendChild(item);

      const uaScope = item.querySelector('[data-lang="uk"]') as HTMLElement;
      const ruScope = item.querySelector('[data-lang="ru"]') as HTMLElement;

      (uaScope.querySelector('[data-edit]') as HTMLButtonElement).addEventListener('click', () =>
        openEditor(uaScope, block, values.get(block.key) || block.defaultHtml, password, 'uk', (newHtml) => {
          values.set(block.key, newHtml);
        })
      );
      (ruScope.querySelector('[data-edit]') as HTMLButtonElement).addEventListener('click', () =>
        openEditor(ruScope, block, valuesRu.get(block.key) || block.defaultHtmlRu, password, 'ru', (newHtml) => {
          valuesRu.set(block.key, newHtml);
        })
      );
    }

    container.appendChild(section);
  }
}
