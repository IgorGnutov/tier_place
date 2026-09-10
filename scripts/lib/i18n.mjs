// RU-словник і фабрика `t` для build-скриптів. Було дослівно продубльовано в
// prerender-home.mjs і generate-cluster-pages.mjs; з появою RU-сторінок товару користувачів
// стало три, тож копії зведені сюди.
//
// Рядки читаються з тих самих JSON, що їх імпортує клієнт (src/i18n/strings.ts) і
// generate-ru-html.mjs — щоб ярлики карток («В наличии», «Купить»), крихт і сторінок товару
// не розходились із клієнтським i18n. Плейн-Node не може імпортувати .ts, тому JSON.
import { readFileSync } from 'node:fs';
import { root } from './build-dir.mjs';

/** @type {Record<string, string>} */
export const RU_STRINGS = {
  ...JSON.parse(readFileSync(`${root}src/i18n/ru.json`, 'utf8')),
  ...JSON.parse(readFileSync(`${root}src/i18n/ru-meta.json`, 'utf8')),
};

/**
 * Відсутній ключ — не помилка, а документований дефолт «слово однакове в обох мовах»:
 * повертається український fallback із місця виклику.
 * @param {string} lang
 * @returns {import('../../src/shared/describe.mjs').Translate}
 */
export const makeT = (lang) =>
  lang === 'ru' ? (key, uk) => RU_STRINGS[key] ?? uk : (_key, uk) => uk;
