// Крок 2 конвеєра: ЄДИНИЙ фетч Google Таблиці на весь білд. Далі всі генератори читають
// .build/data.json, а не таблицю.
//
// Причина не в швидкості: три незалежних звернення дають реальний шанс, що сторінки одного
// білда побудуються з РІЗНИХ знімків прайсу (власник редагує таблицю під час деплою) — на
// сторінці товару одна ціна, у прередері головної інша.
//
// Будь-яка помилка фетчу тут — ФАТАЛЬНА, і спрацьовує ДО запису будь-яких файлів у dist/.
// Деплой (SamKirkland/FTP-Deploy-Action) синхронізує dist/ з видаленням зайвого на сервері:
// "успішний" білд без товарів стер би з живого сайту всі вже опубліковані сторінки товару.
// Білд падає → деплой не запускається → на сервері лишається попередня робоча версія.
//
// Порожня, але доступна таблиця (0 рядків) — валідний стан, не помилка: так само трактує це
// клієнтський loadLiveCsv.
import { readFileSync } from 'node:fs';
import { root, writeBuildJson } from './lib/build-dir.mjs';
import { sheetCsvUrl, fetchCsvRows } from './lib/sheets.mjs';
import { resetUrls } from './lib/urls.mjs';

const sheetIds = JSON.parse(readFileSync(`${root}src/data/sheet-ids.json`, 'utf8'));

/** @param {string} label @param {number|string|null|undefined} gid */
async function load(label, gid) {
  if (gid === null || gid === undefined || gid === '') return { label, rows: [], error: null, skipped: true };
  try {
    return { label, rows: await fetchCsvRows(sheetCsvUrl(sheetIds.spreadsheetId, gid)), error: null, skipped: false };
  } catch (err) {
    return { label, rows: [], error: /** @type {Error} */ (err).message, skipped: false };
  }
}

async function main() {
  // Лист "Відгуки" створює Apps Script при першому відгуку, тому спочатку його gid невідомий
  // і в sheet-ids.json стоїть null. Це не помилка — білд просто йде без відгуків.
  const [tires, wheels, reviews] = await Promise.all([
    load('шини', sheetIds.gids.tires),
    load('диски', sheetIds.gids.wheels),
    load('відгуки', sheetIds.gids.reviews),
  ]);

  const errors = [tires, wheels, reviews].filter((r) => r.error).map((r) => `${r.label} — ${r.error}`);
  if (errors.length > 0) {
    throw new Error(
      `не вдалося завантажити дані таблиці (${errors.join('; ')}) — білд зупинено, ` +
        'щоб деплой не стер уже опубліковані сторінки.'
    );
  }

  if (reviews.skipped) {
    console.log('fetch-data: gids.reviews не заданий — білд без відгуків (див. README.md, "Відгуки на товари").');
  }

  writeBuildJson('data.json', {
    fetchedAt: new Date().toISOString(),
    tires: tires.rows,
    wheels: wheels.rows,
    reviews: reviews.rows,
  });
  // Накопичувач URL для sitemap починає білд порожнім.
  resetUrls();

  console.log(`fetch-data: шини ${tires.rows.length}, диски ${wheels.rows.length}, відгуки ${reviews.rows.length}.`);
}

main().catch((err) => {
  console.error(`fetch-data: ${err.message}`);
  // process.exitCode, а не process.exit(1): фетч лишає за собою keep-alive сокети undici, і
  // примусовий вихід із незакритими хендлами валить Node на Windows з libuv-assertion замість
  // нормального ненульового коду (npm тоді не бачить коректної помилки).
  process.exitCode = 1;
});
