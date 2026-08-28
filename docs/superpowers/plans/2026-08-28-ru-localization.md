# RU Localization Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Russian-language version of the site, reachable at `?lang=ru`, purely for SEO reach — Ukrainian stays the permanent default for every visitor, with a small, low-visual-weight "UA / RU" text switch in the header.

**Architecture:** A single `src/js/i18n.ts` engine reads the language from the URL (never persisted), and applies translations three ways: (1) a generic `data-i18n` / `data-i18n-html` / `data-i18n-attr` sweep over static `index.html` markup driven by a flat `RU_STRINGS` dictionary, (2) an ergonomic `t(key, ukFallback)` helper called from JS renderers (product cards, cart, filters) so the Ukrainian string stays inline in the code and only the Russian override lives in the dictionary, and (3) a content-registry layer that seeds real Russian text for the `/admin`-editable blocks (hero subtitle, service intros, FAQ answers, footer copy) with an optional `value_ru` Sheet column able to override it later. `history.pushState` swaps the URL and re-runs translation without a full reload; real `<a href="?lang=ru">` links keep it crawlable and working without JS.

**Tech Stack:** Vite + vanilla TypeScript (existing stack, no new dependencies).

**Spec:** `docs/superpowers/specs/2026-08-28-ru-localization-design.md`

## Global Constraints

- Ukrainian is the permanent default for every visitor — language is derived from the URL only, never from localStorage/sessionStorage/cookies. (spec: "Мета")
- Product names (brand + model) and every other value sourced from the Google Sheets CSVs (season, type, color, etc.) are never translated — rendered exactly as the sheet provides them. (spec: "Мета", "Явні межі скоупу" §2)
- `/admin` UI (`src/admin/**`, `admin/apps-script/Code.gs`) is not modified in any way. RU copy for `CONTENT_REGISTRY` blocks is either the hardcoded baseline this plan adds, or a `value_ru` cell the owner edits directly in the Google Sheet — never through `/admin`. (spec: "Явні межі скоупу" §3)
- The 5 JSON-LD `<script type="application/ld+json">` blocks in `index.html` are left untouched (Ukrainian only). (spec: "Явні межі скоупу" §1)
- The language switch UI must read as a subtle text pair ("UA / RU"), not an icon or flag, placed in `.header-actions`. (spec: "§4 index.html")
- No test framework is configured in this repo (`CLAUDE.md`) — verification per task is `npm run typecheck` plus a manual check in `npm run dev`, not automated unit tests.
- `base: './'` relative asset paths and the existing URL query-param filter state (`tires_*`/`wheels_*`, see `src/js/filters.ts`) must keep working unchanged when a `lang` param is also present.

---

## Task 1: i18n engine, RU dictionary, header language switch, head/meta wiring

**Files:**
- Create: `src/i18n/strings.ts`
- Create: `src/js/i18n.ts`
- Modify: `index.html:1-233` (head meta/hreflang/canonical ids + attrs, header-actions switch markup)
- Modify: `src/styles/header.css` (append `.lang-switch` styles)
- Modify: `src/main.ts` (wire `initI18n()` first)

**Interfaces:**
- Produces (used by every later task):
  - `export type Lang = 'uk' | 'ru'` (`src/js/i18n.ts`)
  - `export function getLang(): Lang`
  - `export function t(key: string, ukFallback: string): string`
  - `export function applyStaticTranslations(): void`
  - `export function onLangChange(cb: (lang: Lang) => void): void`
  - `export function initI18n(): void`
  - `export const RU_STRINGS: Record<string, string>` (`src/i18n/strings.ts`)

- [ ] **Step 1: Write the RU strings dictionary**

Create `src/i18n/strings.ts`:

```ts
// Плаский словник RU-перекладів. Ключ відсутній тут = слово однакове в обох мовах
// (напр. "Диски", "Бренд") — t()/applyStaticTranslations просто лишають український
// оригінал. Українські рядки НЕ дублюються тут — вони живуть в index.html/*.ts як є.
export const RU_STRINGS: Record<string, string> = {
  // --- nav ---
  'nav.tires': 'Шины',
  'nav.batteries': 'Аккумуляторы',
  'nav.contacts': 'Контакты',

  // --- head / meta ---
  'meta.title': 'Шины, диски, аккумуляторы Кривой Рог — TIRE PLACE',
  'meta.description':
    'Автомагазин TIRE PLACE в Кривом Роге: шины и диски в наличии, аккумуляторы, собственный шиномонтаж на авторынке «Терминал». Подбор по размеру.',
  'meta.ogTitle': 'TIRE PLACE — шины, диски и аккумуляторы в Кривом Роге',
  'meta.ogDescription':
    'Твоё шинное пространство. Шины, диски, аккумуляторы и собственный шиномонтаж на авторынке «Терминал» в Кривом Роге.',
  'meta.ogLocale': 'ru_RU',
  'meta.twitterDescription':
    'Твоё шинное пространство. Шины, диски, аккумуляторы и собственный шиномонтаж на авторынке «Терминал».',

  // --- hero ---
  'hero.trust1': 'В наличии и на складе',
  'hero.trust2': 'Подбор шин и дисков под ваш автомобиль',
  'hero.trust3': 'Монтаж на месте',
  'hero.trust4': 'Самовывоз и доставка Новой Почтой',
  'cta.buyTires': 'Купить шины и диски',
  'cta.bookService': 'Записаться на шиномонтаж',

  // --- catalog / filters ---
  'catalog.headingHtml': '<span class="accent">Шины</span> и диски в Кривом Роге',
  'catalog.tabsAria': 'Каталог шин и дисков',
  'filters.profile': 'Профиль',
  'filters.diameter': 'Диаметр (R)',
  'filters.studded': 'Шипы',
  'filters.priceLabel': 'Цена, грн',
  'filters.priceFrom': 'от',
  'filters.anyM': 'Любой',
  'filters.anyF': 'Любая',
  'filters.notImportant': 'Не важно',
  'filters.reset': 'Сбросить фильтр',
  'filters.sortAria': 'Сортировка',
  'filters.sortDefault': 'По умолчанию',
  'filters.sortPriceAsc': 'Цена: сначала дешевле',
  'filters.sortPriceDesc': 'Цена: сначала дороже',
  'filters.sortNameAsc': 'По названию (А–Я)',
  'filters.pcd': 'Разболтовка (PCD)',
  'filters.et': 'Вылет (ET)',
  'product.loading': 'Загрузка…',
  'product.loadMore': 'Показать ещё',

  // --- product cards / catalog state ---
  'product.loadIndex': 'Индекс нагрузки',
  'product.speedIndex': 'Индекс скорости',
  'product.color': 'Цвет',
  'product.yes': 'Да',
  'product.no': 'Нет',
  'product.inStock': 'В наличии',
  'product.outOfStock': 'Нет в наличии',
  'product.buy': 'Купить',
  'product.priceOnRequest': 'Цена по запросу',
  'product.foundLabel': 'Найдено',
  'product.foundDemoSuffix': ' (показаны демо-данные, таблица временно недоступна)',
  'product.notFound': 'Ничего не найдено по выбранным фильтрам.',
  'product.loadErrorPrefix': 'Не удалось загрузить данные: ',
  'product.noProductsYet': 'Товаров пока нет.',
  'product.retry': 'Попробовать ещё раз',
  'product.removeFilterAria': 'Убрать фильтр',
  'product.addedToCart': 'Добавлено в корзину',

  // --- service ---
  'service.eyebrow': 'Услуги',
  'service.headingHtml': 'Шиномонтаж <span class="accent">без очереди</span>',
  'service.bookMessage': 'Здравствуйте, хочу записаться на шиномонтаж',

  // --- batteries ---
  'battery.eyebrow': 'В наличии',
  'battery.headingHtml': 'Автомобильные <span class="accent">аккумуляторы</span>',
  'battery.contactBtn': 'Свяжитесь с нами',

  // --- contacts ---
  'contacts.eyebrow': 'Где мы',
  'contacts.headingHtml': 'Контакты <span class="accent">TIRE PLACE</span>',
  'contacts.addressLabel': 'Адрес',
  'contacts.addressValue': 'Авторынок «Терминал», улица Никопольское шоссе 1Г, Кривой Рог',
  'contacts.hoursLabel': 'График работы',
  'contacts.socialsLabel': 'Мы в соцсетях',
  'contacts.mapLoadingText': 'Карта загружается только по вашему запросу, чтобы не замедлять страницу.',
  'contacts.mapShowBtn': 'Показать карту',
  'contacts.mapRouteLink': 'Проложить маршрут',
  'contacts.mapIframeTitle': 'Карта: автомагазин TIRE PLACE, авторынок «Терминал», Кривой Рог',

  // --- faq ---
  'faq.eyebrow': 'Вопросы',
  'faq.heading': 'Частые вопросы',
  'faq.q1': 'Есть ли шины и диски в наличии?',
  'faq.q2': 'Как подобрать размер шин или дисков?',
  'faq.q3': 'Сколько длится шиномонтаж?',
  'faq.q4': 'Можно ли заказать диски под конкретный автомобиль?',
  'faq.q5': 'Где вас найти?',
  'faq.q6': 'Нужна ли предварительная запись на шиномонтаж?',
  'faq.q7': 'Какие аккумуляторы в продаже?',

  // --- footer ---
  'footer.rightsReserved': 'Все права защищены.',
  'footer.slogan': 'Твоё шинное пространство',

  // --- cart / checkout ---
  'cart.dialogAria': 'Корзина',
  'cart.heading': 'Корзина',
  'cart.closeAria': 'Закрыть корзину',
  'cart.empty': 'Корзина пуста',
  'cart.decreaseAria': 'Уменьшить количество',
  'cart.increaseAria': 'Увеличить количество',
  'cart.removeAria': 'Удалить товар',
  'cart.totalLabel': 'Итого',
  'cart.nameLabel': 'Имя',
  'cart.phoneLabel': 'Номер телефона',
  'cart.deliveryLegend': 'Способ доставки',
  'cart.pickup': 'Самовывоз из магазина',
  'cart.novaPoshta': 'Новая Почта',
  'cart.cityLabel': 'Город',
  'cart.branchLabel': 'Отделение или адрес',
  'cart.commentLabel': 'Комментарий (необязательно)',
  'cart.submitBtn': 'Оформить заказ',
  'cart.errorNamePhone': 'Укажите имя и номер телефона',
  'cart.errorNp': 'Укажите город и отделение или адрес Новой Почты',
  'cart.confirmMessage': 'Заказ принят, мы с вами свяжемся',
  'cart.orderToast': 'Заказ оформлен',
  'cart.orderErrorFallback': 'Не удалось оформить заказ',

  // --- a11y / misc ---
  'a11y.burgerOpen': 'Открыть меню',
  'a11y.phoneCall': 'Позвонить: +38 (098) 071-93-93',
  'a11y.skipLink': 'Перейти к основному контенту',
  'a11y.heroSliderAria': 'Фото автомагазина TIRE PLACE, Кривой Рог',
  'a11y.heroPrev': 'Предыдущее фото',
  'a11y.heroNext': 'Следующее фото',
  'a11y.heroPauseLabel': 'Пауза автопереключения слайдов',
  'a11y.heroPlayLabel': 'Возобновить автопереключение слайдов',
  'a11y.of': 'из',
  'a11y.logoHome': 'TIRE PLACE — на главную',
  'a11y.footerNavAria': 'Навигация в футере',
  'a11y.mainNavAria': 'Основная навигация',
  'a11y.telegramFloatingAria': 'Написать нам в Telegram',
  'a11y.langSwitchAria': 'Язык сайта',
};
```

- [ ] **Step 2: Write the i18n engine**

Create `src/js/i18n.ts`:

```ts
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
  const canonical = document.getElementById('canonical-link') as HTMLLinkElement | null;
  if (!canonical) return;
  const url = new URL(window.location.href);
  url.search = getLang() === 'ru' ? '?lang=ru' : '';
  url.hash = '';
  canonical.href = url.toString();
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
  translatePage();
}
```

- [ ] **Step 3: Wire `initI18n()` first in `main.ts`**

In `src/main.ts`, add the import and call it before everything else:

```ts
import './styles/main.css';
import { initI18n } from './js/i18n';
import { initNav } from './js/nav';
```

```ts
initI18n();
initNav();
initCatalogTabs();
```

(keep the rest of the existing call order unchanged — just prepend `initI18n();`)

- [ ] **Step 4: Add hreflang/canonical ids and meta translation attrs to `index.html` `<head>`**

Replace:
```html
  <title>Шини, диски, акумулятори Кривий Ріг — TIRE PLACE</title>
  <meta name="description" content="Автомагазин TIRE PLACE у Кривому Розі: шини та диски в наявності, акумулятори, власний шиномонтаж на авторинку «Термінал». Підбір за розміром." />
  <link rel="canonical" href="https://tireplace.com.ua/" />
```
with:
```html
  <title data-i18n="meta.title">Шини, диски, акумулятори Кривий Ріг — TIRE PLACE</title>
  <meta name="description" content="Автомагазин TIRE PLACE у Кривому Розі: шини та диски в наявності, акумулятори, власний шиномонтаж на авторинку «Термінал». Підбір за розміром." data-i18n-attr="content:meta.description" />
  <link rel="canonical" id="canonical-link" href="https://tireplace.com.ua/" />
  <link rel="alternate" hreflang="uk" href="https://tireplace.com.ua/" />
  <link rel="alternate" hreflang="ru" href="https://tireplace.com.ua/?lang=ru" />
  <link rel="alternate" hreflang="x-default" href="https://tireplace.com.ua/" />
```

Replace:
```html
  <meta property="og:locale" content="uk_UA" />
  <meta property="og:site_name" content="TIRE PLACE" />
  <meta property="og:title" content="TIRE PLACE — шини, диски та акумулятори в Кривому Розі" />
  <meta property="og:description" content="Твій шинний простір. Шини, диски, акумулятори та власний шиномонтаж на авторинку «Термінал» у Кривому Розі." />
```
with:
```html
  <meta property="og:locale" content="uk_UA" data-i18n-attr="content:meta.ogLocale" />
  <meta property="og:site_name" content="TIRE PLACE" />
  <meta property="og:title" content="TIRE PLACE — шини, диски та акумулятори в Кривому Розі" data-i18n-attr="content:meta.ogTitle" />
  <meta property="og:description" content="Твій шинний простір. Шини, диски, акумулятори та власний шиномонтаж на авторинку «Термінал» у Кривому Розі." data-i18n-attr="content:meta.ogDescription" />
```

Replace:
```html
  <meta name="twitter:title" content="TIRE PLACE — шини, диски та акумулятори в Кривому Розі" />
  <meta name="twitter:description" content="Твій шинний простір. Шини, диски, акумулятори та власний шиномонтаж на авторинку «Термінал»." />
```
with:
```html
  <meta name="twitter:title" content="TIRE PLACE — шини, диски та акумулятори в Кривому Розі" data-i18n-attr="content:meta.ogTitle" />
  <meta name="twitter:description" content="Твій шинний простір. Шини, диски, акумулятори та власний шиномонтаж на авторинку «Термінал»." data-i18n-attr="content:meta.twitterDescription" />
```

- [ ] **Step 5: Add the header language switch markup**

In `index.html`, inside `.header-actions`, right before the phone link:

```html
      <div class="header-actions">
        <div class="lang-switch" data-i18n-attr="aria-label:a11y.langSwitchAria" aria-label="Мова сайту">
          <a href="?" class="lang-switch__link" data-lang-link="uk">UA</a><span class="lang-switch__sep" aria-hidden="true">/</span><a href="?lang=ru" class="lang-switch__link" data-lang-link="ru">RU</a>
        </div>
        <a class="header-phone" href="tel:+380980719393" aria-label="Подзвонити: +38 (098) 071-93-93" data-i18n-attr="aria-label:a11y.phoneCall">
```

(only the two new lines — the `<a class="header-phone"...>` line itself just gains the `data-i18n-attr` attribute; its existing `<svg>`/`<span>` children are unchanged.)

- [ ] **Step 6: Style the switch**

Append to `src/styles/header.css`:

```css
.lang-switch {
  display: flex;
  align-items: center;
  gap: 0.3em;
  font-size: var(--fs-small);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.lang-switch__sep {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.lang-switch__link {
  color: var(--color-text-muted);
  text-decoration: none;
  padding: 0.25em 0.15em;
  transition: color var(--transition);
}

.lang-switch__link:hover,
.lang-switch__link:focus-visible {
  color: var(--color-text);
}

.lang-switch__link.is-active {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, open the printed local URL.
- Header shows "UA / RU" next to the phone icon, small and unobtrusive; "UA" underlined (active).
- Click "RU": URL becomes `...?lang=ru` without a page reload, "RU" becomes underlined/active, `<html lang="ru">` (check via devtools), `<title>` and the description meta tag change in devtools Elements panel, `<link rel="canonical">`'s `href` now ends in `?lang=ru`.
- Reload directly on `/?lang=ru`: same RU state renders immediately, no UK flash.
- Click "UA": everything reverts, including `<title>`/canonical.
- `view-source:` the page (or `curl` it) and confirm the three `<link rel="alternate" hreflang=...>` tags are present in the raw HTML (not just after JS runs).

- [ ] **Step 9: Commit**

```bash
git add src/i18n/strings.ts src/js/i18n.ts src/main.ts index.html src/styles/header.css
git commit -m "Add i18n engine, RU dictionary, and header language switch"
```

---

## Task 2: Static translations — header nav, hero, catalog/filters/tabs/sort

**Files:**
- Modify: `index.html:210-216` (nav), `:238-256` (hero), `:304-441` (catalog section)

**Interfaces:**
- Consumes: `RU_STRINGS` keys from Task 1 (`nav.*`, `hero.*`/`cta.*`, `catalog.*`, `filters.*`, `product.loading`/`product.loadMore`).
- Produces: nothing new — pure markup annotation.

- [ ] **Step 1: Header nav**

Replace:
```html
      <nav class="main-nav" id="main-nav" aria-label="Основна навігація">
        <a class="main-nav__link" href="#tires" data-nav-link>Шини</a>
        <a class="main-nav__link" href="#wheels" data-nav-link>Диски</a>
        <a class="main-nav__link" href="#service" data-nav-link>Шиномонтаж</a>
        <a class="main-nav__link" href="#batteries" data-nav-link>Акумулятори</a>
        <a class="main-nav__link" href="#contacts" data-nav-link>Контакти</a>
      </nav>
```
with:
```html
      <nav class="main-nav" id="main-nav" aria-label="Основна навігація" data-i18n-attr="aria-label:a11y.mainNavAria">
        <a class="main-nav__link" href="#tires" data-nav-link data-i18n="nav.tires">Шини</a>
        <a class="main-nav__link" href="#wheels" data-nav-link>Диски</a>
        <a class="main-nav__link" href="#service" data-nav-link>Шиномонтаж</a>
        <a class="main-nav__link" href="#batteries" data-nav-link data-i18n="nav.batteries">Акумулятори</a>
        <a class="main-nav__link" href="#contacts" data-nav-link data-i18n="nav.contacts">Контакти</a>
      </nav>
```

(the "Диски" and "Шиномонтаж" links are intentionally left without `data-i18n` — those words are spelled identically in Ukrainian and Russian, and there is no `RU_STRINGS` entry for them, so `t()`/`applyStaticTranslations` would just no-op anyway; skipping the attribute keeps the diff meaningful.)

Also update the logo aria-labels (both header and footer instances) and skip-link:

Replace `aria-label="TIRE PLACE — на головну"` (appears twice — header logo and footer logo) with `aria-label="TIRE PLACE — на головну" data-i18n-attr="aria-label:a11y.logoHome"` in both places.

Replace:
```html
  <a class="skip-link" href="#main">Перейти до основного контенту</a>
```
with:
```html
  <a class="skip-link" href="#main" data-i18n="a11y.skipLink">Перейти до основного контенту</a>
```

- [ ] **Step 2: Hero section**

Replace:
```html
        <ul class="hero__trust">
          <li>В наявності та на складі</li>
          <li>Підбір шин та дисків під ваше авто</li>
          <li>Монтаж на місці</li>
          <li>Самовивіз та доставка Новою Поштою</li>
        </ul>
```
with:
```html
        <ul class="hero__trust">
          <li data-i18n="hero.trust1">В наявності та на складі</li>
          <li data-i18n="hero.trust2">Підбір шин та дисків під ваше авто</li>
          <li data-i18n="hero.trust3">Монтаж на місці</li>
          <li data-i18n="hero.trust4">Самовивіз та доставка Новою Поштою</li>
        </ul>
```

Replace:
```html
        <div class="cta-row">
          <a class="btn" href="#tires" data-nav-link>Купити шини та диски</a>
          <a class="btn btn--outline" href="#service" data-nav-link>Записатись на шиномонтаж</a>
        </div>
```
with:
```html
        <div class="cta-row">
          <a class="btn" href="#tires" data-nav-link data-i18n="cta.buyTires">Купити шини та диски</a>
          <a class="btn btn--outline" href="#service" data-nav-link data-i18n="cta.bookService">Записатись на шиномонтаж</a>
        </div>
```

Also translate the hero slider ARIA label (`<div class="hero__slider" ... aria-label="Фото автомагазину TIRE PLACE, Кривий Ріг">`) by adding `data-i18n-attr="aria-label:a11y.heroSliderAria"`, and the two arrow buttons:
```html
          <button class="hero__arrow hero__arrow--prev" id="hero-prev" aria-label="Попереднє фото" data-i18n-attr="aria-label:a11y.heroPrev">‹</button>
          <button class="hero__arrow hero__arrow--next" id="hero-next" aria-label="Наступне фото" data-i18n-attr="aria-label:a11y.heroNext">›</button>
```

- [ ] **Step 3: Catalog section — eyebrow/heading/tabs**

Replace:
```html
        <div class="section-head">
          <span class="section-head__eyebrow">Каталог</span>
          <h2><span class="accent">Шини</span> та диски у Кривому Розі</h2>
          <p data-content-key="catalog.intro">Підберіть легкові, зимові чи всесезонні шини чи диски за параметрами вашого авто — дані оновлюються автоматично з нашого прайсу.</p>
        </div>

        <div class="tabs" role="tablist" aria-label="Каталог шин і дисків">
          <button class="tabs__btn is-active" id="tab-tires" role="tab" aria-selected="true" aria-controls="tires" data-tab="tires">Шини</button>
          <button class="tabs__btn" id="tab-wheels" role="tab" aria-selected="false" aria-controls="wheels" data-tab="wheels">Диски</button>
        </div>
```
with:
```html
        <div class="section-head">
          <span class="section-head__eyebrow">Каталог</span>
          <h2 data-i18n-html="catalog.headingHtml"><span class="accent">Шини</span> та диски у Кривому Розі</h2>
          <p data-content-key="catalog.intro">Підберіть легкові, зимові чи всесезонні шини чи диски за параметрами вашого авто — дані оновлюються автоматично з нашого прайсу.</p>
        </div>

        <div class="tabs" role="tablist" aria-label="Каталог шин і дисків" data-i18n-attr="aria-label:catalog.tabsAria">
          <button class="tabs__btn is-active" id="tab-tires" role="tab" aria-selected="true" aria-controls="tires" data-tab="tires" data-i18n="nav.tires">Шини</button>
          <button class="tabs__btn" id="tab-wheels" role="tab" aria-selected="false" aria-controls="wheels" data-tab="wheels">Диски</button>
        </div>
```

(`catalog.intro`'s `<p>` is a `CONTENT_REGISTRY` block — its RU text is handled in Task 4, not here.)

- [ ] **Step 4: Tires filters form**

Replace the tires `filters__grid` block:
```html
              <div class="filters__field">
                <label for="tires-width">Ширина</label>
                <select id="tires-width" name="width"><option value="">Будь-яка</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-profile">Профіль</label>
                <select id="tires-profile" name="profile"><option value="">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-diameter">Діаметр (R)</label>
                <select id="tires-diameter" name="diameter"><option value="">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-season">Сезон</label>
                <select id="tires-season" name="season"><option value="">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-studded">Шипи</label>
                <select id="tires-studded" name="studded"><option value="">Не важливо</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-brand">Бренд</label>
                <select id="tires-brand" name="brand"><option value="">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-price-min">Ціна, грн</label>
                <div class="filters__price">
                  <input type="number" id="tires-price-min" name="priceMin" placeholder="від" min="0" inputmode="numeric" />
                  <input type="number" id="tires-price-max" name="priceMax" placeholder="до" min="0" inputmode="numeric" />
                </div>
              </div>
```
with:
```html
              <div class="filters__field">
                <label for="tires-width">Ширина</label>
                <select id="tires-width" name="width"><option value="" data-i18n="filters.anyF">Будь-яка</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-profile" data-i18n="filters.profile">Профіль</label>
                <select id="tires-profile" name="profile"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-diameter" data-i18n="filters.diameter">Діаметр (R)</label>
                <select id="tires-diameter" name="diameter"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-season">Сезон</label>
                <select id="tires-season" name="season"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-studded" data-i18n="filters.studded">Шипи</label>
                <select id="tires-studded" name="studded"><option value="" data-i18n="filters.notImportant">Не важливо</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-brand">Бренд</label>
                <select id="tires-brand" name="brand"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="tires-price-min" data-i18n="filters.priceLabel">Ціна, грн</label>
                <div class="filters__price">
                  <input type="number" id="tires-price-min" name="priceMin" placeholder="від" min="0" inputmode="numeric" data-i18n-attr="placeholder:filters.priceFrom" />
                  <input type="number" id="tires-price-max" name="priceMax" placeholder="до" min="0" inputmode="numeric" />
                </div>
              </div>
```

Replace:
```html
            <div class="filters__actions">
              <button type="button" class="btn btn--outline btn--small" data-reset>Скинути фільтр</button>
            </div>
            <div class="filters__chips" id="tires-chips"></div>
          </form>

          <div class="results-bar">
            <span id="tires-count" aria-live="polite">Завантаження…</span>
            <div class="results-bar__sort">
              <label for="tires-sort" class="visually-hidden">Сортування</label>
              <select id="tires-sort">
                <option value="default">За замовчуванням</option>
                <option value="price-asc">Ціна: спочатку дешевші</option>
                <option value="price-desc">Ціна: спочатку дорожчі</option>
                <option value="name-asc">За назвою (А–Я)</option>
              </select>
            </div>
          </div>

          <div class="product-grid" id="tires-grid" aria-live="polite"></div>
          <div class="load-more" id="tires-load-more-wrap" hidden>
            <button class="btn btn--outline" id="tires-load-more">Показати ще</button>
          </div>
```
with:
```html
            <div class="filters__actions">
              <button type="button" class="btn btn--outline btn--small" data-reset data-i18n="filters.reset">Скинути фільтр</button>
            </div>
            <div class="filters__chips" id="tires-chips"></div>
          </form>

          <div class="results-bar">
            <span id="tires-count" aria-live="polite" data-i18n="product.loading">Завантаження…</span>
            <div class="results-bar__sort">
              <label for="tires-sort" class="visually-hidden" data-i18n="filters.sortAria">Сортування</label>
              <select id="tires-sort">
                <option value="default" data-i18n="filters.sortDefault">За замовчуванням</option>
                <option value="price-asc" data-i18n="filters.sortPriceAsc">Ціна: спочатку дешевші</option>
                <option value="price-desc" data-i18n="filters.sortPriceDesc">Ціна: спочатку дорожчі</option>
                <option value="name-asc" data-i18n="filters.sortNameAsc">За назвою (А–Я)</option>
              </select>
            </div>
          </div>

          <div class="product-grid" id="tires-grid" aria-live="polite"></div>
          <div class="load-more" id="tires-load-more-wrap" hidden>
            <button class="btn btn--outline" id="tires-load-more" data-i18n="product.loadMore">Показати ще</button>
          </div>
```

- [ ] **Step 5: Wheels filters form (same pattern)**

Apply the equivalent replacements to the `#wheels` panel:
```html
              <div class="filters__field">
                <label for="wheels-diameter" data-i18n="filters.diameter">Діаметр (R)</label>
                <select id="wheels-diameter" name="diameter"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="wheels-width">Ширина (J)</label>
                <select id="wheels-width" name="width"><option value="" data-i18n="filters.anyF">Будь-яка</option></select>
              </div>
              <div class="filters__field">
                <label for="wheels-pcd" data-i18n="filters.pcd">Розболтовка (PCD)</label>
                <select id="wheels-pcd" name="pcd"><option value="" data-i18n="filters.anyF">Будь-яка</option></select>
              </div>
              <div class="filters__field">
                <label for="wheels-et" data-i18n="filters.et">Виліт (ET)</label>
                <select id="wheels-et" name="et"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="wheels-dia">ЦО (DIA)</label>
                <select id="wheels-dia" name="dia"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="wheels-type">Тип</label>
                <select id="wheels-type" name="type"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="wheels-brand">Бренд</label>
                <select id="wheels-brand" name="brand"><option value="" data-i18n="filters.anyM">Будь-який</option></select>
              </div>
              <div class="filters__field">
                <label for="wheels-price-min" data-i18n="filters.priceLabel">Ціна, грн</label>
                <div class="filters__price">
                  <input type="number" id="wheels-price-min" name="priceMin" placeholder="від" min="0" inputmode="numeric" data-i18n-attr="placeholder:filters.priceFrom" />
                  <input type="number" id="wheels-price-max" name="priceMax" placeholder="до" min="0" inputmode="numeric" />
                </div>
              </div>
            </div>
            <div class="filters__actions">
              <button type="button" class="btn btn--outline btn--small" data-reset data-i18n="filters.reset">Скинути фільтр</button>
            </div>
            <div class="filters__chips" id="wheels-chips"></div>
          </form>

          <div class="results-bar">
            <span id="wheels-count" aria-live="polite" data-i18n="product.loading">Завантаження…</span>
            <div class="results-bar__sort">
              <label for="wheels-sort" class="visually-hidden" data-i18n="filters.sortAria">Сортування</label>
              <select id="wheels-sort">
                <option value="default" data-i18n="filters.sortDefault">За замовчуванням</option>
                <option value="price-asc" data-i18n="filters.sortPriceAsc">Ціна: спочатку дешевші</option>
                <option value="price-desc" data-i18n="filters.sortPriceDesc">Ціна: спочатку дорожчі</option>
                <option value="name-asc" data-i18n="filters.sortNameAsc">За назвою (А–Я)</option>
              </select>
            </div>
          </div>

          <div class="product-grid" id="wheels-grid" aria-live="polite"></div>
          <div class="load-more" id="wheels-load-more-wrap" hidden>
            <button class="btn btn--outline" id="wheels-load-more" data-i18n="product.loadMore">Показати ще</button>
          </div>
```

- [ ] **Step 6: Typecheck + manual check**

Run: `npm run typecheck` — no errors expected (pure `.html` edits, but re-run since Task 1's TS files are in the same project).
Run: `npm run dev`, switch to RU, confirm: nav labels, hero trust list/CTAs, catalog heading/tabs, both filter forms' labels/placeholders/select-placeholders/sort options/"Скинути фільтр"/"Показати ще" are all Russian; the "Диски"/"Шиномонтаж" nav words and brand/season/diameter/PCD/ET/DIA/type select values (populated from the sheet at runtime) are unaffected (still whatever the sheet/local CSV contains).

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Translate header nav, hero, and catalog/filters UI to RU"
```

---

## Task 3: Static translations — service, batteries, contacts, FAQ, footer

**Files:**
- Modify: `index.html:446-644` (service/batteries/contacts/faq sections), `:647-703` (footer)

**Interfaces:**
- Consumes: `RU_STRINGS` keys `service.*`, `battery.*`, `contacts.*`, `faq.*`, `footer.*`, `a11y.*` from Task 1.

- [ ] **Step 1: Service section**

Replace:
```html
        <div class="section-head">
          <span class="section-head__eyebrow">Послуги</span>
          <h2>Шиномонтаж <span class="accent">без черги</span></h2>
        </div>
```
with:
```html
        <div class="section-head">
          <span class="section-head__eyebrow" data-i18n="service.eyebrow">Послуги</span>
          <h2 data-i18n-html="service.headingHtml">Шиномонтаж <span class="accent">без черги</span></h2>
        </div>
```

(the four perk titles/descriptions — `service.perk1.title` etc. — are `CONTENT_REGISTRY` blocks, handled in Task 4.)

- [ ] **Step 2: Batteries section**

Replace:
```html
        <div class="section-head">
          <span class="section-head__eyebrow">В наявності</span>
          <h2>Автомобільні <span class="accent">акумулятори</span></h2>
        </div>
```
with:
```html
        <div class="section-head">
          <span class="section-head__eyebrow" data-i18n="battery.eyebrow">В наявності</span>
          <h2 data-i18n-html="battery.headingHtml">Автомобільні <span class="accent">акумулятори</span></h2>
        </div>
```

Replace:
```html
        <div class="battery-cta">
          <a class="btn" id="battery-contact-btn" href="#" target="_blank" rel="noopener">Зв'яжіться з нами</a>
        </div>
```
with:
```html
        <div class="battery-cta">
          <a class="btn" id="battery-contact-btn" href="#" target="_blank" rel="noopener" data-i18n="battery.contactBtn">Зв'яжіться з нами</a>
        </div>
```

(the brand tiles — Bosch, Varta, Fiamm, etc. — are proper nouns, left untouched.)

- [ ] **Step 3: Contacts section**

Replace:
```html
        <div class="section-head">
          <span class="section-head__eyebrow">Де ми</span>
          <h2>Контакти <span class="accent">TIRE PLACE</span></h2>
        </div>
```
with:
```html
        <div class="section-head">
          <span class="section-head__eyebrow" data-i18n="contacts.eyebrow">Де ми</span>
          <h2 data-i18n-html="contacts.headingHtml">Контакти <span class="accent">TIRE PLACE</span></h2>
        </div>
```

Replace:
```html
              <div>
                <h3>Телефон</h3>
                <a class="contacts-phone-link" href="tel:+380980719393">+38 (098) 071-93-93</a>
              </div>
```
(no `data-i18n` — "Телефон" is spelled identically in both languages, phone number unchanged.)

Replace:
```html
              <div>
                <h3>Адреса</h3>
                <p>Авторинок «Термінал», вулиця Нікопольське Шосе 1Г, Кривий Ріг</p>
              </div>
```
with:
```html
              <div>
                <h3 data-i18n="contacts.addressLabel">Адреса</h3>
                <p data-i18n="contacts.addressValue">Авторинок «Термінал», вулиця Нікопольське Шосе 1Г, Кривий Ріг</p>
              </div>
```

Replace:
```html
              <div>
                <h3>Графік роботи</h3>
                <!-- TODO: уточнити точний графік роботи у власника -->
                <p id="hours-note" data-content-key="contacts.hoursNote">Щодня, 9:00–19:00 (графік уточнюється)</p>
              </div>

            <div>
              <h3>Ми в соцмережах</h3>
```
with:
```html
              <div>
                <h3 data-i18n="contacts.hoursLabel">Графік роботи</h3>
                <!-- TODO: уточнити точний графік роботи у власника -->
                <p id="hours-note" data-content-key="contacts.hoursNote">Щодня, 9:00–19:00 (графік уточнюється)</p>
              </div>

            <div>
              <h3 data-i18n="contacts.socialsLabel">Ми в соцмережах</h3>
```

(`contacts.hoursNote` is a `CONTENT_REGISTRY` block — Task 4.)

Replace:
```html
              <div class="map-placeholder" id="map-placeholder">
                <p>Карта завантажується лише за вашим запитом, щоб не сповільнювати сторінку.</p>
                <button class="btn" id="map-show-btn">Показати карту</button>
              </div>
            </div>
            <div class="map-actions">
              <a class="btn btn--outline btn--small" id="map-route-link" href="#" target="_blank" rel="noopener">Прокласти маршрут</a>
            </div>
```
with:
```html
              <div class="map-placeholder" id="map-placeholder">
                <p data-i18n="contacts.mapLoadingText">Карта завантажується лише за вашим запитом, щоб не сповільнювати сторінку.</p>
                <button class="btn" id="map-show-btn" data-i18n="contacts.mapShowBtn">Показати карту</button>
              </div>
            </div>
            <div class="map-actions">
              <a class="btn btn--outline btn--small" id="map-route-link" href="#" target="_blank" rel="noopener" data-i18n="contacts.mapRouteLink">Прокласти маршрут</a>
            </div>
```

- [ ] **Step 4: FAQ questions**

Replace each `<summary>` (the answers in `<p data-content-key="faq.N">` are untouched here — Task 4):
```html
          <details class="faq-item">
            <summary>Чи є шини та диски в наявності?</summary>
```
→ `<summary data-i18n="faq.q1">Чи є шини та диски в наявності?</summary>`

```html
          <details class="faq-item">
            <summary>Як підібрати розмір шин або дисків?</summary>
```
→ `<summary data-i18n="faq.q2">Як підібрати розмір шин або дисків?</summary>`

```html
          <details class="faq-item">
            <summary>Скільки триває шиномонтаж?</summary>
```
→ `<summary data-i18n="faq.q3">Скільки триває шиномонтаж?</summary>`

```html
          <details class="faq-item">
            <summary>Чи можна замовити диски під конкретне авто?</summary>
```
→ `<summary data-i18n="faq.q4">Чи можна замовити диски під конкретне авто?</summary>`

```html
          <details class="faq-item">
            <summary>Де вас знайти?</summary>
```
→ `<summary data-i18n="faq.q5">Де вас знайти?</summary>`

```html
          <details class="faq-item">
            <summary>Чи потрібен попередній запис на шиномонтаж?</summary>
```
→ `<summary data-i18n="faq.q6">Чи потрібен попередній запис на шиномонтаж?</summary>`

```html
          <details class="faq-item">
            <summary>Які акумулятори у продажу?</summary>
```
→ `<summary data-i18n="faq.q7">Які акумулятори у продажу?</summary>`

Also the FAQ section head:
```html
        <div class="section-head">
          <span class="section-head__eyebrow">Питання</span>
          <h2>Часті запитання</h2>
        </div>
```
with:
```html
        <div class="section-head">
          <span class="section-head__eyebrow" data-i18n="faq.eyebrow">Питання</span>
          <h2 data-i18n="faq.heading">Часті запитання</h2>
        </div>
```

- [ ] **Step 5: Footer**

Replace:
```html
        <nav class="footer-nav" aria-label="Навігація у футері">
          <a href="#tires" data-nav-link>Шини</a>
          <a href="#wheels" data-nav-link>Диски</a>
          <a href="#service" data-nav-link>Шиномонтаж</a>
          <a href="#batteries" data-nav-link>Акумулятори</a>
          <a href="#contacts" data-nav-link>Контакти</a>
        </nav>
```
with:
```html
        <nav class="footer-nav" aria-label="Навігація у футері" data-i18n-attr="aria-label:a11y.footerNavAria">
          <a href="#tires" data-nav-link data-i18n="nav.tires">Шини</a>
          <a href="#wheels" data-nav-link>Диски</a>
          <a href="#service" data-nav-link>Шиномонтаж</a>
          <a href="#batteries" data-nav-link data-i18n="nav.batteries">Акумулятори</a>
          <a href="#contacts" data-nav-link data-i18n="nav.contacts">Контакти</a>
        </nav>
```

Replace:
```html
      <div class="footer-bottom">
        <p>© <span id="footer-year"></span> TIRE PLACE. Всі права захищені.</p>
        <p>Твій шинний простір</p>
      </div>
```
with:
```html
      <div class="footer-bottom">
        <p>© <span id="footer-year"></span> TIRE PLACE. <span data-i18n="footer.rightsReserved">Всі права захищені.</span></p>
        <p data-i18n="footer.slogan">Твій шинний простір</p>
      </div>
```

Also the floating Telegram CTA:
```html
  <a class="floating-cta" id="floating-telegram" href="https://t.me/AnastasiyaBaza" target="_blank" rel="noopener" aria-label="Написати нам у Telegram">
```
with:
```html
  <a class="floating-cta" id="floating-telegram" href="https://t.me/AnastasiyaBaza" target="_blank" rel="noopener" aria-label="Написати нам у Telegram" data-i18n-attr="aria-label:a11y.telegramFloatingAria">
```

- [ ] **Step 6: Typecheck + manual check**

Run: `npm run typecheck` — no errors.
Run: `npm run dev`, switch to RU, scroll through Service/Batteries/Contacts/FAQ/footer — eyebrows, headings, CTA buttons, address label/value, hours label, socials label, map placeholder text/button/route link, all 7 FAQ questions, footer nav labels, footer rights/slogan lines are Russian. Battery brand tiles are unaffected.

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "Translate service/batteries/contacts/FAQ/footer UI to RU"
```

---

## Task 4: Content-registry RU baseline + Sheet `value_ru` override

**Files:**
- Modify: `src/admin/content-registry.ts` (add `defaultHtmlRu` to every `ContentBlock`)
- Modify: `src/js/content.ts` (RU-aware lookup + apply-before-sheet-override ordering)
- Modify: `public/data/content.csv` (add empty `value_ru` header column)

**Interfaces:**
- Consumes: `getLang`, `onLangChange` from `src/js/i18n.ts` (Task 1).
- Produces: `ContentBlock.defaultHtmlRu: string` (read only by `content.ts`, not by `/admin`).

- [ ] **Step 1: Extend `ContentBlock` and add RU baselines**

In `src/admin/content-registry.ts`, update the interface:

```ts
export interface ContentBlock {
  key: string;
  label: string;
  group: string;
  defaultHtml: string;
  /** RU-переклад за замовчуванням — використовується лише публічним сайтом (content.ts)
   *  для лишти "суто SEO" RU-версії; /admin його не показує й не редагує. */
  defaultHtmlRu: string;
}
```

Add `defaultHtmlRu` to every entry in `CONTENT_REGISTRY` (19 entries, matching each existing `defaultHtml`):

```ts
  {
    key: 'hero.eyebrow',
    label: 'Гасло під заголовком',
    group: 'Hero',
    defaultHtml: 'Твій шинний простір',
    defaultHtmlRu: 'Твоё шинное пространство',
  },
  {
    key: 'hero.subtitle',
    label: 'Підзаголовок hero',
    group: 'Hero',
    defaultHtml:
      'Шини, диски та акумулятори в Кривому Розі. Власний шиномонтаж на авторинку «Термінал» — підбір за розміром і монтаж на місці.',
    defaultHtmlRu:
      'Шины, диски и аккумуляторы в Кривом Роге. Собственный шиномонтаж на авторынке «Терминал» — подбор по размеру и монтаж на месте.',
  },
  {
    key: 'catalog.intro',
    label: 'Вступ над каталогом шин/дисків',
    group: 'Каталог',
    defaultHtml:
      'Підберіть легкові, зимові чи всесезонні шини чи диски за параметрами вашого авто — дані оновлюються автоматично з нашого прайсу.',
    defaultHtmlRu:
      'Подберите летние, зимние или всесезонные шины или диски по параметрам вашего автомобиля — данные обновляются автоматически из нашего прайса.',
  },
  {
    key: 'service.intro1',
    label: 'Шиномонтаж — вступний абзац 1',
    group: 'Шиномонтаж',
    defaultHtml:
      'Власний шиномонтаж автомагазину TIRE PLACE на авторинку «Термінал» у Кривому Розі виконує балансування коліс, ремонт проколу та бокового порізу, перебортування й сезонну заміну шин на легкових авто та кросоверах. Працюємо на сучасному обладнанні, тому зняття й встановлення колеса, як правило, займає лічені хвилини.',
    defaultHtmlRu:
      'Собственный шиномонтаж автомагазина TIRE PLACE на авторынке «Терминал» в Кривом Роге выполняет балансировку колёс, ремонт прокола и бокового пореза, перебортовку и сезонную замену шин на легковых авто и кроссоверах. Работаем на современном оборудовании, поэтому снятие и установка колеса, как правило, занимает считаные минуты.',
  },
  {
    key: 'service.intro2',
    label: 'Шиномонтаж — вступний абзац 2',
    group: 'Шиномонтаж',
    defaultHtml:
      "Не потрібно записуватись заздалегідь — шиномонтаж легкових авто в нас працює оперативно, а на всі роботи надається гарантія. Актуальну ціну уточнюйте за телефоном або в Telegram.",
    defaultHtmlRu:
      'Не нужно записываться заранее — шиномонтаж легковых авто у нас работает оперативно, а на все работы предоставляется гарантия. Актуальную цену уточняйте по телефону или в Telegram.',
  },
  {
    key: 'service.perk1.title',
    label: 'Перк 1 — заголовок',
    group: 'Шиномонтаж',
    defaultHtml: 'Сучасне обладнання',
    defaultHtmlRu: 'Современное оборудование',
  },
  {
    key: 'service.perk1.desc',
    label: 'Перк 1 — текст',
    group: 'Шиномонтаж',
    defaultHtml: 'Балансувальні стенди та шиномонтажні верстати для легкових дисків.',
    defaultHtmlRu: 'Балансировочные стенды и шиномонтажные станки для легковых дисков.',
  },
  {
    key: 'service.perk2.title',
    label: 'Перк 2 — заголовок',
    group: 'Шиномонтаж',
    defaultHtml: 'Легкові авто й кросовери',
    defaultHtmlRu: 'Легковые авто и кроссоверы',
  },
  {
    key: 'service.perk2.desc',
    label: 'Перк 2 — текст',
    group: 'Шиномонтаж',
    defaultHtml: 'Монтаж коліс будь-яких легкових дисків і кросоверних розмірів.',
    defaultHtmlRu: 'Монтаж колёс любых легковых дисков и кроссоверных размеров.',
  },
  {
    key: 'service.perk3.title',
    label: 'Перк 3 — заголовок',
    group: 'Шиномонтаж',
    defaultHtml: 'Порошкове фарбування дисків',
    defaultHtmlRu: 'Порошковая покраска дисков',
  },
  {
    key: 'service.perk3.desc',
    label: 'Перк 3 — текст',
    group: 'Шиномонтаж',
    defaultHtml: 'Оновлюємо диски порошковою фарбою в потрібний колір — захист від корозії та охайний вигляд.',
    defaultHtmlRu: 'Обновляем диски порошковой краской в нужный цвет — защита от коррозии и аккуратный вид.',
  },
  {
    key: 'service.perk4.title',
    label: 'Перк 4 — заголовок',
    group: 'Шиномонтаж',
    defaultHtml: 'Сезонне зберігання шин',
    defaultHtmlRu: 'Сезонное хранение шин',
  },
  {
    key: 'service.perk4.desc',
    label: 'Перк 4 — текст',
    group: 'Шиномонтаж',
    defaultHtml: 'Приймаємо комплекти шин на зберігання між сезонами — не потрібно тримати їх удома чи в гаражі.',
    defaultHtmlRu: 'Принимаем комплекты шин на хранение между сезонами — не нужно держать их дома или в гараже.',
  },
  {
    key: 'batteries.intro',
    label: 'Вступ до акумуляторів',
    group: 'Акумулятори',
    defaultHtml:
      'В автомагазині TIRE PLACE у Кривому Розі представлені стартерні акумулятори (АКБ) провідних виробників для легкових авто. Підберемо акумулятор за ємністю, полярністю та габаритами під ваше авто — просто напишіть нам марку й модель або дані зі старого АКБ.',
    defaultHtmlRu:
      'В автомагазине TIRE PLACE в Кривом Роге представлены стартерные аккумуляторы (АКБ) ведущих производителей для легковых авто. Подберём аккумулятор по ёмкости, полярности и габаритам под ваш автомобиль — просто напишите нам марку и модель или данные со старого АКБ.',
  },
  {
    key: 'contacts.hoursNote',
    label: 'Графік роботи',
    group: 'Контакти',
    defaultHtml: 'Щодня, 9:00–19:00 (графік уточнюється)',
    defaultHtmlRu: 'Ежедневно, 9:00–19:00 (график уточняется)',
  },
  {
    key: 'footer.tagline',
    label: 'Гасло у футері',
    group: 'Футер',
    defaultHtml: 'Твій шинний простір. Шини, диски, акумулятори та власний шиномонтаж у Кривому Розі.',
    defaultHtmlRu: 'Твоё шинное пространство. Шины, диски, аккумуляторы и собственный шиномонтаж в Кривом Роге.',
  },
  {
    key: 'footer.seoText',
    label: 'SEO-абзац у футері',
    group: 'Футер',
    defaultHtml:
      'TIRE PLACE — автомагазин шин, дисків та акумуляторів у Кривому Розі, розташований на авторинку «Термінал» по вулиці Нікопольське шосе. У нас можна купити шини Кривий Ріг: літні, зимові та всесезонні шини для легкових авто, кросоверів і невеликих вантажних авто в розмірах від R13 до R20. Окремо представлені легкосплавні (литі) та штамповані диски Кривий Ріг практично під будь-яке авто — з підбором за діаметром, шириною, розболтовкою (PCD) та вильотом (ET). Власний шиномонтаж на території магазину виконує балансування коліс, ремонт проколів, перебортування та сезонну заміну шин швидко і без тривалого очікування в черзі. Також у продажу автомобільні акумулятори (АКБ) відомих виробників — Bosch, Varta, Fiamm, Rombat, Westa, Topla, Vega — з підбором за ємністю, полярністю і габаритами. Якщо не знаєте точний розмір — підкажемо за номером авто чи розміром, вказаним на боковині старої шини. Магазин зручно розташований для мешканців Кривого Рогу та найближчих районів — заїжджайте на авторинок «Термінал» або пишіть нам у Telegram, щоб уточнити ціну чи записатися на шиномонтаж.',
    defaultHtmlRu:
      'TIRE PLACE — автомагазин шин, дисков и аккумуляторов в Кривом Роге, расположенный на авторынке «Терминал» по улице Никопольское шоссе. У нас можно купить шины Кривой Рог: летние, зимние и всесезонные шины для легковых авто, кроссоверов и небольших грузовых авто в размерах от R13 до R20. Отдельно представлены легкосплавные (литые) и штампованные диски Кривой Рог практически под любое авто — с подбором по диаметру, ширине, разболтовке (PCD) и вылету (ET). Собственный шиномонтаж на территории магазина выполняет балансировку колёс, ремонт проколов, перебортовку и сезонную замену шин быстро и без долгого ожидания в очереди. Также в продаже автомобильные аккумуляторы (АКБ) известных производителей — Bosch, Varta, Fiamm, Rombat, Westa, Topla, Vega — с подбором по ёмкости, полярности и габаритам. Если не знаете точный размер — подскажем по номеру авто или размеру, указанному на боковине старой шины. Магазин удобно расположен для жителей Кривого Рога и ближайших районов — заезжайте на авторынок «Терминал» или пишите нам в Telegram, чтобы уточнить цену или записаться на шиномонтаж.',
  },
  {
    key: 'faq.1',
    label: 'FAQ 1 — Чи є шини та диски в наявності?',
    group: 'FAQ',
    defaultHtml:
      'Так, в автомагазині TIRE PLACE у Кривому Розі широкий вибір літніх, зимових та всесезонних шин, а також литих і штампованих дисків — актуальну наявність дивіться в каталозі вище або уточнюйте за телефоном.',
    defaultHtmlRu:
      'Да, в автомагазине TIRE PLACE в Кривом Роге широкий выбор летних, зимних и всесезонных шин, а также литых и штампованных дисков — актуальное наличие смотрите в каталоге выше или уточняйте по телефону.',
  },
  {
    key: 'faq.2',
    label: 'FAQ 2 — Як підібрати розмір шин або дисків?',
    group: 'FAQ',
    defaultHtml:
      'Скористайтесь калькулятором у розділі «Шини та диски»: вкажіть ширину, профіль і діаметр (R) для шин або діаметр, PCD і виліт (ET) для дисків — фільтр покаже лише доступні варіанти під ваш автомобіль.',
    defaultHtmlRu:
      'Воспользуйтесь калькулятором в разделе «Шины и диски»: укажите ширину, профиль и диаметр (R) для шин или диаметр, PCD и вылет (ET) для дисков — фильтр покажет только доступные варианты под ваш автомобиль.',
  },
  {
    key: 'faq.3',
    label: 'FAQ 3 — Скільки триває шиномонтаж?',
    group: 'FAQ',
    defaultHtml:
      'Заміна коліс на легковому авто чи кросовері в нашому шиномонтажі на авторинку «Термінал» зазвичай займає від 20 до 40 хвилин залежно від розміру шин і диска.',
    defaultHtmlRu:
      'Замена колёс на легковом авто или кроссовере в нашем шиномонтаже на авторынке «Терминал» обычно занимает от 20 до 40 минут в зависимости от размера шин и диска.',
  },
  {
    key: 'faq.4',
    label: 'FAQ 4 — Чи можна замовити диски під конкретне авто?',
    group: 'FAQ',
    defaultHtml:
      'Так, підберемо диски за розболтовкою (PCD), вильотом (ET) і діаметром центрального отвору (DIA) вашого автомобіля — напишіть нам у Telegram параметри або модель авто.',
    defaultHtmlRu:
      'Да, подберём диски по разболтовке (PCD), вылету (ET) и диаметру центрального отверстия (DIA) вашего автомобиля — напишите нам в Telegram параметры или модель авто.',
  },
  {
    key: 'faq.5',
    label: 'FAQ 5 — Де вас знайти?',
    group: 'FAQ',
    defaultHtml:
      'Автомагазин TIRE PLACE розташований на авторинку «Термінал» по вулиці Нікопольське шосе в Кривому Розі — дивіться карту та маршрут у розділі «Контакти».',
    defaultHtmlRu:
      'Автомагазин TIRE PLACE расположен на авторынке «Терминал» по улице Никопольское шоссе в Кривом Роге — смотрите карту и маршрут в разделе «Контакты».',
  },
  {
    key: 'faq.6',
    label: 'FAQ 6 — Чи потрібен попередній запис на шиномонтаж?',
    group: 'FAQ',
    defaultHtml:
      "Запис не обов'язковий, шиномонтаж легкових авто та кросоверів у нас працює без черги, але для гарантованого часу краще написати нам у Telegram заздалегідь.",
    defaultHtmlRu:
      'Запись не обязательна, шиномонтаж легковых авто и кроссоверов у нас работает без очереди, но для гарантированного времени лучше написать нам в Telegram заранее.',
  },
  {
    key: 'faq.7',
    label: 'FAQ 7 — Які акумулятори у продажу?',
    group: 'FAQ',
    defaultHtml:
      'В наявності стартерні АКБ популярних виробників: Bosch, Varta, Fiamm, Rombat, Westa, Topla, Vega — підберемо акумулятор за ємністю, полярністю та габаритами під ваше авто.',
    defaultHtmlRu:
      'В наличии стартерные АКБ популярных производителей: Bosch, Varta, Fiamm, Rombat, Westa, Topla, Vega — подберём аккумулятор по ёмкости, полярности и габаритам под ваш автомобиль.',
  },
```

- [ ] **Step 2: Apply the RU baseline before the sheet loads, and prefer `value_ru` when present**

Replace the full contents of `src/js/content.ts`:

```ts
// Підстановка текстових блоків, відредагованих через /admin (лист "Контент" у Google Sheets).
// Якщо лист не налаштований, порожній або для конкретного блоку ще нема рядка — залишається
// статичний текст, що вже прописаний в index.html, тож відсутність даних тут не є помилкою.
//
// RU: перед завантаженням Sheet підставляється захардкоджений RU-бейзлайн (CONTENT_REGISTRY
// defaultHtmlRu), щоб RU-версія не показувала українські абзаци, поки власник не заповнив
// колонку value_ru в Sheet. Порядок пріоритету для lang=ru: value_ru із Sheet → value (UA)
// із Sheet, якщо RU-клітинку ще не заповнили → захардкоджений RU-бейзлайн, застосований нижче.
//
// applyContentBaseline() кешує оригінальний UA-innerHTML кожного блоку в data-content-original
// при першому виклику — без цього перемикання RU → UA залишало б RU-текст "застряглим",
// бо просто пропускати застосування для lang==='uk' недостатньо: потрібно явно повернути
// збережений UA-оригінал.
import { loadCsv } from './sheets';
import { SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV } from '../config';
import { CONTENT_REGISTRY } from '../admin/content-registry';
import { getLang, onLangChange } from './i18n';

function applyContentBaseline(): void {
  const lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-content-key]').forEach((el) => {
    const key = el.dataset.contentKey;
    if (!key) return;
    const original = el.dataset.contentOriginal ?? el.innerHTML;
    if (el.dataset.contentOriginal === undefined) el.dataset.contentOriginal = original;
    const block = CONTENT_REGISTRY.find((b) => b.key === key);
    el.innerHTML = lang === 'ru' && block ? block.defaultHtmlRu : original;
  });
}

export async function initContent(): Promise<void> {
  applyContentBaseline();
  onLangChange(() => applyContentBaseline());

  const { rows } = await loadCsv(SHEET_CONTENT_CSV, LOCAL_CONTENT_CSV);
  if (rows.length === 0) return;

  const values = new Map<string, string>();
  const valuesRu = new Map<string, string>();
  for (const row of rows) {
    if (!row.key) continue;
    values.set(row.key, row.value ?? '');
    if (row.value_ru) valuesRu.set(row.key, row.value_ru);
  }

  function applySheetValues(): void {
    document.querySelectorAll<HTMLElement>('[data-content-key]').forEach((el) => {
      const key = el.dataset.contentKey;
      if (!key) return;
      const value = getLang() === 'ru' ? valuesRu.get(key) || values.get(key) : values.get(key);
      if (value) el.innerHTML = value;
    });
  }

  // Порядок при кожній зміні мови важливий: спершу applyContentBaseline() повертає
  // правильну базову мову (UA-оригінал або RU-бейзлайн), і лише потім applySheetValues()
  // накладає зверху Sheet-оверрайд, якщо він є для цієї мови.
  applySheetValues();
  onLangChange(() => {
    applyContentBaseline();
    applySheetValues();
  });
}
```

- [ ] **Step 3: Extend the local demo CSV schema**

Replace the contents of `public/data/content.csv`:

```
key,value,value_ru
```

(a header-only file, matching the current empty state — just documents the schema for when the owner starts filling it in directly in the Sheet.)

- [ ] **Step 4: Typecheck + manual check**

Run: `npm run typecheck` — no errors.
Run: `npm run dev`, switch to RU, confirm the hero subtitle/eyebrow, catalog intro paragraph, both service intro paragraphs, all 4 perk titles/descriptions, battery intro, hours note, footer tagline + SEO paragraph, and all 7 FAQ answers are now in Russian (reading from `defaultHtmlRu`, since the Sheet/local CSV is still empty). Switch back to UA — all of the above revert to the original Ukrainian text.

- [ ] **Step 5: Commit**

```bash
git add src/admin/content-registry.ts src/js/content.ts public/data/content.csv
git commit -m "Add RU baseline translations for admin-editable content blocks"
```

---

## Task 5: Dynamic catalog rendering — product cards, filters, chips

**Files:**
- Modify: `src/js/filters.ts`
- Modify: `src/js/render-products.ts`

**Interfaces:**
- Consumes: `t`, `onLangChange` from `src/js/i18n.ts` (Task 1).

- [ ] **Step 1: Translate boolean display in `filters.ts`**

In `src/js/filters.ts`, add the import and update `fieldDisplay`:

```ts
import type { CsvRow } from './csv';
import { parseBool } from './csv';
import { t } from './i18n';
```

Replace:
```ts
function fieldDisplay(field: FieldDef, value: string): string {
  if (field.boolean) return value === 'true' ? 'Так' : 'Ні';
  return value;
}
```
with:
```ts
function fieldDisplay(field: FieldDef, value: string): string {
  if (field.boolean) return value === 'true' ? t('product.yes', 'Так') : t('product.no', 'Ні');
  return value;
}
```

- [ ] **Step 2: Translate card specs, status, buy button, price, and chip labels in `render-products.ts`**

Add the import:
```ts
import { t } from './i18n';
```

Replace the status line:
```ts
  const status = document.createElement('span');
  status.className = `status ${info.inStock ? 'status--in' : 'status--out'}`;
  status.textContent = info.inStock ? 'В наявності' : 'Немає в наявності';
  card.appendChild(status);
```
with:
```ts
  const status = document.createElement('span');
  status.className = `status ${info.inStock ? 'status--in' : 'status--out'}`;
  status.textContent = info.inStock ? t('product.inStock', 'В наявності') : t('product.outOfStock', 'Немає в наявності');
  card.appendChild(status);
```

Replace the price line:
```ts
  price.textContent = info.price !== null ? `${info.price.toLocaleString('uk-UA')} грн` : 'Ціна за запитом';
```
with:
```ts
  price.textContent = info.price !== null ? `${info.price.toLocaleString('uk-UA')} грн` : t('product.priceOnRequest', 'Ціна за запитом');
```

Replace the buy button:
```ts
  const buyBtn = document.createElement('button');
  buyBtn.type = 'button';
  buyBtn.className = 'btn btn--small';
  buyBtn.textContent = 'Купити';
  if (!info.inStock) {
    buyBtn.disabled = true;
    buyBtn.title = 'Немає в наявності';
  }
  buyBtn.addEventListener('click', () => {
    if (!info.inStock) return;
    addItem({ key: info.key, title: info.title, sizeLine: info.sizeLine, price: info.price });
    showToast('Додано в кошик');
  });
```
with:
```ts
  const buyBtn = document.createElement('button');
  buyBtn.type = 'button';
  buyBtn.className = 'btn btn--small';
  buyBtn.textContent = t('product.buy', 'Купити');
  if (!info.inStock) {
    buyBtn.disabled = true;
    buyBtn.title = t('product.outOfStock', 'Немає в наявності');
  }
  buyBtn.addEventListener('click', () => {
    if (!info.inStock) return;
    addItem({ key: info.key, title: info.title, sizeLine: info.sizeLine, price: info.price });
    showToast(t('product.addedToCart', 'Додано в кошик'));
  });
```

Replace the "try again" retry button text:
```ts
    retryBtn.textContent = 'Спробувати ще';
```
with:
```ts
    retryBtn.textContent = t('product.retry', 'Спробувати ще');
```

Replace the loading/count text in `initCatalog`:
```ts
  renderSkeleton(grid);
  countEl.textContent = 'Завантаження…';
```
with:
```ts
  renderSkeleton(grid);
  countEl.textContent = t('product.loading', 'Завантаження…');
```

Replace the empty/error states:
```ts
    renderState(
      grid,
      result.error ? `Не вдалося завантажити дані: ${result.error}` : 'Товарів поки немає.',
      Boolean(result.error),
      () => initCatalog(config)
    );
```
with:
```ts
    renderState(
      grid,
      result.error ? `${t('product.loadErrorPrefix', 'Не вдалося завантажити дані: ')}${result.error}` : t('product.noProductsYet', 'Товарів поки немає.'),
      Boolean(result.error),
      () => initCatalog(config)
    );
```

Replace the chip generation (translates both the field label and the "Так"/"Ні" chip value, plus the remove button's aria-label):
```ts
  function renderChips(): void {
    chipsEl.innerHTML = '';
    fields.forEach((field) => {
      const value = state[field.key];
      if (!value) return;
      const label = field.key === 'diameter' ? `R${value}` : value === 'true' ? 'Так' : value === 'false' ? 'Ні' : value;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${field.label}: ${label} <button type="button" aria-label="Прибрати фільтр ${field.label}">×</button>`;
      chip.querySelector('button')?.addEventListener('click', () => {
        delete state[field.key];
        const select = el<HTMLSelectElement>(`${idPrefix}-${field.key}`);
        if (select) select.value = '';
        onFiltersChanged();
      });
      chipsEl.appendChild(chip);
    });
  }
```
with:
```ts
  function renderChips(): void {
    chipsEl.innerHTML = '';
    fields.forEach((field) => {
      const value = state[field.key];
      if (!value) return;
      const fieldLabel = t(`filters.${field.key}`, field.label);
      const label =
        field.key === 'diameter' ? `R${value}` : value === 'true' ? t('product.yes', 'Так') : value === 'false' ? t('product.no', 'Ні') : value;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${fieldLabel}: ${label} <button type="button" aria-label="${t('product.removeFilterAria', 'Прибрати фільтр')} ${fieldLabel}">×</button>`;
      chip.querySelector('button')?.addEventListener('click', () => {
        delete state[field.key];
        const select = el<HTMLSelectElement>(`${idPrefix}-${field.key}`);
        if (select) select.value = '';
        onFiltersChanged();
      });
      chipsEl.appendChild(chip);
    });
  }
```

Replace the "not found" state and the found-count line:
```ts
    if (filtered.length === 0) {
      renderState(grid, 'Нічого не знайдено за обраними фільтрами.', false);
    } else {
      filtered.slice(0, visibleCount).forEach((row) => grid.appendChild(renderCard(config.describe(row))));
    }

    const warningSuffix = countEl.dataset.warning ? ' (показано демо-дані, таблиця тимчасово недоступна)' : '';
    countEl.textContent = `Знайдено: ${filtered.length}${warningSuffix}`;
```
with:
```ts
    if (filtered.length === 0) {
      renderState(grid, t('product.notFound', 'Нічого не знайдено за обраними фільтрами.'), false);
    } else {
      filtered.slice(0, visibleCount).forEach((row) => grid.appendChild(renderCard(config.describe(row))));
    }

    const warningSuffix = countEl.dataset.warning ? t('product.foundDemoSuffix', ' (показано демо-дані, таблиця тимчасово недоступна)') : '';
    countEl.textContent = `${t('product.foundLabel', 'Знайдено')}: ${filtered.length}${warningSuffix}`;
```

Replace the tires/wheels product specs (both `tiresDescribe` and `wheelsDescribe`):
```ts
    specs: [
      { label: 'Сезон', value: row.season ?? '—' },
      { label: 'Шипи', value: parseBool(row.studded) ? 'Так' : 'Ні' },
      ...(row.load_index ? [{ label: 'Індекс навантаження', value: row.load_index }] : []),
      ...(row.speed_index ? [{ label: 'Індекс швидкості', value: row.speed_index }] : []),
    ],
```
with:
```ts
    specs: [
      { label: t('filters.season', 'Сезон'), value: row.season ?? '—' },
      { label: t('filters.studded', 'Шипи'), value: parseBool(row.studded) ? t('product.yes', 'Так') : t('product.no', 'Ні') },
      ...(row.load_index ? [{ label: t('product.loadIndex', 'Індекс навантаження'), value: row.load_index }] : []),
      ...(row.speed_index ? [{ label: t('product.speedIndex', 'Індекс швидкості'), value: row.speed_index }] : []),
    ],
```

```ts
    specs: [
      { label: 'Тип', value: row.type ?? '—' },
      { label: 'PCD', value: row.pcd ?? '—' },
      { label: 'ET', value: row.et ?? '—' },
      { label: 'DIA', value: row.dia ?? '—' },
      ...(row.color ? [{ label: 'Колір', value: row.color }] : []),
    ],
```
with:
```ts
    specs: [
      { label: t('filters.type', 'Тип'), value: row.type ?? '—' },
      { label: 'PCD', value: row.pcd ?? '—' },
      { label: 'ET', value: row.et ?? '—' },
      { label: 'DIA', value: row.dia ?? '—' },
      ...(row.color ? [{ label: t('product.color', 'Колір'), value: row.color }] : []),
    ],
```

(the `title`/`size`/`key`/`sizeLine` fields built from `row.brand`/`row.model`/etc. are untouched — product names never translate.)

- [ ] **Step 3: Re-render the active catalog when the language changes**

In `initCatalog`, after the existing initial-render calls at the end of the function:
```ts
  buildSelects();
  renderChips();
  renderResults();
}
```
with:
```ts
  buildSelects();
  renderChips();
  renderResults();

  onLangChange(() => {
    buildSelects();
    renderChips();
    renderResults();
  });
}
```

Add the import at the top of `render-products.ts`:
```ts
import { t, onLangChange } from './i18n';
```

- [ ] **Step 4: Typecheck + manual check**

Run: `npm run typecheck` — no errors.
Run: `npm run dev`, on the Шини/Диски tabs switch to RU: card spec labels (Сезон/Шипи/Так-Ні/Тип/Колір/Індекс навантаження-швидкості), status badge, price-on-request fallback, "Купити" button, out-of-stock title, "Знайдено: N" line, empty/error/retry states, filter chips (label + Так/Ні + remove aria-label), select placeholders repopulate correctly — all in Russian. Product titles (brand + model + size) and any raw sheet values (season word, type word, color word, brand names) remain exactly as the CSV provides them, unaffected by language. Add a tire/wheel to the cart in RU mode and confirm the "Додано в кошик" toast now reads "Добавлено в корзину" (full cart translation lands in Task 6, but the toast call itself is wired here).

- [ ] **Step 5: Commit**

```bash
git add src/js/filters.ts src/js/render-products.ts
git commit -m "Translate product catalog rendering to RU"
```

---

## Task 6: Dynamic cart/checkout, service CTA message, map iframe title

**Files:**
- Modify: `src/js/cart-ui.ts`
- Modify: `src/js/render-service.ts`
- Modify: `src/js/map.ts`
- Modify: `src/js/nav.ts` (burger aria-label)

**Interfaces:**
- Consumes: `t`, `onLangChange` from `src/js/i18n.ts` (Task 1).

- [ ] **Step 1: Translate the cart drawer markup**

In `src/js/cart-ui.ts`, add the import:
```ts
import { t, onLangChange } from './i18n';
```

Replace `formatPrice`:
```ts
function formatPrice(price: number | null): string {
  return price !== null ? `${price.toLocaleString('uk-UA')} грн` : 'Ціна за запитом';
}
```
with:
```ts
function formatPrice(price: number | null): string {
  return price !== null ? `${price.toLocaleString('uk-UA')} грн` : t('product.priceOnRequest', 'Ціна за запитом');
}
```

Replace `buildDrawerMarkup`:
```ts
function buildDrawerMarkup(): string {
  return `
    <div class="cart-overlay" id="cart-overlay"></div>
    <aside class="cart-drawer" id="cart-drawer" aria-hidden="true" role="dialog" aria-label="Кошик">
      <div class="cart-drawer__head">
        <h2>Кошик</h2>
        <button type="button" class="cart-drawer__close" id="cart-close" aria-label="Закрити кошик">×</button>
      </div>
      <div class="cart-drawer__body" id="cart-body"></div>
    </aside>
  `;
}
```
with:
```ts
function buildDrawerMarkup(): string {
  return `
    <div class="cart-overlay" id="cart-overlay"></div>
    <aside class="cart-drawer" id="cart-drawer" aria-hidden="true" role="dialog" aria-label="${t('cart.dialogAria', 'Кошик')}">
      <div class="cart-drawer__head">
        <h2>${t('cart.heading', 'Кошик')}</h2>
        <button type="button" class="cart-drawer__close" id="cart-close" aria-label="${t('cart.closeAria', 'Закрити кошик')}">×</button>
      </div>
      <div class="cart-drawer__body" id="cart-body"></div>
    </aside>
  `;
}
```

Replace `renderItemsList`:
```ts
function renderItemsList(container: HTMLElement, items: CartItem[]): void {
  if (items.length === 0) {
    container.innerHTML = '<p class="state-message">Кошик порожній</p>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'cart-items';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <div class="cart-item__info">
        <span class="cart-item__title">${item.title}</span>
        <span class="cart-item__size">${item.sizeLine}</span>
        <span class="cart-item__price">${formatPrice(item.price)}</span>
      </div>
      <div class="cart-item__qty">
        <button type="button" class="cart-item__qty-btn" data-dec aria-label="Зменшити кількість">−</button>
        <span class="cart-item__qty-value">${item.qty}</span>
        <button type="button" class="cart-item__qty-btn" data-inc aria-label="Збільшити кількість">+</button>
      </div>
      <button type="button" class="cart-item__remove" data-remove aria-label="Видалити товар">×</button>
    `;

    li.querySelector('[data-dec]')?.addEventListener('click', () => updateQty(item.key, item.qty - 1));
    li.querySelector('[data-inc]')?.addEventListener('click', () => updateQty(item.key, item.qty + 1));
    li.querySelector('[data-remove]')?.addEventListener('click', () => removeItem(item.key));

    list.appendChild(li);
  });

  container.innerHTML = '';
  container.appendChild(list);

  const totalEl = document.createElement('div');
  totalEl.className = 'cart-total';
  totalEl.textContent = `Разом: ${getTotal().toLocaleString('uk-UA')} грн`;
  container.appendChild(totalEl);
}
```
with:
```ts
function renderItemsList(container: HTMLElement, items: CartItem[]): void {
  if (items.length === 0) {
    container.innerHTML = `<p class="state-message">${t('cart.empty', 'Кошик порожній')}</p>`;
    return;
  }

  const list = document.createElement('ul');
  list.className = 'cart-items';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <div class="cart-item__info">
        <span class="cart-item__title">${item.title}</span>
        <span class="cart-item__size">${item.sizeLine}</span>
        <span class="cart-item__price">${formatPrice(item.price)}</span>
      </div>
      <div class="cart-item__qty">
        <button type="button" class="cart-item__qty-btn" data-dec aria-label="${t('cart.decreaseAria', 'Зменшити кількість')}">−</button>
        <span class="cart-item__qty-value">${item.qty}</span>
        <button type="button" class="cart-item__qty-btn" data-inc aria-label="${t('cart.increaseAria', 'Збільшити кількість')}">+</button>
      </div>
      <button type="button" class="cart-item__remove" data-remove aria-label="${t('cart.removeAria', 'Видалити товар')}">×</button>
    `;

    li.querySelector('[data-dec]')?.addEventListener('click', () => updateQty(item.key, item.qty - 1));
    li.querySelector('[data-inc]')?.addEventListener('click', () => updateQty(item.key, item.qty + 1));
    li.querySelector('[data-remove]')?.addEventListener('click', () => removeItem(item.key));

    list.appendChild(li);
  });

  container.innerHTML = '';
  container.appendChild(list);

  const totalEl = document.createElement('div');
  totalEl.className = 'cart-total';
  totalEl.textContent = `${t('cart.totalLabel', 'Разом')}: ${getTotal().toLocaleString('uk-UA')} грн`;
  container.appendChild(totalEl);
}
```

- [ ] **Step 2: Translate the checkout form**

Replace `buildCheckoutForm`'s `form.innerHTML` assignment:
```ts
  form.innerHTML = `
    <label for="cart-name">Ім'я</label>
    <input type="text" id="cart-name" name="name" required autocomplete="name" />

    <label for="cart-phone">Номер телефону</label>
    <input type="tel" id="cart-phone" name="phone" required autocomplete="tel" inputmode="numeric" placeholder="+38 ___ ___ __ __" maxlength="17" />

    <fieldset class="cart-delivery">
      <legend>Спосіб доставки</legend>
      <label class="cart-delivery__option">
        <input type="radio" name="delivery" value="pickup" checked /> Самовивіз з магазину
      </label>
      <label class="cart-delivery__option">
        <input type="radio" name="delivery" value="np" /> Нова Пошта
      </label>
    </fieldset>

    <div class="cart-np-fields" id="cart-np-fields" hidden>
      <label for="cart-np-city">Місто</label>
      <input type="text" id="cart-np-city" name="npCity" autocomplete="address-level2" />

      <label for="cart-np-branch">Відділення або адреса</label>
      <input type="text" id="cart-np-branch" name="npBranch" />
    </div>

    <label for="cart-comment">Коментар (необов'язково)</label>
    <textarea id="cart-comment" name="comment" rows="2"></textarea>

    <p class="cart-error" hidden></p>

    <button type="submit" class="btn btn--block">Оформити замовлення</button>
  `;
```
with:
```ts
  form.innerHTML = `
    <label for="cart-name">${t('cart.nameLabel', "Ім'я")}</label>
    <input type="text" id="cart-name" name="name" required autocomplete="name" />

    <label for="cart-phone">${t('cart.phoneLabel', 'Номер телефону')}</label>
    <input type="tel" id="cart-phone" name="phone" required autocomplete="tel" inputmode="numeric" placeholder="+38 ___ ___ __ __" maxlength="17" />

    <fieldset class="cart-delivery">
      <legend>${t('cart.deliveryLegend', 'Спосіб доставки')}</legend>
      <label class="cart-delivery__option">
        <input type="radio" name="delivery" value="pickup" checked /> ${t('cart.pickup', 'Самовивіз з магазину')}
      </label>
      <label class="cart-delivery__option">
        <input type="radio" name="delivery" value="np" /> ${t('cart.novaPoshta', 'Нова Пошта')}
      </label>
    </fieldset>

    <div class="cart-np-fields" id="cart-np-fields" hidden>
      <label for="cart-np-city">${t('cart.cityLabel', 'Місто')}</label>
      <input type="text" id="cart-np-city" name="npCity" autocomplete="address-level2" />

      <label for="cart-np-branch">${t('cart.branchLabel', 'Відділення або адреса')}</label>
      <input type="text" id="cart-np-branch" name="npBranch" />
    </div>

    <label for="cart-comment">${t('cart.commentLabel', "Коментар (необов'язково)")}</label>
    <textarea id="cart-comment" name="comment" rows="2"></textarea>

    <p class="cart-error" hidden></p>

    <button type="submit" class="btn btn--block">${t('cart.submitBtn', 'Оформити замовлення')}</button>
  `;
```

Replace the validation/submit error and confirmation strings inside the same function's `submit` handler:
```ts
    if (!payload.name || !payload.phone) {
      errorEl.textContent = "Вкажіть ім'я та номер телефону";
      errorEl.hidden = false;
      return;
    }
    if (deliveryMethod === 'np' && (!payload.npCity || !payload.npBranch)) {
      errorEl.textContent = 'Вкажіть місто й відділення або адресу Нової Пошти';
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    submitBtn.disabled = true;
    const result = await submitOrder(payload);
    submitBtn.disabled = false;

    if (result.ok) {
      clear();
      clearDraftStorage();
      confirmationMessage = 'Замовлення прийнято, ми з вами зв’яжемось';
      renderBody();
      showToast('Замовлення оформлено');
      window.setTimeout(() => {
        confirmationMessage = null;
        // Перемальовуємо одразу: інакше при повторному відкритті кошика без змін у ньому
        // покупець побачить застаріле "Замовлення прийнято" замість "Кошик порожній".
        renderBody();
        closeDrawer();
      }, 2500);
    } else {
      errorEl.textContent = result.error || 'Не вдалося оформити замовлення';
      errorEl.hidden = false;
    }
```
with:
```ts
    if (!payload.name || !payload.phone) {
      errorEl.textContent = t('cart.errorNamePhone', "Вкажіть ім'я та номер телефону");
      errorEl.hidden = false;
      return;
    }
    if (deliveryMethod === 'np' && (!payload.npCity || !payload.npBranch)) {
      errorEl.textContent = t('cart.errorNp', 'Вкажіть місто й відділення або адресу Нової Пошти');
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    submitBtn.disabled = true;
    const result = await submitOrder(payload);
    submitBtn.disabled = false;

    if (result.ok) {
      clear();
      clearDraftStorage();
      confirmationMessage = t('cart.confirmMessage', 'Замовлення прийнято, ми з вами зв’яжемось');
      renderBody();
      showToast(t('cart.orderToast', 'Замовлення оформлено'));
      window.setTimeout(() => {
        confirmationMessage = null;
        // Перемальовуємо одразу: інакше при повторному відкритті кошика без змін у ньому
        // покупець побачить застаріле "Замовлення прийнято" замість "Кошик порожній".
        renderBody();
        closeDrawer();
      }, 2500);
    } else {
      errorEl.textContent = result.error || t('cart.orderErrorFallback', 'Не вдалося оформити замовлення');
      errorEl.hidden = false;
    }
```

- [ ] **Step 3: Re-render the cart drawer when the language changes**

In `initCart`, after the existing setup at the end of the function:
```ts
  onChange(() => {
    updateBadge();
    renderBody();
  });

  updateBadge();
  renderBody();
}
```
with:
```ts
  onChange(() => {
    updateBadge();
    renderBody();
  });

  updateBadge();
  renderBody();

  onLangChange(() => {
    drawerEl.setAttribute('aria-label', t('cart.dialogAria', 'Кошик'));
    const heading = drawerEl.querySelector('.cart-drawer__head h2');
    if (heading) heading.textContent = t('cart.heading', 'Кошик');
    const closeBtn = document.getElementById('cart-close');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('cart.closeAria', 'Закрити кошик'));
    renderBody();
  });
}
```

(the drawer's outer shell — head/close button — is built once in `buildDrawerMarkup()` at `initCart()` time and never rebuilt, unlike the body which `renderBody()` already regenerates on every cart change; the three lines above keep that static shell in sync too.)

- [ ] **Step 4: Translate the Telegram booking message**

In `src/js/render-service.ts`, add the import and translate the prefilled message:
```ts
import { CONTACTS, buildTelegramLink } from '../config';
import { t } from './i18n';

export function initServiceCta(): void {
  const bookBtn = document.getElementById('service-book-btn') as HTMLAnchorElement | null;
  const batteryBtn = document.getElementById('battery-contact-btn') as HTMLAnchorElement | null;
  const telegramLinkEl = document.getElementById('contacts-telegram-link') as HTMLAnchorElement | null;
  const floatingCta = document.getElementById('floating-telegram') as HTMLAnchorElement | null;

  if (bookBtn) bookBtn.href = buildTelegramLink(t('service.bookMessage', 'Вітаю, хочу записатись на шиномонтаж'));
  if (batteryBtn) batteryBtn.href = CONTACTS.telegramUrl;
  if (telegramLinkEl) telegramLinkEl.href = CONTACTS.telegramUrl;
  if (floatingCta) floatingCta.href = CONTACTS.telegramUrl;
}
```

(this link is only built once at load; it does not need an `onLangChange` re-run because the visible button label already gets its own `cta.bookService` translation from Task 2's `data-i18n` — only the prefilled Telegram text needs to match. Since `initServiceCta()` runs once before any language switch could happen from a fresh page load, and switching language mid-visit is a rare path for this specific link, re-deriving it on every `onLangChange` is not necessary for correctness of the *visible* button text — but to keep the deep-link message consistent after a switch too, wrap it:)

Replace the same block with a self-refreshing version instead, so switching language mid-visit also updates the deep-link text:
```ts
import { CONTACTS, buildTelegramLink } from '../config';
import { t, onLangChange } from './i18n';

export function initServiceCta(): void {
  const bookBtn = document.getElementById('service-book-btn') as HTMLAnchorElement | null;
  const batteryBtn = document.getElementById('battery-contact-btn') as HTMLAnchorElement | null;
  const telegramLinkEl = document.getElementById('contacts-telegram-link') as HTMLAnchorElement | null;
  const floatingCta = document.getElementById('floating-telegram') as HTMLAnchorElement | null;

  function refresh(): void {
    if (bookBtn) bookBtn.href = buildTelegramLink(t('service.bookMessage', 'Вітаю, хочу записатись на шиномонтаж'));
  }

  refresh();
  onLangChange(refresh);

  if (batteryBtn) batteryBtn.href = CONTACTS.telegramUrl;
  if (telegramLinkEl) telegramLinkEl.href = CONTACTS.telegramUrl;
  if (floatingCta) floatingCta.href = CONTACTS.telegramUrl;
}
```

- [ ] **Step 5: Translate the map iframe title**

In `src/js/map.ts`:
```ts
import { CONTACTS } from '../config';
import { t } from './i18n';

export function initMap(): void {
  const showBtn = document.getElementById('map-show-btn');
  const wrap = document.getElementById('map-wrap');
  const placeholder = document.getElementById('map-placeholder');
  const routeLink = document.getElementById('map-route-link') as HTMLAnchorElement | null;

  if (routeLink) routeLink.href = CONTACTS.mapPlaceUrl;

  showBtn?.addEventListener('click', () => {
    if (!wrap) return;
    const iframe = document.createElement('iframe');
    iframe.src = CONTACTS.mapEmbedSrc;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    iframe.title = t('contacts.mapIframeTitle', 'Карта: автомагазин TIRE PLACE, авторинок «Термінал», Кривий Ріг');
    placeholder?.remove();
    wrap.appendChild(iframe);
  });
}
```

- [ ] **Step 6: Translate the burger menu aria-label**

In `src/js/nav.ts`, the burger button's `aria-label="Відкрити меню"` lives as a static attribute in `index.html`, not set from `nav.ts` — so instead add `data-i18n-attr` to it directly in `index.html`:

Replace:
```html
        <button class="burger" id="burger" aria-expanded="false" aria-controls="main-nav" aria-label="Відкрити меню">
```
with:
```html
        <button class="burger" id="burger" aria-expanded="false" aria-controls="main-nav" aria-label="Відкрити меню" data-i18n-attr="aria-label:a11y.burgerOpen">
```

Also translate the hero-slider play/pause/counter strings, which are built dynamically in `src/js/hero-slider.ts`. Add the import and update:
```ts
import { gallerySlides, type GallerySlide } from '../data/gallery';
import { t } from './i18n';
```

Replace:
```ts
    figure.setAttribute('aria-label', `${i + 1} з ${total}`);
```
with:
```ts
    figure.setAttribute('aria-label', `${i + 1} ${t('a11y.of', 'з')} ${total}`);
```

Replace:
```ts
    existingFirstSlide.setAttribute('aria-label', `1 з ${total}`);
```
with:
```ts
    existingFirstSlide.setAttribute('aria-label', `1 ${t('a11y.of', 'з')} ${total}`);
```

Replace:
```ts
    dot.setAttribute('aria-label', `Слайд ${i + 1} з ${total}`);
```
with:
```ts
    dot.setAttribute('aria-label', `Слайд ${i + 1} ${t('a11y.of', 'з')} ${total}`);
```

Replace:
```ts
    if (counter) counter.textContent = `Слайд ${current + 1} з ${total}`;
```
with:
```ts
    if (counter) counter.textContent = `Слайд ${current + 1} ${t('a11y.of', 'з')} ${total}`;
```

Replace:
```ts
      playPauseBtn.setAttribute('aria-label', isPaused ? 'Відтворити автоперемикання слайдів' : 'Пауза автоперемикання слайдів');
```
with:
```ts
      playPauseBtn.setAttribute(
        'aria-label',
        isPaused ? t('a11y.heroPlayLabel', 'Відтворити автоперемикання слайдів') : t('a11y.heroPauseLabel', 'Пауза автоперемикання слайдів')
      );
```

- [ ] **Step 7: Typecheck + manual check**

Run: `npm run typecheck` — no errors.
Run: `npm run dev`, switch to RU:
- Open the cart with 1+ items — drawer heading, close button aria-label, item qty/remove aria-labels, total line, and (once you add a UA item first, then switch to RU) the checkout form's every label/placeholder/legend/radio option/submit button are Russian.
- Submit the checkout form with empty name/phone — Russian validation error. Fill only pickup and submit with Nova Poshta selected but city/branch empty — Russian NP validation error.
- Successfully submit an order (or simulate — see `order-api.ts`/`CONTENT_API_URL` in `src/config.ts` for whether a live backend is configured) — confirmation message and toast are Russian.
- The burger menu button's aria-label switches; the hero slider's prev/next/play-pause aria-labels and the live-region slide counter all switch to "з" → "из".
- Click "Записатись на шиномонтаж" while in RU — the Telegram deep link opens with the Russian prefilled message (`?text=Здравствуйте,%20хочу%20записаться...`).
- Click "Показати карту" while in RU — once loaded, inspect the `<iframe title>` in devtools and confirm it's Russian.

- [ ] **Step 8: Commit**

```bash
git add src/js/cart-ui.ts src/js/render-service.ts src/js/map.ts src/js/hero-slider.ts index.html
git commit -m "Translate cart/checkout, service CTA, map, and hero-slider a11y strings to RU"
```

---

## Task 7: Sitemap hreflang entry + full manual QA pass

**Files:**
- Modify: `public/sitemap.xml`

**Interfaces:**
- None — final polish task, no new code interfaces.

- [ ] **Step 1: Add the RU URL with mutual hreflang annotations**

Replace the contents of `public/sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://tireplace.com.ua/</loc>
    <lastmod>2026-08-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="uk" href="https://tireplace.com.ua/" />
    <xhtml:link rel="alternate" hreflang="ru" href="https://tireplace.com.ua/?lang=ru" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://tireplace.com.ua/" />
  </url>
  <url>
    <loc>https://tireplace.com.ua/?lang=ru</loc>
    <lastmod>2026-08-28</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
    <xhtml:link rel="alternate" hreflang="uk" href="https://tireplace.com.ua/" />
    <xhtml:link rel="alternate" hreflang="ru" href="https://tireplace.com.ua/?lang=ru" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://tireplace.com.ua/" />
  </url>
</urlset>
```

- [ ] **Step 2: Full end-to-end QA pass (spec "Тестування" checklist)**

Run: `npm run typecheck` — no errors, full project.
Run: `npm run build` — completes without errors (`dist/` produced).
Run: `npm run preview`, walk through:
- Default load (`/`) — everything Ukrainian, "UA" shown active in the header switch.
- Click "RU" → URL becomes `?lang=ru` with no reload; every section translated (header/hero/catalog/filters/service/batteries/contacts/FAQ/footer/cart); `<html lang>` is `ru`; `<title>`/meta description changed; canonical points at `?lang=ru`.
- Load `/?lang=ru` directly (simulating a Googlebot crawl of the indexed URL) — renders Russian immediately, no Ukrainian flash.
- Click "UA" — everything reverts, including an already-open cart drawer and a partially filled checkout form (form values must survive the re-render via the existing `persistDraft`/`restoreCheckoutDraft` mechanism).
- Apply a tire filter (e.g. brand), confirm the URL keeps both `tires_brand=...` and `lang=ru` together; toggle language — filter selection and results stay intact.
- Navigate to `#service`, switch language — the `#service` hash is preserved in the URL and scroll position.
- Product titles (brand + model) and every raw CSV-sourced value (season/type/color/PCD/ET/DIA/brand names) are identical in both languages.
- `curl -s http://localhost:4173/ | grep hreflang` (adjust port to what `npm run preview` prints) — confirms all three `hreflang` `<link>` tags are present in the raw HTML.

- [ ] **Step 3: Commit**

```bash
git add public/sitemap.xml
git commit -m "Add RU sitemap entry with hreflang annotations"
```
