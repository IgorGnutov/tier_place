// Постбілд-крок: генерує dist/ru/index.html — РОСІЙСЬКУ версію сторінки, перекладену вже
// в HTML, а не в рантаймі. Причина: ні Googlebot (індексує з затримкою і не гарантує
// виконання JS), ні соцботи (Facebook/Telegram/Twitter preview — JS не виконують взагалі)
// не бачать результату клієнтського i18n (src/js/i18n.ts). Доки перекладався лише <head>,
// у HTML на /ru/ тіло сторінки лишалось українським — тобто сторінка, яка має ранжуватись
// по «шины Кривой Рог», не містила в тексті ні «шины», ні «Кривой Рог».
//
// RU-рядки беруться з тих самих JSON, що їх імпортує клієнт, щоб текст не розходився:
//   src/i18n/ru.json         → RU_STRINGS (data-i18n / data-i18n-html / data-i18n-attr)
//   src/i18n/ru-meta.json    → RU_STRINGS, head/meta.*
//   src/i18n/ru-content.json → CONTENT_REGISTRY defaultHtmlRu (data-content-key)
// Плейн-Node скрипт не може імпортувати .ts — тому джерело саме JSON (див. CLAUDE.md).
//
// Клієнтський i18n лишається робочим і поверх цього: для кожного перекладеного вузла тут
// проставляється кеш українського оригіналу в той самий атрибут, який i18n.ts/content.ts
// читають першими (data-i18n-original / data-i18n-orig-<attr> / data-content-original).
// Без цього перемикач мови RU → UA на /ru/ закешував би російський текст як "оригінал" і
// залишив би сторінку російською.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const distIndexPath = `${root}/dist/index.html`;

const readJson = (name) => JSON.parse(readFileSync(`${root}/src/i18n/${name}`, 'utf8'));
const ruMeta = readJson('ru-meta.json');
const STRINGS = { ...readJson('ru.json'), ...ruMeta };
const CONTENT = readJson('ru-content.json');

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
]);

/** Значення, що стає текстовим вузлом (data-i18n) — екрануємо як текст. */
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Значення, що стає значенням атрибута. */
const escapeAttrValue = (s) => escapeText(s).replace(/"/g, '&quot;');
/** UA-оригінал (уже готовий HTML/текст) → значення атрибута-кешу. `&` НЕ торкаємо, бо в
 *  оригіналі сущності вже екрановані; парсер атрибутів декодує все назад один-в-один. */
const escapeOriginal = (s) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Межі відкривного тега, якому належить атрибут за індексом attrIndex. */
function openTagBounds(html, attrIndex) {
  const start = html.lastIndexOf('<', attrIndex);
  const nameMatch = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start, start + 40));
  if (start === -1 || !nameMatch) {
    throw new Error(`generate-ru-html: не знайдено відкривний тег для атрибута на ${attrIndex}`);
  }
  // Шукаємо '>', що закриває тег, пропускаючи лапки в значеннях атрибутів.
  let i = start + 1;
  let quote = null;
  for (; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      break;
    }
  }
  if (i >= html.length) throw new Error(`generate-ru-html: незакритий тег на ${start}`);
  return { start, gt: i, tag: nameMatch[1].toLowerCase() };
}

/** Межі вмісту елемента з урахуванням вкладеності однойменних тегів. null для void/self-closing. */
function contentBounds(html, bounds) {
  if (VOID_TAGS.has(bounds.tag) || html[bounds.gt - 1] === '/') return null;
  const contentStart = bounds.gt + 1;
  const re = new RegExp(`<(/)?${bounds.tag}(?=[\\s/>])`, 'gi');
  re.lastIndex = contentStart;
  let depth = 1;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      if (--depth === 0) return { contentStart, contentEnd: m.index };
    } else if (html[openTagBounds(html, m.index + 1).gt - 1] !== '/') {
      depth++;
    }
  }
  throw new Error(`generate-ru-html: не знайдено </${bounds.tag}> для тега на ${bounds.start}`);
}

// Усі правки збираються по НЕЗМІНЕНОМУ html і застосовуються з кінця. Це важливо: якщо
// застосовувати їх по ходу, вставлений data-i18n-original="&lt;span data-i18n=…" містив би
// підстрічку `data-i18n="…"`, яку наступний прохід прийняв би за справжній хук.
const edits = [];
const stats = {};

function addEdit(start, end, text, label) {
  edits.push({ start, end, text, label });
}

/** Проходи по вмісту елементів: data-i18n (текст), data-i18n-html і data-content-key (HTML). */
function collectContentPass(html, attrName, dict, { asHtml, cacheAttr }) {
  const re = new RegExp(`\\s${attrName}="([^"]+)"`, 'g');
  let applied = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = m[1];
    const value = dict[key];
    if (value === undefined) continue; // немає перекладу = свідомо лишаємо українською
    const bounds = openTagBounds(html, m.index + 1);
    const content = contentBounds(html, bounds);
    if (!content) throw new Error(`generate-ru-html: ${attrName}="${key}" на <${bounds.tag}> без вмісту`);
    const original = html.slice(content.contentStart, content.contentEnd);
    addEdit(bounds.gt, bounds.gt, ` ${cacheAttr}="${escapeOriginal(original)}"`, key);
    addEdit(content.contentStart, content.contentEnd, asHtml ? value : escapeText(value), key);
    applied++;
  }
  stats[attrName] = applied;
}

/** Прохід по data-i18n-attr: спека виду "aria-label:a11y.x;content:meta.y". */
function collectAttrPass(html) {
  const re = /\sdata-i18n-attr="([^"]+)"/g;
  let applied = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    const bounds = openTagBounds(html, m.index + 1);
    const openTag = html.slice(bounds.start, bounds.gt);
    for (const pair of m[1].split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (!attr || !key) continue;
      const value = STRINGS[key];
      if (value === undefined) continue;
      const attrRe = new RegExp(`\\s${attr}="([^"]*)"`);
      const found = attrRe.exec(openTag);
      if (!found) throw new Error(`generate-ru-html: <${bounds.tag}> не має атрибута ${attr} (ключ ${key})`);
      const valueStart = bounds.start + found.index + found[0].indexOf('"') + 1;
      // Оригінал копіюємо байт-в-байт: він уже екранований як значення атрибута.
      addEdit(bounds.gt, bounds.gt, ` data-i18n-orig-${attr}="${found[1]}"`, key);
      addEdit(valueStart, valueStart + found[1].length, escapeAttrValue(value), key);
      applied++;
    }
  }
  stats['data-i18n-attr'] = applied;
}

function applyEdits(html) {
  // Заміни не мають перетинатися: перетин означав би, що переклад батьківського вузла
  // затирає переклад вкладеного (напр. новий data-i18n усередині data-content-key).
  const ranges = edits.filter((e) => e.end > e.start).sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) {
      throw new Error(
        `generate-ru-html: правки перетинаються — «${ranges[i - 1].label}» і «${ranges[i].label}». ` +
          'Схоже, перекладений вузол вкладений в інший перекладений вузол; розведіть ключі.'
      );
    }
  }
  let out = html;
  for (const e of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

function replaceAttr(source, matchPrefix, value) {
  const re = new RegExp(`(${matchPrefix})[^"]*(")`);
  if (!re.test(source)) throw new Error(`generate-ru-html: pattern not found — ${matchPrefix}`);
  return source.replace(re, `$1${value}$2`);
}

const source = readFileSync(distIndexPath, 'utf8');

collectAttrPass(source);
collectContentPass(source, 'data-i18n-html', STRINGS, { asHtml: true, cacheAttr: 'data-i18n-original' });
collectContentPass(source, 'data-i18n', STRINGS, { asHtml: false, cacheAttr: 'data-i18n-original' });
collectContentPass(source, 'data-content-key', CONTENT, { asHtml: true, cacheAttr: 'data-content-original' });

// Захист від тихої регресії: якщо хуки в index.html перейменують, проходи знайдуть нуль
// вузлів і ми молча віддамо українську сторінку під RU-мета — саме той баг, який тут лікуємо.
for (const [pass, count] of Object.entries(stats)) {
  if (count === 0) throw new Error(`generate-ru-html: прохід ${pass} не переклав жодного вузла`);
}

let html = applyEdits(source);

// Те, що не має i18n-хуків у розмітці й задається лише тут.
html = html.replace('<html lang="uk">', '<html lang="ru">');
html = replaceAttr(html, '<link rel="canonical" id="canonical-link" href="', 'https://tire-place.com.ua/ru/');
html = replaceAttr(html, '<meta property="og:locale:alternate" content="', 'uk_UA');
html = replaceAttr(html, '<meta property="og:url" id="og-url-meta" content="', 'https://tire-place.com.ua/ru/');

// dist/ru/index.html живе на рівень глибше за dist/index.html — переписуємо відносні шляхи
// на кореневі (/assets/..., /favicon.svg), що коректно резолвляться незалежно від глибини.
html = html.replace(/="\.\//g, '="/');
html = html.replace(/"assets\//g, '"/assets/');
html = html.replace(/, assets\//g, ', /assets/');

mkdirSync(`${root}/dist/ru`, { recursive: true });
writeFileSync(`${root}/dist/ru/index.html`, html);
console.log(
  'generate-ru-html: dist/ru/index.html generated —',
  Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(', ')
);
