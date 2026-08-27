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
  item: HTMLElement,
  block: ContentBlock,
  currentHtml: string,
  password: string,
  onSaved: (newHtml: string) => void
): void {
  const head = item.querySelector('.admin-block__head') as HTMLElement;
  const editBtn = head.querySelector('[data-edit]') as HTMLButtonElement;
  const preview = item.querySelector('.admin-block__preview') as HTMLElement;
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
      const result = await callApi('save', { password, key: block.key, html });
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
  for (const row of rows) {
    if (row.key) values.set(row.key, row.value ?? '');
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
      const item = document.createElement('article');
      item.className = 'admin-block';
      item.innerHTML = `
        <div class="admin-block__head">
          <span class="admin-block__label">${block.label}</span>
          <button class="btn btn--outline btn--small" data-edit>Редагувати</button>
        </div>
        <div class="admin-block__preview">${currentHtml}</div>
      `;
      section.appendChild(item);

      const editBtn = item.querySelector('[data-edit]') as HTMLButtonElement;
      editBtn.addEventListener('click', () =>
        openEditor(item, block, values.get(block.key) || block.defaultHtml, password, (newHtml) => {
          values.set(block.key, newHtml);
        })
      );
    }

    container.appendChild(section);
  }
}
