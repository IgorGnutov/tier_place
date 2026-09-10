// Крок 6 конвеєра: проміжний шар URL між головною і 159 сторінками товару —
// хаби (/tires/, /wheels/), фасети (/tires/r16/, /tires/winter/, /wheels/cast/) і 5 контентних
// сторінок послуг, кожна в UA- і RU-варіанті. Разом 15 × 2 = 30 URL.
//
// Оболонка клонується так само, як у generate-product-pages.mjs, з однією важливою різницею:
// UA-сторінки клонуються з dist/index.html, а RU — з УЖЕ ПЕРЕКЛАДЕНОЇ dist/ru/index.html.
// Тому хедер, футер і базові meta вже російські, і генератору лишається лише <main>, title,
// description, canonical, og:*, крихти й JSON-LD. Саме через це крок іде ПІСЛЯ
// generate-ru-html.mjs.
//
// Розмітка каталогу (фільтри, сортування, чипси, грід, "показати ще") не дублюється тут, а
// ВИРІЗАЄТЬСЯ з оболонки: ids збігаються з головною, тож клієнтський initCatalog підхоплює
// фасетну сторінку без жодних змін, а зміна фільтрів в index.html автоматично доїжджає сюди.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { root, readBuildJson } from './lib/build-dir.mjs';
import { appendUrls } from './lib/urls.mjs';
import { clusterLinksHtml, clusters, pageTexts, CONTENT_PAGE_KEYS, langPrefix } from './lib/cluster-links.mjs';
import { makeT } from './lib/i18n.mjs';
import { SITE_URL, PAGE_SIZE } from '../src/shared/constants.mjs';
import { describeTire, describeWheel, catalogLabel } from '../src/shared/describe.mjs';
import { productCardHtml } from '../src/shared/product-card.mjs';
import { dedupeSlugs, tireSlug, wheelSlug } from '../src/shared/slug.mjs';
import {
  listFacetPages,
  rowsForFacet,
  suggestNewFacets,
  assertNoSlugCollisions,
  FACET_THRESHOLD,
} from '../src/shared/clusters.mjs';
import {
  replaceAttr,
  removeAll,
  removeJsonLd,
  jsonForScript,
  replaceMain,
  stripI18nHooks,
  rootifyNavAnchors,
  rootifyAssetPaths,
  removeHeroPreload,
  escapeHtml,
  escapeAttr,
} from './lib/html-patch.mjs';

const LABEL = 'generate-cluster-pages';
const LANGS = ['uk', 'ru'];

const data = readBuildJson('data.json', 'scripts/fetch-data.mjs');
const images = readBuildJson('images.json', 'scripts/build-product-images.mjs');

// ---------------------------------------------------------------- дані товарів

/**
 * Рядки прайсу з проставленим __detailUrl — той самий формат, що бачить клієнт.
 * Префікс мови обовʼязковий: RU-фасет мусить вести на RU-сторінку товару, інакше клік із
 * /ru/tires/r16/ відкривав би українську сторінку (мова визначається виключно зі шляху).
 * @param {'tires'|'wheels'} kind @param {string} lang
 */
function rowsWithDetailUrls(kind, lang) {
  const rows = kind === 'tires' ? data.tires : data.wheels;
  const slugs = dedupeSlugs(rows, kind === 'tires' ? tireSlug : wheelSlug);
  return rows.map((row, i) => ({
    ...row,
    __detailUrl: slugs[i] ? `${langPrefix(lang)}/${kind}/${slugs[i]}/` : '',
  }));
}

/** ROWS[lang][kind] — слаги однакові в обох мовах, різниться лише префікс у __detailUrl. */
const ROWS = Object.fromEntries(
  LANGS.map((lang) => [
    lang,
    { tires: rowsWithDetailUrls('tires', lang), wheels: rowsWithDetailUrls('wheels', lang) },
  ])
);
const describeFor = { tires: describeTire, wheels: describeWheel };

// ---------------------------------------------------------------- вирізання каталогу з оболонки

/**
 * Вирізає з оболонки готовий блок каталогу (`<div class="tab-panel" id="tires">`) разом із
 * фільтрами, сортуванням, чипсами, грідом і "показати ще". Глибина вкладених <div>
 * рахується, бо панель містить їх десятки.
 * @param {string} shell @param {'tires'|'wheels'} id @returns {string}
 */
function extractCatalogPanel(shell, id) {
  const open = new RegExp(`<div class="tab-panel[^"]*" id="${id}"[^>]*>`).exec(shell);
  if (!open) throw new Error(`${LABEL}: не знайдено <div class="tab-panel" id="${id}"> в оболонці`);
  let depth = 1;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = open.index + open[0].length;
  let m;
  while ((m = re.exec(shell)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      const inner = shell.slice(open.index + open[0].length, m.index);
      // role="tabpanel"/aria-labelledby указували на tablist, якого на кластерній сторінці
      // немає; is-active обов'язковий, бо .tab-panel без нього має display: none.
      return `<div class="tab-panel is-active" id="${id}">${inner}</div>`;
    }
  }
  throw new Error(`${LABEL}: не знайдено закривний </div> панелі "${id}"`);
}

/**
 * Заповнює вирізану панель: картки в грід, готове число в #<id>-count (зі зрізаним
 * data-i18n="product.loading" — інакше клієнтський i18n впише «Завантаження…» назад) і, для
 * фасета, data-facet-* на формі фільтрів.
 * @param {string} panel
 * @param {'tires'|'wheels'} kind
 * @param {Record<string,string>[]} rows
 * @param {import('../src/shared/describe.mjs').Translate} t
 * @param {{ field: string, value: string } | null} facet
 * @returns {string}
 */
function fillCatalogPanel(panel, kind, rows, t, facet) {
  let out = panel;

  if (facet) {
    out = out.replace(
      `<form class="filters" id="${kind}-filters" data-product-type="${kind}">`,
      `<form class="filters" id="${kind}-filters" data-product-type="${kind}" ` +
        `data-facet-field="${escapeAttr(facet.field)}" data-facet-value="${escapeAttr(facet.value)}">`
    );
  }

  // Рівно PAGE_SIZE карток у порядку таблиці — клієнт за замовчуванням сортування не
  // застосовує, тож прередерений і пост-JS грід ідентичні.
  const cards = rows
    .slice(0, PAGE_SIZE)
    .map((row) => productCardHtml(describeFor[kind](row, t), images.card, t))
    .join('');
  const emptyState =
    `<div class="state-message">${escapeHtml(t('facet.empty', 'Зараз немає в наявності'))}</div>` +
    `<p class="cluster-empty__hint">${escapeHtml(
      t(
        'facet.emptyHint',
        'Цей розмір закінчився. Подивіться сусідні розміри вище або напишіть нам — привеземо під замовлення.'
      )
    )}</p>`;
  const gridOpen = `<div class="product-grid" id="${kind}-grid" aria-live="polite">`;
  if (!out.includes(`${gridOpen}</div>`)) {
    throw new Error(`${LABEL}: порожній грід #${kind}-grid не знайдено в оболонці`);
  }
  out = out.replace(`${gridOpen}</div>`, `${gridOpen}${rows.length ? cards : emptyState}</div>`);

  // Число віддається готовим, а data-i18n="product.loading" зрізається з цього вузла — інакше
  // клієнтський applyStaticTranslations() впише «Завантаження…» назад одразу після старту JS.
  // data-i18n-original (його додає generate-ru-html.mjs у RU-оболонці) прибираємо тим самим
  // проходом, щоб не лишати мертвого кеша.
  const countRe = new RegExp(`<span id="${kind}-count"([^>]*)>[^<]*</span>`);
  if (!countRe.test(out)) throw new Error(`${LABEL}: #${kind}-count не знайдено в оболонці`);
  const countText = `${t('product.foundLabel', 'Знайдено')}: ${rows.length}`;
  out = out.replace(countRe, (_m, attrs) => {
    const clean = attrs
      .replace(/ data-i18n="product\.loading"/, '')
      .replace(/ data-i18n-original="[^"]*"/, '');
    return `<span id="${kind}-count"${clean}>${escapeHtml(countText)}</span>`;
  });

  return out;
}

// ---------------------------------------------------------------- крихти й блок посилань

/**
 * @typedef {{ name: string, href: string | null }} Crumb
 * @param {Crumb[]} crumbs
 * @param {import('../src/shared/describe.mjs').Translate} t
 * @returns {string}
 */
function breadcrumbsHtml(crumbs, t) {
  const items = crumbs
    .map((c) =>
      c.href
        ? `<li><a href="${escapeAttr(c.href)}">${escapeHtml(c.name)}</a></li>`
        : `<li aria-current="page">${escapeHtml(c.name)}</li>`
    )
    .join('');
  return `<nav class="breadcrumbs" aria-label="${escapeAttr(t('breadcrumbs.aria', 'Навігація по сайту'))}"><ol>${items}</ol></nav>`;
}

/** JSON-LD BreadcrumbList із того самого переліку, що видимий на сторінці. */
function breadcrumbJsonLd(crumbs, pageUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.href ? `${SITE_URL}${c.href}` : pageUrl,
    })),
  };
}

/** @param {{q: string, a: string}[]} faq @param {import('../src/shared/describe.mjs').Translate} t */
function faqHtml(faq, t) {
  if (!faq?.length) return '';
  const items = faq
    .map((item) => `<details class="faq-item"><summary>${escapeHtml(item.q)}</summary>${item.a}</details>`)
    .join('');
  return (
    `<section class="cluster-faq"><h2>${escapeHtml(t('faq.heading', 'Часті запитання'))}</h2>` +
    `<div class="faq-list">${items}</div></section>`
  );
}

// ---------------------------------------------------------------- <main>

/**
 * @param {object} page
 * @param {object} text
 * @param {string} lang
 * @param {import('../src/shared/describe.mjs').Translate} t
 * @param {Crumb[]} crumbs
 * @returns {string}
 */
function buildMainHtml(page, text, lang, t, crumbs) {
  const parts = [
    breadcrumbsHtml(crumbs, t),
    `<h1 class="cluster-page__title">${escapeHtml(text.h1)}</h1>`,
    `<div class="cluster-page__intro">${text.intro}</div>`,
    clusterLinksHtml(text.slug, lang, t),
  ];

  if (page.type === 'hub' || page.type === 'facet') {
    const langRows = ROWS[lang][page.kind];
    const rows = page.type === 'facet' ? rowsForFacet(langRows, page.field, page.value) : langRows;
    const shellPanel = extractCatalogPanel(page.shell, page.kind);
    parts.push(
      fillCatalogPanel(shellPanel, page.kind, rows, t, page.type === 'facet' ? { field: page.field, value: page.value } : null)
    );
  } else {
    // Контентна сторінка: CTA веде просто в чат Telegram без передзаповненого тексту —
    // ?text= не в усіх клієнтах Telegram надійно підставляється в приватному чаті (той самий
    // застережний коментар, що й у render-service.ts), тож простіше відкрити чистий чат.
    const href = 'https://t.me/AnastasiyaBaza';
    parts.push(
      `<div class="cluster-page__cta"><a class="btn" href="${escapeAttr(href)}" target="_blank" rel="noopener">` +
        `${escapeHtml(t('cta.write', 'Написати нам у Telegram'))}</a>` +
        `<a class="btn btn--outline" href="tel:+380980719393">+38 (098) 071-93-93</a></div>`
    );
  }

  parts.push(faqHtml(text.faq, t));

  return `<div class="container cluster-page">${parts.join('')}</div>`;
}

// ---------------------------------------------------------------- сторінка

function buildPage(page, lang) {
  const text = pageTexts[page.key][lang];
  const t = makeT(lang);
  const path = text.slug;
  const pageUrl = `${SITE_URL}${langPrefix(lang)}/${path}/`;
  const twinLang = lang === 'uk' ? 'ru' : 'uk';
  const twinUrl = `${SITE_URL}${langPrefix(twinLang)}/${pageTexts[page.key][twinLang].slug}/`;
  const ukUrl = lang === 'uk' ? pageUrl : twinUrl;
  const ruUrl = lang === 'ru' ? pageUrl : twinUrl;

  const crumbs = [{ name: t('breadcrumbs.home', 'Головна'), href: lang === 'ru' ? '/ru/' : '/' }];
  if (page.type === 'facet') {
    crumbs.push({ name: catalogLabel(page.kind, t), href: `${langPrefix(lang)}/${page.kind}/` });
  }
  crumbs.push({ name: text.h1, href: null });

  let html = replaceMain(page.shell, buildMainHtml(page, text, lang, t, crumbs), LABEL);

  html = html.replace(/<title[^>]*>[^<]*<\/title>/, () => `<title>${escapeHtml(text.title)}</title>`);
  html = replaceAttr(html, '<meta name="description"[^>]*?content="', text.description, LABEL);
  html = replaceAttr(html, '<link rel="canonical" id="canonical-link" href="', pageUrl, LABEL);
  html = replaceAttr(html, '<meta property="og:title" content="', text.title, LABEL);
  html = replaceAttr(html, '<meta property="og:description" content="', text.description, LABEL);
  html = replaceAttr(html, '<meta property="og:url" id="og-url-meta" content="', pageUrl, LABEL);
  html = replaceAttr(html, '<meta name="twitter:title" content="', text.title, LABEL);
  html = replaceAttr(html, '<meta name="twitter:description" content="', text.description, LABEL);

  html = stripI18nHooks(html, LABEL);

  // hreflang: на відміну від сторінок товару (де зрізається повністю) — власна взаємна пара.
  html = removeAll(html, /[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*"[^>]*\/>[ \t]*\r?\n?/g, 'hreflang alternates', LABEL);
  const hreflangs =
    `  <link rel="alternate" hreflang="uk-UA" href="${escapeAttr(ukUrl)}" />\n` +
    `  <link rel="alternate" hreflang="ru-UA" href="${escapeAttr(ruUrl)}" />\n` +
    `  <link rel="alternate" hreflang="x-default" href="${escapeAttr(ukUrl)}" />\n`;
  html = html.replace('<!-- Open Graph / Twitter -->', () => `${hreflangs}\n  <!-- Open Graph / Twitter -->`);

  // Перемикач мови стає СПРАВЖНЬОЮ навігацією на двійника. Причина: текст цих сторінок живе
  // в cluster-pages.json, а не в ru.json, тож клієнтський i18n його не знає і залишив би опис
  // російським на UA-сторінці. Наслідок, прийнятий свідомо: на головній перемикач перекладає
  // на місці, на кластерних — переходить.
  html = removeAll(html, / data-lang-link="(?:uk|ru)"/g, 'data-lang-link', LABEL);
  html = html.replace(
    /<a href="\/" class="lang-switch__link"/,
    () => `<a href="${escapeAttr(ukUrl.replace(SITE_URL, ''))}" class="lang-switch__link${lang === 'uk' ? ' is-active' : ''}"`
  );
  html = html.replace(
    /<a href="\/ru\/" class="lang-switch__link"/,
    () => `<a href="${escapeAttr(ruUrl.replace(SITE_URL, ''))}" class="lang-switch__link${lang === 'ru' ? ' is-active' : ''}"`
  );

  html = rootifyNavAnchors(html);
  html = removeHeroPreload(html, LABEL);

  // Service/FAQPage/BreadcrumbList головної описують контент, якого тут немає. AutoPartsStore
  // лишається — це загальносайтова інформація про бізнес.
  html = removeJsonLd(html, ['Service', 'FAQPage', 'BreadcrumbList'], LABEL);

  const scripts = [breadcrumbJsonLd(crumbs, pageUrl)];
  if (page.type === 'content' && text.serviceType) {
    scripts.push({
      '@context': 'https://schema.org',
      '@type': 'Service',
      serviceType: text.serviceType,
      provider: { '@type': 'AutoPartsStore', name: 'TIRE PLACE', url: `${SITE_URL}/` },
      areaServed: { '@type': 'City', name: lang === 'ru' ? 'Кривой Рог' : 'Кривий Ріг' },
      url: pageUrl,
    });
  }
  html = html.replace(
    '</head>',
    () => `${scripts.map((s) => `  <script type="application/ld+json">${jsonForScript(s)}</script>\n`).join('')}</head>`
  );

  html = rootifyAssetPaths(html);

  return { html, path, pageUrl, ukUrl, ruUrl };
}

// ---------------------------------------------------------------- підсказка про нові фасети

function reportSuggestions() {
  const hints = [
    ...suggestNewFacets(data.tires, 'tires', clusters),
    ...suggestNewFacets(data.wheels, 'wheels', clusters),
  ];
  if (hints.length === 0) return;

  for (const h of hints) {
    console.log(
      `${LABEL}: значення ${h.kind}.${h.field} = "${h.value}" має ${h.count} товарів (поріг ${FACET_THRESHOLD}), ` +
        'але не закріплене в src/data/clusters.json — сторінка не створена.'
    );
  }
  // Не лише в лог: у білді CI лог ніхто не читає, а $GITHUB_STEP_SUMMARY видно в самому ранi.
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Нові фасети, які перетнули поріг ${FACET_THRESHOLD}\n\n` +
        hints
          .map(
            (h) =>
              `- \`${h.kind}.${h.field}\` = **${h.value}** (${h.count} товарів) — щоб сторінка створилась, ` +
              'додайте рядок у `src/data/clusters.json` і текст у `src/data/cluster-pages.json`.\n'
          )
          .join('') +
        '\n'
    );
  }
}

// ---------------------------------------------------------------- main

function main() {
  const shells = {
    uk: readFileSync(`${root}dist/index.html`, 'utf8'),
    ru: readFileSync(`${root}dist/ru/index.html`, 'utf8'),
  };

  const facetPages = listFacetPages(clusters);

  // Слаги фасетів і товарів живуть в одному просторі імен — колізія мусить валити білд.
  const products = [
    // Слаги мовно-незалежні (рахуються з даних прайсу), тож перевіряти достатньо один набір.
    ...ROWS.uk.tires.map((row) => ({ kind: 'tires', slug: row.__detailUrl.split('/')[2] ?? '', title: describeTire(row, makeT('uk')).title })),
    ...ROWS.uk.wheels.map((row) => ({ kind: 'wheels', slug: row.__detailUrl.split('/')[2] ?? '', title: describeWheel(row, makeT('uk')).title })),
  ].filter((p) => p.slug);
  assertNoSlugCollisions(facetPages, products);

  /** @type {object[]} */
  const pages = [
    { key: 'tires', type: 'hub', kind: 'tires' },
    { key: 'wheels', type: 'hub', kind: 'wheels' },
    ...facetPages.map((f) => ({ key: f.key, type: 'facet', kind: f.kind, field: f.field, value: f.value })),
    ...CONTENT_PAGE_KEYS.map((key) => ({ key, type: 'content' })),
  ];

  // Немає тексту → падіння з ПЕРЕЛІКОМ, щоб сторінка без опису не поїхала в прод тихо.
  const missing = [];
  for (const page of pages) {
    for (const lang of LANGS) {
      const text = pageTexts[page.key]?.[lang];
      if (!text?.slug || !text?.h1 || !text?.title || !text?.description || !text?.intro) {
        missing.push(`${page.key}/${lang}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `немає текстів у src/data/cluster-pages.json для: ${missing.join(', ')} — ` +
        'сторінка без опису не має потрапити в прод.'
    );
  }

  const urls = [];
  for (const page of pages) {
    for (const lang of LANGS) {
      const { html, path, pageUrl, ukUrl, ruUrl } = buildPage({ ...page, shell: shells[lang] }, lang);
      const outDir = `${root}dist${langPrefix(lang)}/${path}`;
      mkdirSync(outDir, { recursive: true });
      writeFileSync(`${outDir}/index.html`, html);
      urls.push({
        loc: pageUrl,
        changefreq: 'weekly',
        priority: page.type === 'hub' ? '0.8' : '0.7',
        alternates: [
          { hreflang: 'uk-UA', href: ukUrl },
          { hreflang: 'ru-UA', href: ruUrl },
          { hreflang: 'x-default', href: ukUrl },
        ],
      });
    }
  }
  appendUrls(urls);
  reportSuggestions();

  console.log(`${LABEL}: згенеровано ${urls.length} кластерних сторінок (${pages.length} × ${LANGS.length}).`);
}

try {
  main();
} catch (err) {
  console.error(`${LABEL}: ${err.message}`);
  process.exitCode = 1;
}
