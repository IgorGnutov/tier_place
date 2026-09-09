// Єдиний рендер картки товару: цей самий рядок HTML віддає і клієнтський каталог
// (render-products.ts → grid.innerHTML), і прередер головної, і сторінки хаба/фасета.
// Фізично один код — саме тому статика й клієнт не можуть намалювати різні картки.
//
// Три речі свідомо НЕ такі, як у попередньої DOM-версії (renderCard):
//  1. Плейсхолдер замість зламаного фото робить ОДИН делегований слухач `error` на гріді у
//     фазі capture (див. render-products.ts). Інлайновий onerror= неможливий: CSP має
//     script-src 'self' без 'unsafe-inline'.
//  2. Кнопка "Купити" несе data-buy="<ключ товару>" замість замикання — один слухач на грід
//     замість PAGE_SIZE замикань на кожне перемальовування.
//  3. Кнопка на статиці не має обробника взагалі, доки не стартує main.js — це нормально:
//     клієнт перемальовує грід із живих даних одразу після завантаження.
import { escapeHtml, escapeAttr } from './html-escape.mjs';
import { priceText } from './describe.mjs';

/**
 * @param {string | null} imageUrl
 * @param {string} title
 * @param {{ avif?: string, webp?: string, jpg?: string } | undefined} optimized
 * @returns {string}
 */
function photoHtml(imageUrl, title, optimized) {
  if (!imageUrl) return '<div class="product-card__photo product-card__photo--placeholder"></div>';

  const img = `<img src="${escapeAttr(optimized?.jpg ?? imageUrl)}" alt="${escapeAttr(title)}" loading="lazy" />`;
  if (!optimized?.avif && !optimized?.webp) {
    return `<div class="product-card__photo">${img}</div>`;
  }
  // Build-скрипт заздалегідь стиснув це фото (див. product-images.ts) — віддаємо мініатюру
  // AVIF/WebP через <picture>, інакше показуємо оригінал з таблиці, як і раніше.
  const sources = [
    optimized.avif && `<source type="image/avif" srcset="${escapeAttr(optimized.avif)}" />`,
    optimized.webp && `<source type="image/webp" srcset="${escapeAttr(optimized.webp)}" />`,
  ]
    .filter(Boolean)
    .join('');
  return `<div class="product-card__photo"><picture>${sources}${img}</picture></div>`;
}

/**
 * @param {import('./describe.mjs').CardInfo} info
 * @param {Record<string, { avif?: string, webp?: string, jpg?: string }>} imageManifest
 * @param {import('./describe.mjs').Translate} t
 * @returns {string}
 */
export function productCardHtml(info, imageManifest, t) {
  // Без detailUrl (рядок таблиці без назви/розміру — статичної сторінки для нього білд не
  // згенерував) лишаємо <a> без href: він не клікабельний і не веде в нікуди.
  const href = info.detailUrl ? ` href="${escapeAttr(info.detailUrl)}"` : '';
  const photo = photoHtml(info.imageUrl ?? null, info.title, info.imageUrl ? imageManifest[info.imageUrl] : undefined);
  const specs = info.specs
    .map((s) => `<li>${escapeHtml(s.label)}: ${escapeHtml(s.value)}</li>`)
    .join('');
  const statusText = info.inStock ? t('product.inStock', 'В наявності') : t('product.outOfStock', 'Немає в наявності');
  const outOfStock = t('product.outOfStock', 'Немає в наявності');
  const buyAttrs = info.inStock ? '' : ` disabled title="${escapeAttr(outOfStock)}"`;

  return (
    `<article class="product-card">` +
    `<a class="product-card__link"${href}>` +
    photo +
    `<h3 class="product-card__title">${escapeHtml(info.title)}</h3>` +
    `</a>` +
    `<ul class="product-card__specs">${specs}</ul>` +
    `<span class="status ${info.inStock ? 'status--in' : 'status--out'}">${escapeHtml(statusText)}</span>` +
    `<div class="product-card__footer">` +
    `<span class="product-card__price">${escapeHtml(priceText(info.price, t))}</span>` +
    `<div class="product-card__actions">` +
    `<button type="button" class="btn btn--small" data-buy="${escapeAttr(info.key)}"${buyAttrs}>${escapeHtml(t('product.buy', 'Купити'))}</button>` +
    `</div></div></article>`
  );
}
