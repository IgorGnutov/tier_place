// Хелпери патчу вже зібраного dist/index.html. Спільні для generate-product-pages.mjs і
// generate-cluster-pages.mjs — обидва працюють за тим самим принципом: клонують готову
// сторінку й замінюють лише потрібні частини, замість рендеру з нуля.
//
// Усі функції "обов'язкового видалення/заміни" падають, якщо шаблон не знайдено. Це свідомо:
// дрейф index.html інакше молча залишив би на згенерованій сторінці чужий тег або, гірше,
// живий i18n-хук, який main.js перезапише одразу після старту JS.
import { escapeHtml, escapeAttr } from '../../src/shared/html-escape.mjs';

/**
 * Значення підставляється функцією-замінником, а не рядком: у рядку-заміні `$&`, `` $` ``,
 * `$'`, `$1` мають спеціальне значення, тож назва товару з `$&` зіпсувала б результат.
 * @param {string} source @param {string} matchPrefix @param {string} value @param {string} label
 * @returns {string}
 */
export function replaceAttr(source, matchPrefix, value, label = 'html-patch') {
  const re = new RegExp(`(${matchPrefix})[^"]*(")`);
  const match = re.exec(source);
  if (!match) throw new Error(`${label}: pattern not found — ${matchPrefix}`);
  assertAttrBoundary(match[1], matchPrefix, label);
  const escaped = escapeAttr(value);
  return source.replace(re, (_match, before, after) => `${before}${escaped}${after}`);
}

/**
 * Збіг мусить починатись на МЕЖІ імені атрибута, а не всередині нього.
 *
 * На цю пастку вже наступили: шаблон `<meta name="description"[^>]*content="` із жадібним
 * `[^>]*` доїжджав до ОСТАННЬОГО `content="` у тезі, а в оболонці /ru/ це
 * `data-i18n-orig-content="` (його додає generate-ru-html.mjs). Тобто підмінявся кеш-атрибут,
 * а видимий `content` лишався описом головної — усі RU-кластерні сторінки віддавали Google
 * опис головної замість власного, і жодна перевірка цього не ловила. Лікування — лінивий
 * `[^>]*?`; ця перевірка є, щоб наступний такий шаблон падав на білді, а не тихо.
 * @param {string} matched @param {string} matchPrefix @param {string} label
 */
function assertAttrBoundary(matched, matchPrefix, label) {
  const attr = /([\w-]+)="$/.exec(matchPrefix)?.[1];
  if (!attr) return;
  const before = matched.slice(0, -(attr.length + 2)).slice(-1);
  if (before === '' || /\s/.test(before)) return;
  throw new Error(
    `${label}: збіг припав на середину імені атрибута ("${before}${attr}=") у шаблоні ` +
      `${matchPrefix} — зроби [^>]* лінивим ([^>]*?)`
  );
}

/**
 * @param {string} source @param {RegExp} re @param {string} what @param {string} label
 * @returns {string}
 */
export function removeAll(source, re, what, label = 'html-patch') {
  if (!re.test(source)) throw new Error(`${label}: не знайдено для видалення — ${what}`);
  re.lastIndex = 0;
  return source.replace(re, '');
}

/** Один блок JSON-LD разом із коментарем-заголовком перед ним (у head вони йдуть саме так). */
const JSON_LD_BLOCK_RE =
  /[ \t]*(?:<!--[^\r\n]*-->[ \t]*\r?\n[ \t]*)?<script type="application\/ld\+json">[\s\S]*?<\/script>[ \t]*\r?\n?/g;

/**
 * Прибирає JSON-LD блоки з переліченими @type. Google очікує, що розмічений контент реально
 * присутній на сторінці — Service/FAQPage/BreadcrumbList головної на дочірній сторінці зайві.
 * @param {string} html @param {string[]} types @param {string} label @returns {string}
 */
export function removeJsonLd(html, types, label = 'html-patch') {
  const removed = new Set();
  const out = html.replace(JSON_LD_BLOCK_RE, (block) => {
    const match = /"@type"\s*:\s*"([^"]+)"/.exec(block);
    if (match && types.includes(match[1])) {
      removed.add(match[1]);
      return '';
    }
    return block;
  });
  for (const type of types) {
    if (!removed.has(type)) throw new Error(`${label}: JSON-LD блок "${type}" не знайдено в оболонці`);
  }
  return out;
}

/** `<` екранується, щоб рядок із таблиці (напр. "</script>") не міг закрити наш <script>.
 *  @param {unknown} value @returns {string} */
export function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * @param {string} html @param {string} mainInnerHtml @param {string} label @returns {string}
 */
export function replaceMain(html, mainInnerHtml, label = 'html-patch') {
  const startTag = '<main id="main">';
  const start = html.indexOf(startTag);
  const end = html.indexOf('</main>', start);
  if (start === -1 || end === -1) throw new Error(`${label}: <main id="main"> не знайдено в оболонці`);
  return html.slice(0, start + startTag.length) + mainInnerHtml + html.slice(end);
}

/**
 * Зрізає хуки, які main.js перезаписує на старті: i18n.ts's updateHeadForLang() переписує
 * #canonical-link/#og-url-meta на URL головної, а applyStaticTranslations() — усі теги з
 * data-i18n-attr="content:meta.*".
 *
 * БЕЗ цього побудовані тут SEO-теги зникають із DOM, який індексує Google, а у view-source усе
 * виглядає правильно — найпідліший тип регресії в цьому проєкті. Тому зрізання обов'язкове і
 * падає, якщо шаблон не знайдено.
 * @param {string} html @param {string} label @returns {string}
 */
export function stripI18nHooks(html, label = 'html-patch') {
  let out = removeAll(html, / id="canonical-link"/g, 'id="canonical-link"', label);
  out = removeAll(out, / id="og-url-meta"/g, 'id="og-url-meta"', label);
  out = removeAll(out, / data-i18n-attr="content:meta\.[A-Za-z]+"/g, 'data-i18n-attr="content:meta.*"', label);
  return out;
}

/**
 * Пункти меню/футера ведуть на секції головної — на дочірній сторінці голий хеш (#tires)
 * нікуди не веде. Кореневий /#tires працює звідусіль; заодно селектор
 * a[data-nav-link][href="#wheels"] з initCatalogTabs перестає збігатись, тож його
 * preventDefault більше не перехоплює клік.
 * @param {string} html @returns {string}
 */
export function rootifyNavAnchors(html) {
  return html.replace(/href="#([a-z-]+)" data-nav-link/g, 'href="/#$1" data-nav-link');
}

/**
 * Сторінка лежить глибше за dist/index.html — переписуємо відносні шляхи на кореневі
 * (кореневий шлях резолвиться однаково незалежно від глибини поточної сторінки).
 * @param {string} html @returns {string}
 */
export function rootifyAssetPaths(html) {
  return html
    .replace(/="\.\//g, '="/')
    .replace(/"assets\//g, '"/assets/')
    .replace(/, assets\//g, ', /assets/');
}

/**
 * Preload LCP-фото hero-слайдера: hero на дочірній сторінці немає (<main> замінено) — це був
 * би зайвий високопріоритетний запит, що конкурує з вмістом самої сторінки.
 * @param {string} html @param {string} label @returns {string}
 */
export function removeHeroPreload(html, label = 'html-patch') {
  return removeAll(
    html,
    /[ \t]*(?:<!--[^\n]*-->[ \t]*\r?\n[ \t]*)?<link\r?\n[ \t]*rel="preload"[\s\S]*?\/>\r?\n?/g,
    '<link rel="preload" as="image">',
    label
  );
}

export { escapeHtml, escapeAttr };
