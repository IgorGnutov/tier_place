// Спливаюче повідомлення (toast) унизу екрана — спільний хелпер для кошика й карток товарів.

let toastTimer: number | undefined;

export function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('toast--visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('toast--visible'), 2500);
}
