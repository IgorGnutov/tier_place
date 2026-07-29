// Єдине місце з посиланнями на джерела даних і контактною інформацією.
// Якщо SHEET_*_CSV порожній рядок — сайт автоматично бере демо-дані з /data/*.csv.

function sheetCsvUrl(spreadsheetId: string, gid = 0): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export const SHEET_TIRES_CSV = sheetCsvUrl('1lughMmzLw0Ve_Ftwy6MUvlBiP9bVEIV8V41ojxKq2u0');
export const SHEET_WHEELS_CSV = sheetCsvUrl('1lughMmzLw0Ve_Ftwy6MUvlBiP9bVEIV8V41ojxKq2u0', 1073589868);
export const SHEET_SERVICE_CSV = sheetCsvUrl('1lughMmzLw0Ve_Ftwy6MUvlBiP9bVEIV8V41ojxKq2u0', 1610694498);

// Локальні демо-CSV як фолбек, якщо посилання вище порожнє або таблиця недоступна.
export const LOCAL_TIRES_CSV = 'data/tires.csv';
export const LOCAL_WHEELS_CSV = 'data/wheels.csv';
export const LOCAL_SERVICE_CSV = 'data/service.csv';

// Скільки часу тримати відповідь Google Sheets у sessionStorage, щоб не бити по таблиці на кожен перехід.
export const SHEET_CACHE_TTL_MS = 5 * 60 * 1000;

// Посилання на саму картку закладу в Google Maps (той самий "place", що й у виносці на скріні).
const MAP_PLACE_URL =
  'https://www.google.com/maps/place/%D0%90%D0%B2%D1%82%D0%BE%D0%BC%D0%B0%D0%B3%D0%B0%D0%B7%D0%B8%D0%BD+%D0%A8%D0%B8%D0%BD+%D1%82%D0%B0+%D0%90%D0%BA%D1%83%D0%BC%D1%83%D0%BB%D1%8F%D1%82%D0%BE%D1%80%D1%96%D0%B2+TIRE+PLACE+%D0%9A%D1%80%D0%B8%D0%B2%D0%B8%D0%B9+%D0%A0%D1%96%D0%B3/@47.8861199,33.3934884,20z/data=!4m15!1m8!3m7!1s0x40db2777b45a2567:0x43eca4088a29b7de!2z0JDQstGC0L7QvNCw0LPQsNC30LjQvSDQqNC40L0g0YLQsCDQkNC60YPQvNGD0LvRj9GC0L7RgNGW0LIgVElSRSBQTEFDRSDQmtGA0LjQstC40Lkg0KDRltCz!8m2!3d47.8860397!4d33.3937558!10e1!16s%2Fg%2F11vzw3hn6v!3m5!1s0x40db2777b45a2567:0x43eca4088a29b7de!8m2!3d47.8860397!4d33.3937558!16s%2Fg%2F11vzw3hn6v';

export const CONTACTS = {
  phoneDisplay: '+38 (098) 071-93-93',
  phoneHref: 'tel:+380980719393',
  telegramUsername: 'AnastasiyaBaza',
  telegramUrl: 'https://t.me/AnastasiyaBaza',
  // TODO: підставити реальний Instagram власника.
  instagramUrl: '#',
  address: 'Авторинок «Термінал», вулиця Нікопольське Шосе, Кривий Ріг',
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
