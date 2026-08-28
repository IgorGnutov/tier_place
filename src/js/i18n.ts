// Мовний рушій: мова визначається виключно з URL (?lang=ru), ніколи не зберігається —
// українська лишається дефолтом для кожного нового заходу. Перемикання відбувається
// без перезавантаження (history.pushState) для реальних відвідувачів, але справжні
// <a href> лишають шлях доступним і для сканування ботом без виконання JS.
import { RU_STRINGS } from '../i18n/strings';

export type Lang = 'uk' | 'ru';

type LangChangeListener = (lang: Lang) => void;
const listeners: LangChangeListener[] = [];

export function getLang(): Lang {
  return new URLSearchParams(window.location.search).get('lang') === 'ru' ? 'ru' : 'uk';
}

/** Ергономічний хелпер для JS-рендерерів: український рядок лишається інлайн у коді
 *  викликача, тут підставляється лише RU-оверрайд, якщо він є в словнику. */
export function t(key: string, ukFallback: string): string {
  return getLang() === 'ru' ? RU_STRINGS[key] ?? ukFallback : ukFallback;
}

export function onLangChange(cb: LangChangeListener): void {
  listeners.push(cb);
}

function applyText(el: HTMLElement, key: string, useHtml: boolean): void {
  const original = el.dataset.i18nOriginal ?? (useHtml ? el.innerHTML : el.textContent ?? '');
  if (el.dataset.i18nOriginal === undefined) el.dataset.i18nOriginal = original;
  const value = getLang() === 'ru' ? RU_STRINGS[key] ?? original : original;
  if (useHtml) el.innerHTML = value;
  else el.textContent = value;
}

export function applyStaticTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => applyText(el, el.dataset.i18n!, false));
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => applyText(el, el.dataset.i18nHtml!, true));

  document.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    const spec = el.dataset.i18nAttr!; // напр. "aria-label:a11y.skipLink;content:meta.description"
    spec.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (!attr || !key) return;
      const cacheAttr = `data-i18n-orig-${attr}`;
      const original = el.getAttribute(cacheAttr) ?? el.getAttribute(attr) ?? '';
      if (!el.hasAttribute(cacheAttr)) el.setAttribute(cacheAttr, original);
      el.setAttribute(attr, getLang() === 'ru' ? RU_STRINGS[key] ?? original : original);
    });
  });
}

function updateHeadForLang(): void {
  document.documentElement.lang = getLang();
  const url = new URL(window.location.href);
  url.search = getLang() === 'ru' ? '?lang=ru' : '';
  url.hash = '';
  const canonicalUrl = url.toString();

  const canonical = document.getElementById('canonical-link') as HTMLLinkElement | null;
  if (canonical) canonical.href = canonicalUrl;

  const ogUrl = document.getElementById('og-url-meta') as HTMLMetaElement | null;
  if (ogUrl) ogUrl.content = canonicalUrl;
}

function currentUrlWithLang(lang: Lang): string {
  const url = new URL(window.location.href);
  if (lang === 'ru') url.searchParams.set('lang', 'ru');
  else url.searchParams.delete('lang');
  return `${url.pathname}${url.search}${url.hash}`;
}

function refreshSwitchLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-lang-link]').forEach((link) => {
    const linkLang: Lang = link.dataset.langLink === 'ru' ? 'ru' : 'uk';
    link.href = currentUrlWithLang(linkLang);
    link.classList.toggle('is-active', linkLang === getLang());
  });
}

/** Прогоняє повний ланцюжок перекладу — і при першому завантаженні, і при кліку
 *  на перемикач мови. applyContentRegistryTranslations (Задача 4) підключається
 *  окремим викликом ззовні через onLangChange, щоб не створювати циклічний імпорт
 *  між i18n.ts і content.ts. */
function translatePage(): void {
  applyStaticTranslations();
  updateHeadForLang();
  refreshSwitchLinks();
  listeners.forEach((cb) => cb(getLang()));
}

function setLang(lang: Lang): void {
  if (lang === getLang()) return;
  window.history.pushState(null, '', currentUrlWithLang(lang));
  translatePage();
}

export function initI18n(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-lang-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setLang(link.dataset.langLink === 'ru' ? 'ru' : 'uk');
    });
  });
  // Browser back/forward changes window.location.search (our pushState history entries)
  // without firing any of our own handlers — re-derive from the URL and re-render.
  window.addEventListener('popstate', () => {
    translatePage();
  });
  translatePage();
}
