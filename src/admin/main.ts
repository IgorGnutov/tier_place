// Точка входу /admin: пароль-гейт + перемикач вкладок "Замовлення" (за замовчуванням) / "Тексти".
import '../styles/admin.css';
import { CONTENT_API_URL } from '../config';
import { callApi, getSavedPassword, savePassword, clearPassword, showStatus } from './api';
import { initOrdersTab } from './orders';
import { initContentTab } from './content-tab';

const mainEl = document.getElementById('admin-main');

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
        savePassword(password);
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

function renderTabsShell(password: string): void {
  if (!mainEl) return;
  mainEl.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-tabs" role="tablist">
        <button class="admin-tabs__btn" data-tab="orders" role="tab" type="button">Замовлення</button>
        <button class="admin-tabs__btn" data-tab="content" role="tab" type="button">Тексти</button>
      </div>
      <button class="btn btn--outline btn--small" id="admin-logout" type="button">Вийти</button>
    </div>
    <div id="admin-tab-content"></div>
  `;

  document.getElementById('admin-logout')?.addEventListener('click', () => {
    clearPassword();
    location.reload();
  });

  const tabButtons = Array.from(mainEl.querySelectorAll<HTMLButtonElement>('.admin-tabs__btn'));
  const tabContentEl = document.getElementById('admin-tab-content') as HTMLElement;

  function activate(tab: string): void {
    tabButtons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tab));
    if (tab === 'content') {
      initContentTab(tabContentEl, password);
    } else {
      initOrdersTab(tabContentEl, password);
    }
  }

  tabButtons.forEach((btn) => btn.addEventListener('click', () => activate(btn.dataset.tab ?? 'orders')));

  activate('orders');
}

function init(): void {
  if (!CONTENT_API_URL) {
    renderNotConfigured();
    return;
  }

  const savedPassword = getSavedPassword();
  if (savedPassword) {
    renderTabsShell(savedPassword);
  } else {
    renderLogin((password) => renderTabsShell(password));
  }
}

init();
