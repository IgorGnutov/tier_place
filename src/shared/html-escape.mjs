// Екранування для рядкового рендеру HTML. Спільне для клієнта (productCardHtml) і
// білд-скриптів: значення приходять із Google Таблиці, тобто це довільний людський ввід.

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
