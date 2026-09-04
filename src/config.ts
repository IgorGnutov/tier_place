// Єдине місце з посиланнями на джерела даних і контактною інформацією.
// Якщо SHEET_CONTENT_CSV порожній рядок — сайт автоматично бере локальний demo CSV
// (шини/диски такого фолбека не мають, див. коментар біля SHEET_TIRES_CSV нижче).
// Самі spreadsheetId/gid зберігаються в src/data/sheet-ids.json — той самий файл читає
// й scripts/generate-product-pages.mjs (build-скрипт не може імпортувати цей .ts напряму).
import sheetIds from './data/sheet-ids.json';

function sheetCsvUrl(spreadsheetId: string, gid = 0): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

// Шини/диски завжди читаються тільки з живої таблиці — без локального demo-фолбека
// (render-products.ts викликає loadLiveCsv, не loadCsv).
export const SHEET_TIRES_CSV = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.tires);
export const SHEET_WHEELS_CSV = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.wheels);

// Лист "Контент" — тексти, редаговані через /admin. Порожній рядок — адмінка ще не налаштована,
// сайт показує тексти, захардкоджені прямо в index.html.
export const SHEET_CONTENT_CSV = sheetCsvUrl(sheetIds.spreadsheetId, sheetIds.gids.content);
export const LOCAL_CONTENT_CSV = 'data/content.csv';

// URL Google Apps Script Web App (деплой прив'язаного до таблиці скрипта з admin/apps-script/Code.gs).
// Використовується сторінкою /admin (перевірка пароля, запис змін, список замовлень) і публічним
// сайтом при оформленні замовлення (дія 'order', без пароля). Порожній рядок — бекенд ще не
// задеплоєний (детальніше — README.md).
export const CONTENT_API_URL =
  'https://script.google.com/macros/s/AKfycbyt46uHTwzKNer-PVBPl00lK4jFqadtElMHVV6N6ALfW_D71-XEbu1VvFpIIpwcGN70gQ/exec';

// Скільки часу тримати відповідь Google Sheets у sessionStorage, щоб не бити по таблиці на кожен перехід.
export const SHEET_CACHE_TTL_MS = 5 * 60 * 1000;

// Google Analytics 4 Measurement ID. Порожній рядок — аналітика вимкнена (initAnalytics нічого не робить).
export const GA_MEASUREMENT_ID = 'G-PTNM1W4XTG';

// Посилання на саму картку закладу в Google Maps (той самий "place", що й у виносці на скріні).
const MAP_PLACE_URL =
  'https://www.google.com/maps/place/%D0%90%D0%B2%D1%82%D0%BE%D0%BC%D0%B0%D0%B3%D0%B0%D0%B7%D0%B8%D0%BD+%D0%A8%D0%B8%D0%BD+%D1%82%D0%B0+%D0%90%D0%BA%D1%83%D0%BC%D1%83%D0%BB%D1%8F%D1%82%D0%BE%D1%80%D1%96%D0%B2+TIRE+PLACE+%D0%9A%D1%80%D0%B8%D0%B2%D0%B8%D0%B9+%D0%A0%D1%96%D0%B3/@47.8861199,33.3934884,20z/data=!4m15!1m8!3m7!1s0x40db2777b45a2567:0x43eca4088a29b7de!2z0JDQstGC0L7QvNCw0LPQsNC30LjQvSDQqNC40L0g0YLQsCDQkNC60YPQvNGD0LvRj9GC0L7RgNGW0LIgVElSRSBQTEFDRSDQmtGA0LjQstC40Lkg0KDRltCz!8m2!3d47.8860397!4d33.3937558!10e1!16s%2Fg%2F11vzw3hn6v!3m5!1s0x40db2777b45a2567:0x43eca4088a29b7de!8m2!3d47.8860397!4d33.3937558!16s%2Fg%2F11vzw3hn6v';

export const CONTACTS = {
  phoneDisplay: '+38 (098) 071-93-93',
  phoneHref: 'tel:+380980719393',
  telegramUsername: 'AnastasiyaBaza',
  telegramUrl: 'https://t.me/AnastasiyaBaza',
  address: 'Авторинок «Термінал», вулиця Нікопольське Шосе 1Г, Кривий Ріг',
  lat: 47.8860397,
  lng: 33.3937558,
  mapPlaceUrl: `${MAP_PLACE_URL}?entry=ttu`,
  // Згенеровано через Google Maps → Share → Embed a map — офіційний embed з відкритою
  // карткою закладу (не можна сконструювати вручну, checksum у pb= рахує сам Google).
  mapEmbedSrc:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d10702.366707079294!2d33.3937881!3d47.8862323!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40db2777b45a2567%3A0x43eca4088a29b7de!2z0JDQstGC0L7QvNCw0LPQsNC30LjQvSDQqNC40L0g0YLQsCDQkNC60YPQvNGD0LvRj9GC0L7RgNGW0LIgVElSRSBQTEFDRSDQmtGA0LjQstC40Lkg0KDRltCz!5e0!3m2!1suk!2sua!4v1785272668034!5m2!1suk!2sua',
  // Графік роботи — уточнюється власником, поки орієнтовний.
  hoursNote: 'Щодня, 9:00–19:00 (графік уточнюється)',
} as const;

export function buildTelegramLink(message: string): string {
  return `${CONTACTS.telegramUrl}?text=${encodeURIComponent(message)}`;
}
