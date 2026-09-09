// Плаский словник RU-перекладів. Ключ відсутній тут = слово однакове в обох мовах
// (напр. "Диски", "Бренд") — t()/applyStaticTranslations просто лишають український
// оригінал. Українські рядки НЕ дублюються тут — вони живуть в index.html/*.ts як є.
//
// Самі рядки лежать у ./ru.json (тіло сторінки) і ./ru-meta.json (head/meta.*), а не тут:
// ті самі файли читає scripts/generate-ru-html.mjs при білді, щоб RU-версія віддавалась
// уже перекладеною в HTML (Googlebot і соцботи не чекають на клієнтський i18n). Плейн-Node
// скрипт не може імпортувати .ts, тому JSON — єдине спільне джерело для обох сторін.
import ruStrings from './ru.json';
import ruMeta from './ru-meta.json';

export const RU_STRINGS: Record<string, string> = { ...ruStrings, ...ruMeta };
