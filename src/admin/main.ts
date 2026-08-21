// Точка входу /admin: пароль-гейт + список текстових блоків з rich text editor (Quill).
// Читання поточних значень йде тим самим loadCsv, що й на публічному сайті; запис — окремим
// шляхом через Google Apps Script Web App (CONTENT_API_URL), який сам перевіряє пароль.
import '../styles/admin.css';
import 'quill/dist/quill.snow.css';
import Quill from 'quill';
import { loadCsv } from '../js/sheets';
import { SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV, CONTENT_API_URL } from '../config';
import { CONTENT_REGISTRY, type ContentBlock } from './content-registry';

const SESSION_KEY = 'admin_password';

const mainEl = document.getElementById('admin-main');
const statusEl = document.getElementById('admin-status');

interface ApiResult {
  ok: boolean;
  error?: string;
}

function showStatus(message: string, isError = false): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('admin-status--error', isError);
  statusEl.classList.add('admin-status--visible');
  window.setTimeout(() => statusEl.classList.remove('admin-status--visible'), 3000);
}

// body без явного Content-Type лишається text/plain — так Apps Script Web App уникає CORS preflight.
async function callApi(action: 'verify' | 'save', payload: Record<string, string>): Promise<ApiResult> {
  const response = await fetch(CONTENT_API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function renderNotConfigured(): void {
  if (!mainEl) return;
  mainEl.innerHTML = `
    <div class="admin-card admin-card--center">
      <h1>Адмінку ще не налаштовано</h1>
      <p>
        Задеплойте Google Apps Script (<code>admin/apps-script/Code.gs</code>) як Web App і впишіть
        його URL у <code>CONTENT_API_URL</code> в <code>src/config.ts</code> — детальні кроки в
        <code>README.md</code>.
      </p>
    </div>
  `;
}

function renderLogin(onSuccess: (password: string) => void): void {
  if (!mainEl) return;
  mainEl.innerHTML = `
    <form class="admin-card admin-login" id="admin-login-form">
      <h1>Вхід в адмінку</h1>
      <label for="admin-password">Пароль</label>
      <input type="password" id="admin-password" name="password" required autocomplete="current-password" />
      <button type="submit" class="btn btn--block">Увійти</button>
    </form>
  `;

  const form = document.getElementById('admin-login-form') as HTMLFormElement | null;
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('admin-password') as HTMLInputElement | null;
    const password = input?.value ?? '';
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await callApi('verify', { password });
      if (result.ok) {
        sessionStorage.setItem(SESSION_KEY, password);
        onSuccess(password);
      } else {
        showStatus('Неправильний пароль', true);
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

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
        showStatus(result.error || 'Не вдалося зберегти', true);
      }
    } catch {
      showStatus('Не вдалося з’єднатися з сервером адмінки', true);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

async function renderContentList(password: string): Promise<void> {
  if (!mainEl) return;
  mainEl.innerHTML = '<p class="state-message">Завантаження…</p>';

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

  mainEl.innerHTML = `
    <div class="admin-toolbar">
      <span>Ви увійшли в адмінку</span>
      <button class="btn btn--outline btn--small" id="admin-logout">Вийти</button>
    </div>
  `;

  document.getElementById('admin-logout')?.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  });

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

    mainEl.appendChild(section);
  }
}

function init(): void {
  if (!CONTENT_API_URL) {
    renderNotConfigured();
    return;
  }

  const savedPassword = sessionStorage.getItem(SESSION_KEY);
  if (savedPassword) {
    renderContentList(savedPassword);
  } else {
    renderLogin((password) => renderContentList(password));
  }
}

init();
