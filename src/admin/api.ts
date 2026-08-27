// Спільний HTTP-клієнт, сеансовий пароль і статус-тост для обох вкладок /admin
// ("Замовлення", "Тексти"). Читання даних (CSV) і так само йде через loadCsv, як на публічному
// сайті — цей модуль відповідає лише за запис/захищені дії через Apps Script Web App.
import { CONTENT_API_URL } from '../config';

const SESSION_KEY = 'admin_password';

export interface ApiResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

// body без явного Content-Type лишається text/plain — так Apps Script Web App уникає CORS preflight.
export async function callApi(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult> {
  const response = await fetch(CONTENT_API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function getSavedPassword(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function savePassword(password: string): void {
  sessionStorage.setItem(SESSION_KEY, password);
}

export function clearPassword(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

let statusEl: HTMLElement | null = null;
let statusTimer: number | undefined;

export function showStatus(message: string, isError = false): void {
  if (!statusEl) statusEl = document.getElementById('admin-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('admin-status--error', isError);
  statusEl.classList.add('admin-status--visible');
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => statusEl?.classList.remove('admin-status--visible'), 3000);
}
