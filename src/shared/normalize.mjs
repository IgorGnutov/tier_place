// Канонізація значень фасетних полів таблиці. Люди заповнюють прайс руками, тож те саме
// значення трапляється в кількох написаннях.

/**
 * Діаметр: "16С" з КИРИЛИЧНОЮ С (U+0421) і "16C" з латинською — одне й те саме значення,
 * але в таблиці зустрічаються обидва (на 2026-09-09: 3 рядки з кириличною, 1 з латинською).
 * Без канонізації у фільтрі "Діаметр" з'являються два пункти-двійники, а фасетна сторінка
 * порахувала б лише частину товарів.
 * @param {string | undefined} raw
 * @returns {string}
 */
export function normalizeDiameter(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/[сС]/g, 'C')
    .toUpperCase();
}

/**
 * Канонічне значення поля для порівнянь і фільтрів. Поля, не перелічені тут, лишаються
 * як є (лише trim) — розширювати варто тільки за фактом брудних даних.
 * @param {string} field
 * @param {string | undefined} raw
 * @returns {string}
 */
export function normalizeValue(field, raw) {
  if (field === 'diameter') return normalizeDiameter(raw);
  return String(raw ?? '').trim();
}
