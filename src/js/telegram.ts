// Посилання на Telegram-заявку + копіювання тексту запиту в буфер обміну.
import { buildTelegramLink } from '../config';

let toastTimer: number | undefined;

export function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('toast--visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('toast--visible'), 2500);
}

export { buildTelegramLink };

/**
 * Копіює текст запиту в буфер обміну — підстраховка на випадок, якщо ?text=
 * не підставиться автоматично в клієнті Telegram користувача.
 */
export async function copyRequestText(message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(message);
    showToast('Текст запиту скопійовано — вставте його в чат Telegram');
  } catch {
    showToast('Не вдалося скопіювати. Виділіть текст запиту вручну.');
  }
}
