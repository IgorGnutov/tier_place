// Постбілд-крок: соцботи (Facebook/Telegram/Twitter preview) не виконують JS, тому
// клієнтський i18n (src/js/i18n.ts) для них марний — вони завжди бачили б українські
// og:title/og:description/twitter:* незалежно від шляху. Тому генеруємо окремий статичний
// dist/ru/index.html із вбудованими RU-мета-тегами з того самого dist/index.html: решта
// сторінки (розмітка, дані) лишається українською в HTML і перекладається в рантаймі —
// боту для прев'ю потрібні лише мета-теги в <head>.
//
// RU-рядки беруться з src/i18n/ru-meta.json — того самого джерела, яке src/i18n/strings.ts
// підмішує в RU_STRINGS для клієнтського рушія, щоб текст не розходився в двох місцях.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distIndexPath = `${root}/dist/index.html`;
const ruMeta = JSON.parse(readFileSync(`${root}/src/i18n/ru-meta.json`, 'utf8'));

let html = readFileSync(distIndexPath, 'utf8');

function replaceAttr(source, matchPrefix, value) {
  const re = new RegExp(`(${matchPrefix})[^"]*(")`);
  if (!re.test(source)) throw new Error(`generate-ru-html: pattern not found — ${matchPrefix}`);
  return source.replace(re, `$1${value}$2`);
}

html = html.replace('<html lang="uk">', '<html lang="ru">');
html = html.replace(
  /<title data-i18n="meta\.title">[^<]*<\/title>/,
  `<title data-i18n="meta.title">${ruMeta['meta.title']}</title>`
);
html = replaceAttr(html, '<meta name="description"[^>]*content="', ruMeta['meta.description']);
html = replaceAttr(html, '<link rel="canonical" id="canonical-link" href="', 'https://tire-place.com.ua/ru/');
html = replaceAttr(html, '<meta property="og:locale" content="', 'ru_RU');
html = replaceAttr(html, '<meta property="og:locale:alternate" content="', 'uk_UA');
html = replaceAttr(html, '<meta property="og:title" content="', ruMeta['meta.ogTitle']);
html = replaceAttr(html, '<meta property="og:description" content="', ruMeta['meta.ogDescription']);
html = replaceAttr(html, '<meta property="og:url" id="og-url-meta" content="', 'https://tire-place.com.ua/ru/');
html = replaceAttr(html, '<meta name="twitter:title" content="', ruMeta['meta.ogTitle']);
html = replaceAttr(html, '<meta name="twitter:description" content="', ruMeta['meta.twitterDescription']);

// dist/ru/index.html живе на рівень глибше за dist/index.html — переписуємо відносні шляхи
// на кореневі (/assets/..., /favicon.svg), що коректно резолвляться незалежно від глибини.
html = html.replace(/="\.\//g, '="/');
html = html.replace(/"assets\//g, '"/assets/');
html = html.replace(/, assets\//g, ', /assets/');

mkdirSync(`${root}/dist/ru`, { recursive: true });
writeFileSync(`${root}/dist/ru/index.html`, html);
console.log('generate-ru-html: dist/ru/index.html generated');
