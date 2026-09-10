// Постбілд-крок: генерує статичну, індексовану Google сторінку на кожен товар з таблиць
// "Шини"/"Диски" — у ДВОХ мовах (аналогічно до scripts/generate-ru-html.mjs і
// generate-cluster-pages.mjs: клонуємо вже зібраний HTML і патчимо лише потрібні частини,
// замість рендеру з нуля).
//
// UA клонується з dist/index.html, RU — з УЖЕ ПЕРЕКЛАДЕНОЇ dist/ru/index.html, тому хедер,
// футер, кошик і базові meta там уже російські. Це та сама причина, через яку крок іде після
// generate-ru-html.mjs.
//
// ЧОМУ ДВІ МОВИ, А НЕ КЛІЄНТСЬКИЙ ПЕРЕКЛАД: мова визначається виключно зі шляху
// (i18n.ts getLang()), а згенерований <main> свідомо не має хуків data-i18n — їх би
// перезаписала applyStaticTranslations(). Доки RU-сторінок не було, клік на товар із /ru/
// відкривав повністю українську сторінку.
//
// Спільний із клієнтом код (slug-формула, мапінг "рядок CSV → назва/характеристики",
// рендер картки) живе в src/shared/*.mjs — плейн-ESM, який читає і Vite, і плейн-Node.
// Дублікатів більше немає.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dedupeSlugs, tireSlug, wheelSlug } from '../src/shared/slug.mjs';
import { listFacetPages, facetForProduct } from '../src/shared/clusters.mjs';
import { describeTire, describeWheel, catalogLabel, priceText } from '../src/shared/describe.mjs';
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
import { root, readBuildJson } from './lib/build-dir.mjs';
import { appendUrls } from './lib/urls.mjs';
import { langPrefix, pageTexts } from './lib/cluster-links.mjs';
import { makeT } from './lib/i18n.mjs';
import { SITE_URL } from '../src/shared/constants.mjs';

const LABEL = 'generate-product-pages';
const LANGS = ['uk', 'ru'];
const describeFor = { tires: describeTire, wheels: describeWheel };

// Фасетні сторінки потрібні тут для крихт: середня ланка мусить вести на ДОКУМЕНТ
// (/tires/ і, де є, /tires/r16/), а не на якір головної.
const FACET_PAGES = listFacetPages(JSON.parse(readFileSync(`${root}src/data/clusters.json`, 'utf8')));

function buildPhotoHtml(product, imageSet, t) {
  if (!product.imageUrl) {
    return `<div class="product-detail__photo--placeholder">${escapeHtml(t('product.photoMissing', 'Фото немає'))}</div>`;
  }
  if (!imageSet) {
    // Оптимізація цього фото не вдалась (buildProductImageAssets) — як і раніше, хотлінк на оригінал.
    return `<img src="${escapeAttr(product.imageUrl)}" alt="${escapeAttr(product.title)}" loading="eager" />`;
  }
  const sources = [
    imageSet.avif && `<source type="image/avif" srcset="${escapeAttr(imageSet.avif)}" />`,
    imageSet.webp && `<source type="image/webp" srcset="${escapeAttr(imageSet.webp)}" />`,
  ]
    .filter(Boolean)
    .join('');
  const fallbackSrc = imageSet.jpg ?? product.imageUrl;
  return `<picture>${sources}<img src="${escapeAttr(fallbackSrc)}" alt="${escapeAttr(product.title)}" loading="eager" /></picture>`;
}

/** Середня оцінка й кількість. null, якщо відгуків немає: Google вважає сторінку invalid, якщо
 *  aggregateRating присутній з reviewCount 0, тож порожній агрегат не емітимо взагалі. */
function reviewsAggregate(reviews) {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
  return { value: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
}

/** Правила плюралізації в uk і ru однакові (mod 10 / mod 100), а форми різні — тому функція
 *  з таблицею форм, а не ключ у словнику: t() не вміє вибирати форму за числом.
 *  @param {number} count @param {string} lang */
function reviewsWord(count, lang) {
  const [one, few, many] =
    lang === 'ru' ? ['отзыв', 'отзыва', 'отзывов'] : ['відгук', 'відгуки', 'відгуків'];
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function starsHtml(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function formatReviewDate(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

function buildReviewFormHtml(t) {
  // «з 5» окремим ключем, а не шаблоном із підстановкою: t() не має інтерполяції, а число
  // тут — не переклад.
  const outOfFive = t('review.outOfFive', 'з 5');
  // Порядок зірок у DOM природний (1→5), щоб стрілки клавіатури рухали оцінку в той самий бік,
  // що й око. Заповнення "вибрана + усі менші" робить CSS через :has() — див. product-detail.css.
  const stars = [1, 2, 3, 4, 5]
    .map(
      (value) => `
            <input type="radio" id="review-rating-${value}" name="rating" value="${value}" required />
            <label for="review-rating-${value}"><span class="visually-hidden">${value} ${escapeHtml(outOfFive)}</span>★</label>`
    )
    .join('');

  return `
        <form class="review-form" id="review-form" novalidate>
          <h3 class="review-form__title">${escapeHtml(t('review.leaveTitle', 'Залишити відгук'))}</h3>
          <fieldset class="review-form__rating">
            <legend>${escapeHtml(t('review.ratingLegend', 'Оцінка'))}</legend>
            <div class="review-stars-input">${stars}
            </div>
          </fieldset>
          <label for="review-author">${escapeHtml(t('review.authorLabel', "Ваше ім'я"))}</label>
          <input type="text" id="review-author" name="author" maxlength="60" required autocomplete="name" />
          <label for="review-body">${escapeHtml(t('review.bodyLabel', 'Відгук'))}</label>
          <textarea id="review-body" name="body" rows="4" maxlength="1000" required></textarea>
          <div class="review-form__honeypot" aria-hidden="true">
            <label for="review-website">${escapeHtml(t('review.honeypotLabel', 'Не заповнюйте це поле'))}</label>
            <input type="text" id="review-website" name="website" tabindex="-1" autocomplete="off" />
          </div>
          <button type="submit" class="btn" id="review-submit">${escapeHtml(t('review.submit', 'Надіслати відгук'))}</button>
          <p class="review-form__status" id="review-status" role="status"></p>
        </form>`;
}

/** Видимий блок відгуків. Текст перекладається ТУТ, на білді, і свідомо йде без
 *  data-i18n/data-i18n-attr та без id, які чіпає main.js: applyStaticTranslations()
 *  перезаписала б їх одразу після старту JS — саме тому RU-версія сторінки й мусить бути
 *  окремим файлом, а не перекладом на клієнті. */
function buildReviewsHtml(product, t, lang) {
  const reviews = product.reviews;
  const aggregate = reviewsAggregate(reviews);

  const summaryHtml = aggregate
    ? `
        <div class="product-reviews__summary">
          <span class="review-stars" aria-hidden="true">${starsHtml(Math.round(aggregate.value))}</span>
          <strong class="product-reviews__average">${aggregate.value.toLocaleString('uk-UA', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}</strong>
          <span class="product-reviews__count">${aggregate.count} ${reviewsWord(aggregate.count, lang)}</span>
        </div>`
    : '';

  const listHtml = reviews.length
    ? `
        <ul class="product-reviews__list">${reviews
          .map(
            (review) => `
          <li class="review">
            <div class="review__head">
              <strong class="review__author">${escapeHtml(review.author)}</strong>
              <span class="review-stars" role="img" aria-label="${escapeAttr(`${t('review.ratingLegend', 'Оцінка')} ${review.rating} ${t('review.outOfFive', 'з 5')}`)}">${starsHtml(review.rating)}</span>
              ${review.datePublished ? `<time class="review__date" datetime="${escapeAttr(review.datePublished)}">${formatReviewDate(review.datePublished)}</time>` : ''}
            </div>
            <p class="review__body">${escapeHtml(review.body)}</p>
          </li>`
          )
          .join('')}
        </ul>`
    : `
        <p class="product-reviews__empty">${escapeHtml(t('review.empty', 'Відгуків ще немає. Будьте першим.'))}</p>`;

  return `
      <section class="product-reviews">
        <h2 class="product-reviews__title">${escapeHtml(t('review.sectionTitle', 'Відгуки'))}</h2>${summaryHtml}${listHtml}${buildReviewFormHtml(t)}
      </section>`;
}

/**
 * Ланки крихт товару: Головна → Шини → [R16] → назва. Ланка фасета присутня лише якщо для
 * товару є відповідна закріплена фасетна сторінка (див. src/data/clusters.json).
 *
 * Ярлик фасета беремо з cluster-pages.json (linkLabel), а не з facetLabel() у clusters.mjs:
 * той віддає сире значення прайсу («Литі», «Зима»), тобто українське навіть на RU-сторінці.
 * linkLabel описаний на кожну мову й до того ж називає сторінку так, як вона сама себе
 * називає в блоці перелінковки.
 * @param {object} product @param {string} lang @param {import('../src/shared/describe.mjs').Translate} t
 * @returns {{ name: string, href: string | null }[]}
 */
function productCrumbs(product, lang, t) {
  const prefix = langPrefix(lang);
  const crumbs = [
    { name: t('breadcrumbs.home', 'Головна'), href: `${prefix}/` },
    { name: catalogLabel(product.kind, t), href: `${prefix}/${product.kind}/` },
  ];
  const facet = facetForProduct(product.row, product.kind, FACET_PAGES);
  if (facet) {
    crumbs.push({
      name: pageTexts[facet.key]?.[lang]?.linkLabel ?? facet.label,
      href: `${prefix}/${facet.path}/`,
    });
  }
  crumbs.push({ name: product.title, href: null });
  return crumbs;
}

/** Ті самі стилі, що на кластерних сторінках (src/styles/cluster.css). */
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

function buildMainHtml(product, imageSet, t, lang) {
  const photoHtml = buildPhotoHtml(product, imageSet, t);
  const specsHtml = product.specs.map((s) => `<li>${escapeHtml(s.label)}: ${escapeHtml(s.value)}</li>`).join('');
  const statusClass = product.inStock ? 'status--in' : 'status--out';
  const statusText = product.inStock
    ? t('product.inStock', 'В наявності')
    : t('product.outOfStock', 'Немає в наявності');

  const productData = jsonForScript({
    id: product.productId,
    key: product.key,
    title: product.title,
    sizeLine: product.sizeLine,
    price: product.price,
  });
  // Без id у колонці "id" відгук неможливо привʼязати до товару — блок (разом із формою)
  // не рендеримо взагалі, замість того щоб збирати відгуки, які нікуди не потраплять.
  const reviewsHtml = product.productId ? buildReviewsHtml(product, t, lang) : '';

  return `
    <div class="container product-detail">
      ${breadcrumbsHtml(product.crumbs, t)}
      <div class="product-detail__grid">
        <div class="product-detail__photo">${photoHtml}</div>
        <div class="product-detail__body">
          <h1 class="product-detail__title">${escapeHtml(product.title)}</h1>
          <ul class="product-detail__specs">${specsHtml}</ul>
          <span class="status ${statusClass}">${escapeHtml(statusText)}</span>
          <div class="product-detail__footer">
            <span class="product-detail__price">${escapeHtml(priceText(product.price, t))}</span>
            <button type="button" class="btn" id="product-buy-btn"${product.inStock ? '' : ' disabled'}>${escapeHtml(t('product.buy', 'Купити'))}</button>
          </div>
        </div>
      </div>${reviewsHtml}
    </div>
    <script type="application/json" id="product-data">${productData}</script>
  `;
}

function buildProductPage(product, baseHtml, imageSet, lang, t) {
  const pageUrl = `${SITE_URL}${langPrefix(lang)}/${product.kind}/${product.slug}/`;
  const ukUrl = `${SITE_URL}/${product.kind}/${product.slug}/`;
  const ruUrl = `${SITE_URL}/ru/${product.kind}/${product.slug}/`;
  const metaTitle = `${product.title} ${t('meta.productTitleSuffix', '— купити в TIRE PLACE, Кривий Ріг')}`;
  const priceLine =
    product.price !== null
      ? `${product.price.toLocaleString('uk-UA')} грн`
      : t('meta.priceOnRequestLower', 'ціна за запитом');
  // У шин title уже закінчується розміром ("... 195/65 R15") — без цієї перевірки опис виходив
  // із дублем. У дисків size додає PCD/ET, яких у title немає, тож він потрібен.
  const sizePart = product.sizeLine && !product.title.includes(product.sizeLine) ? `, ${product.sizeLine}` : '';
  const metaDescription = `${product.title}${sizePart} — ${priceLine}. ${
    product.inStock ? t('product.inStock', 'В наявності') : t('product.outOfStock', 'Немає в наявності')
  } ${t('meta.productStoreLine', 'в автомагазині TIRE PLACE, Кривий Ріг.')}`;
  // Соцмережі краще тягнути з власного домену (стабільніше, ніж покладатись, що postimg.cc
  // лишиться доступним для скрапера) — беремо JPEG-варіант, якщо фото вдалось оптимізувати.
  const ogImageUrl = imageSet?.jpg ? `${SITE_URL}${imageSet.jpg}` : product.imageUrl;

  let html = baseHtml;
  html = replaceMain(html, buildMainHtml(product, imageSet, t, lang), LABEL);
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, () => `<title>${escapeHtml(metaTitle)}</title>`);
  html = replaceAttr(html, '<meta name="description"[^>]*?content="', metaDescription, LABEL);
  html = replaceAttr(html, '<link rel="canonical" id="canonical-link" href="', pageUrl, LABEL);
  html = replaceAttr(html, '<meta property="og:title" content="', metaTitle, LABEL);
  html = replaceAttr(html, '<meta property="og:description" content="', metaDescription, LABEL);
  html = replaceAttr(html, '<meta property="og:url" id="og-url-meta" content="', pageUrl, LABEL);
  html = replaceAttr(html, '<meta name="twitter:title" content="', metaTitle, LABEL);
  html = replaceAttr(html, '<meta name="twitter:description" content="', metaDescription, LABEL);
  if (ogImageUrl) {
    html = replaceAttr(html, '<meta property="og:image" content="', ogImageUrl, LABEL);
    html = replaceAttr(html, '<meta name="twitter:image" content="', ogImageUrl, LABEL);
    // Розміри 1200×900 стосувались фото вивіски з головної — до фото товару вони не підходять.
    html = removeAll(html, /[ \t]*<meta property="og:image:(?:width|height)" content="\d+" \/>[ \t]*\r?\n?/g, 'og:image:width/height', LABEL);
  }

  // main.js (i18n.ts) під час старту перезаписує #canonical-link/#og-url-meta на URL головної,
  // а applyStaticTranslations() — усі теги з data-i18n/data-i18n-attr="content:meta.*" на
  // RU-рядки головної. Обидва пошуки мають нічого не знайти на сторінці товару, інакше
  // побудовані тут SEO-теги зникають одразу після виконання JS (у DOM, який індексує Google).
  html = stripI18nHooks(html, LABEL);

  // hreflang: власна взаємна пара цієї сторінки, а не альтернативи головної з оболонки.
  // (Доки RU-версії товару не існувало, тут увесь блок вирізався.) og:locale:alternate
  // навпаки НЕ чіпаємо: обидві оболонки вже несуть правильне значення — dist/index.html
  // "ru_RU", dist/ru/index.html "uk_UA".
  html = removeAll(
    html,
    /[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*"[^>]*\/>[ \t]*\r?\n?/g,
    'hreflang alternates',
    LABEL
  );
  const hreflangs =
    `  <link rel="alternate" hreflang="uk-UA" href="${escapeAttr(ukUrl)}" />\n` +
    `  <link rel="alternate" hreflang="ru-UA" href="${escapeAttr(ruUrl)}" />\n` +
    `  <link rel="alternate" hreflang="x-default" href="${escapeAttr(ukUrl)}" />\n`;
  html = html.replace('<!-- Open Graph / Twitter -->', () => `${hreflangs}\n  <!-- Open Graph / Twitter -->`);

  // Перемикач мови стає СПРАВЖНЬОЮ навігацією на двійника — так само, як на кластерних
  // сторінках. Причина та сама: текст <main> живе в цьому генераторі, а не в ru.json, тож
  // клієнтський i18n його не знає і залишив би сторінку українською під RU-адресою.
  html = removeAll(html, / data-lang-link="(?:uk|ru)"/g, 'data-lang-link', LABEL);
  html = html.replace(
    /<a href="\/" class="lang-switch__link"/,
    () => `<a href="${escapeAttr(ukUrl.replace(SITE_URL, ''))}" class="lang-switch__link${lang === 'uk' ? ' is-active' : ''}"`
  );
  html = html.replace(
    /<a href="\/ru\/" class="lang-switch__link"/,
    () => `<a href="${escapeAttr(ruUrl.replace(SITE_URL, ''))}" class="lang-switch__link${lang === 'ru' ? ' is-active' : ''}"`
  );

  // Preload LCP-фото hero-слайдера: hero на сторінці товару немає (<main> замінено) — це був би
  // зайвий високопріоритетний запит, що конкурує з фото самого товару.
  html = removeHeroPreload(html, LABEL);

  // Service/FAQPage/BreadcrumbList головної описують контент, якого на цій сторінці немає.
  // AutoPartsStore лишається — це загальносайтова інформація про бізнес.
  html = removeJsonLd(html, ['Service', 'FAQPage', 'BreadcrumbList'], LABEL);

  // Агрегат рахується рівно по тих відгуках, що видимі на сторінці — цього прямо вимагає Google
  // (розмічений контент має бути присутній для користувача). Обидва поля або є разом з видимим
  // блоком, або відсутні повністю: aggregateRating з reviewCount 0 робить сторінку invalid.
  const aggregate = reviewsAggregate(product.reviews);

  // Google вимагає price+priceCurrency всередині offers, якщо offers взагалі присутній —
  // рядок без ціни ("ціна за запитом") лишає Product без offers повністю, а не з "поламаним"
  // Offer без price (інакше Rich Results Test і Search Console позначать сторінку як invalid).
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: metaDescription,
    image: ogImageUrl ? [ogImageUrl] : undefined,
    sku: product.slug,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    offers:
      product.price !== null
        ? {
            '@type': 'Offer',
            price: product.price,
            priceCurrency: 'UAH',
            availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: pageUrl,
            // 14 днів на товар належної якості — мінімум за Законом України «Про захист прав
            // споживачів»; той самий текст видимий у футері (footer.terms), бо Google вимагає,
            // щоб умови повернення були доступні користувачу, а не лише в markup.
            hasMerchantReturnPolicy: {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'UA',
              returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
              merchantReturnDays: 14,
              returnMethod: 'https://schema.org/ReturnInStore',
              returnFees: 'https://schema.org/FreeReturn',
            },
          }
        : undefined,
    aggregateRating: aggregate
      ? {
          '@type': 'AggregateRating',
          ratingValue: aggregate.value,
          reviewCount: aggregate.count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
    // itemReviewed не потрібен — він неявний через вкладення Review у Product.
    review: aggregate
      ? product.reviews.map((review) => ({
          '@type': 'Review',
          author: { '@type': 'Person', name: review.author },
          datePublished: review.datePublished ?? undefined,
          reviewBody: review.body,
          reviewRating: { '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1 },
        }))
      : undefined,
  };
  // Було: середня ланка вела на "https://tire-place.com.ua/#tires" — якір головної, тобто не
  // документ. Стало: хаб /tires/ і, якщо для товару є закріплений фасет, ще й /tires/r16/.
  // Перелік той самий, що видимий у крихтах на сторінці — цього прямо вимагає Google.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: product.crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.href ? `${SITE_URL}${c.href}` : pageUrl,
    })),
  };
  const headScripts =
    `  <script type="application/ld+json">${jsonForScript(productJsonLd)}</script>\n` +
    `  <script type="application/ld+json">${jsonForScript(breadcrumbJsonLd)}</script>\n</head>`;
  html = html.replace('</head>', () => headScripts);

  // Пункти меню/футера ведуть на секції головної — на сторінці товару голий хеш (#tires) нікуди
  // не веде. Кореневий /#tires працює звідусіль; заодно селектор a[data-nav-link][href="#wheels"]
  // з render-products.ts перестає збігатись, тож його preventDefault більше не перехоплює клік.
  html = rootifyNavAnchors(html);

  // Сторінка лежить на 2 рівні глибше dist/index.html — переписуємо відносні шляхи на кореневі
  // (той самий прийом, що вже застосований у generate-ru-html.mjs для /ru/; кореневий шлях
  // резолвиться однаково незалежно від глибини поточної сторінки).
  html = rootifyAssetPaths(html);

  return { html, ogImageUrl };
}

function writeProductPage(product, html, root, lang) {
  const outDir = `${root}dist${langPrefix(lang)}/${product.kind}/${product.slug}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/index.html`, html);
}

const REVIEW_STATUS_PUBLISHED = 'Опубліковано';

/** ISO-дата з колонки timestamp. Apps Script пише "yyyy-MM-dd HH:mm:ss" текстом (апостроф-префікс),
 *  але якщо Sheets усе-таки зберегла комірку як Date, CSV-експорт віддає локалізований формат —
 *  тоді розбираємо "DD.MM.YYYY". Нерозпізнане → null: datePublished рекомендоване, а не
 *  обовʼязкове, тож краще пропустити поле, ніж викинути відгук. */
function reviewDate(raw) {
  const value = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(value);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  return null;
}

function groupReviews(rows) {
  const byProduct = new Map();
  for (const row of rows) {
    if (row.status !== REVIEW_STATUS_PUBLISHED) continue;

    const productId = (row.product_id ?? '').trim();
    const author = (row.author ?? '').trim();
    const body = (row.body ?? '').trim();
    const rating = Number.parseInt(row.rating, 10);
    // Порожнє імʼя/текст або оцінка поза 1-5 зробили б розмітку невалідною (author і
    // ratingValue — обовʼязкові поля Review), тож такий рядок пропускаємо.
    if (!productId || !author || !body || !(rating >= 1 && rating <= 5)) {
      console.warn(`generate-product-pages: пропущено відгук ${row.review_id || '(без id)'} — неповні або некоректні дані.`);
      continue;
    }

    if (!byProduct.has(productId)) byProduct.set(productId, []);
    byProduct.get(productId).push({ author, body, rating, datePublished: reviewDate(row.timestamp) });
  }

  for (const list of byProduct.values()) {
    // Рядки лежать у порядку додавання — розворот дає новіші-перші. Сортування за датою
    // уточнює порядок, якщо власник вручну переставляв рядки; Array#sort стабільний, тож
    // відгуки з однаковою (або відсутньою) датою лишаються в розвернутому порядку.
    list.reverse();
    list.sort((a, b) => (b.datePublished ?? '').localeCompare(a.datePublished ?? ''));
  }
  return byProduct;
}

/** Розкладає відгуки по товарах за колонкою "id". Порожній або неунікальний id — не привʼязка:
 *  slug виводиться з назви й розміру, тож перейменування товару чи зміна порядку рядків-дублікатів
 *  відірвали б відгуки від товару або приклеїли б їх до чужого. */
function attachReviews(products, reviewsByProduct) {
  const idCounts = new Map();
  for (const product of products) {
    if (product.productId) idCounts.set(product.productId, (idCounts.get(product.productId) ?? 0) + 1);
  }

  const duplicated = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  for (const id of duplicated) {
    console.warn(`generate-product-pages: id "${id}" повторюється в таблицях — ці товари згенеровано без блоку відгуків.`);
  }

  const matchedIds = new Set();
  for (const product of products) {
    if (!product.productId || duplicated.includes(product.productId)) {
      product.productId = '';
      product.reviews = [];
      continue;
    }
    product.reviews = reviewsByProduct.get(product.productId) ?? [];
    matchedIds.add(product.productId);
  }

  // Одним рядком, а не по товару: доки власник не заповнив колонку, інакше в лог полетіли б
  // сотні однакових попереджень.
  const missingId = products.filter((product) => !product.productId).length;
  if (missingId > 0) {
    console.warn(`generate-product-pages: у ${missingId} товар(ів) порожня або неунікальна колонка id — сторінки без блоку відгуків.`);
  }

  for (const id of reviewsByProduct.keys()) {
    if (!matchedIds.has(id)) {
      console.warn(`generate-product-pages: відгуки з product_id "${id}" не належать жодному товару — проігноровано.`);
    }
  }
}

/**
 * Мовно-НЕзалежна частина товару — усе, що складається лише з даних прайсу. Мовно-залежні
 * `specs` (ярлики характеристик) і `crumbs` рахуються в циклі по мовах, а не тут.
 *
 * `key` мусить лишитись ідентичним в обох мовах: він складається з назви й розміру, і саме по
 * ньому кошик зливає позиції. Інакше той самий товар, доданий з /ru/tires/x/ і з /tires/x/,
 * став би двома різними позиціями.
 * @param {Record<string, string>} row @param {'tires'|'wheels'} kind @param {string} slug
 */
function baseProduct(row, kind, slug) {
  const info = describeFor[kind](row, makeT('uk'));
  return {
    kind,
    slug,
    row,
    // productId читається тут, а не в describeTire/describeWheel: колонка "id" потрібна лише
    // цьому скрипту (привʼязка відгуків), клієнтському каталогу — ні.
    productId: (row.id ?? '').trim(),
    title: info.title,
    sizeLine: info.sizeLine,
    key: info.key,
    price: info.price,
    inStock: info.inStock,
    imageUrl: info.imageUrl,
    brand: info.brand,
  };
}

function loadProducts() {
  const data = readBuildJson('data.json', 'scripts/fetch-data.mjs');

  const tireSlugs = dedupeSlugs(data.tires, tireSlug);
  const wheelSlugs = dedupeSlugs(data.wheels, wheelSlug);

  const products = [
    ...data.tires.map((row, i) => baseProduct(row, 'tires', tireSlugs[i])),
    ...data.wheels.map((row, i) => baseProduct(row, 'wheels', wheelSlugs[i])),
  ].filter((product) => {
    // Порожній slug = усі колонки-ідентифікатори рядка порожні. Такий товар дав би URL
    // "/tires//" і перезаписав би dist/tires/index.html — пропускаємо повністю.
    if (!product.slug) {
      console.warn(`generate-product-pages: пропущено рядок без назви/розміру ("${product.title}") — порожній slug.`);
      return false;
    }
    return true;
  });

  attachReviews(products, groupReviews(data.reviews));
  return products;
}

/** Дописує URL сторінок товару в накопичувач для scripts/generate-sitemap.mjs — по два на
 *  товар (UA + RU) зі спільним переліком alternates. */
function collectUrls(products) {
  appendUrls(
    products.flatMap((p) => {
      const ukUrl = `${SITE_URL}/${p.kind}/${p.slug}/`;
      const ruUrl = `${SITE_URL}/ru/${p.kind}/${p.slug}/`;
      const alternates = [
        { hreflang: 'uk-UA', href: ukUrl },
        { hreflang: 'ru-UA', href: ruUrl },
        { hreflang: 'x-default', href: ukUrl },
      ];
      // image:image допомагає індексуванню фото товару в Google Images окремо від Web Search —
      // беремо той самий ownDomain-URL, що вже пішов у og:image (не хотлінк на postimg.cc).
      const images = p.ogImageUrl ? [p.ogImageUrl] : [];
      return [
        { loc: ukUrl, changefreq: 'weekly', priority: '0.6', alternates, images },
        { loc: ruUrl, changefreq: 'weekly', priority: '0.5', alternates, images },
      ];
    })
  );
}

function main() {
  // Фатальна перевірка "таблиця недоступна" живе у scripts/fetch-data.mjs і спрацьовує ДО
  // запису будь-яких файлів у dist/ — тут дані вже гарантовано валідні.
  const products = loadProducts();

  if (products.length === 0) {
    // Порожня, але доступна таблиця — валідний стан (так само трактує це клієнтський loadLiveCsv).
    console.log('generate-product-pages: немає товарів для генерації сторінок (таблиці доступні, але порожні).');
    return;
  }

  // UA — з dist/index.html, RU — з УЖЕ ПЕРЕКЛАДЕНОЇ dist/ru/index.html (крок 4 конвеєра).
  const shells = {
    uk: readFileSync(`${root}dist/index.html`, 'utf8'),
    ru: readFileSync(`${root}dist/ru/index.html`, 'utf8'),
  };
  const detailImageAssets = new Map(Object.entries(readBuildJson('images.json', 'scripts/build-product-images.mjs').detail));

  for (const lang of LANGS) {
    const t = makeT(lang);
    for (const product of products) {
      // Мовно-залежне добудовується тут; решта полів товару однакова в обох мовах.
      const view = {
        ...product,
        specs: describeFor[product.kind](product.row, t).specs,
        crumbs: productCrumbs(product, lang, t),
      };
      const imageSet = product.imageUrl ? detailImageAssets.get(product.imageUrl) : undefined;
      const { html, ogImageUrl } = buildProductPage(view, shells[lang], imageSet, lang, t);
      product.ogImageUrl = ogImageUrl; // те саме фото в обох мовах — перезапис безпечний
      writeProductPage(product, html, root, lang);
    }
  }

  collectUrls(products);
  console.log(
    `${LABEL}: згенеровано ${products.length * LANGS.length} сторінок товару ` +
      `(${products.length} × ${LANGS.length} мови).`
  );
}

try {
  main();
} catch (err) {
  console.error(`generate-product-pages: ${err.message}`);
  process.exit(1);
}
