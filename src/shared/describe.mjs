// Мапінг "рядок CSV → вміст картки/сторінки товару". Раніше дублювався між
// src/js/render-products.ts (tiresDescribe/wheelsDescribe) і
// scripts/generate-product-pages.mjs (describeTire/describeWheel). Різниця між копіями була
// рівно в тому, що клієнт проганяв ярлики через t(), а скрипт мав українські — тому t тепер
// параметр: клієнт передає свій t з i18n.ts, скрипти — (_key, uk) => uk або RU-словник.
import { parsePrice, parseBool } from './csv-values.mjs';

/**
 * @typedef {(key: string, ukFallback: string) => string} Translate
 * @typedef {{ label: string, value: string }} Spec
 * @typedef {{
 *   title: string,
 *   specs: Spec[],
 *   price: number | null,
 *   inStock: boolean,
 *   key: string,
 *   detailUrl: string,
 *   sizeLine: string,
 *   imageUrl: string | null,
 *   brand: string | null,
 * }} CardInfo
 */

/**
 * @param {Record<string, string>} row
 * @param {Translate} t
 * @returns {CardInfo}
 */
export function describeTire(row, t) {
  const title = `${row.brand ?? ''} ${row.model ?? ''} ${row.width}/${row.profile} R${row.diameter}`.trim();
  const size = `${row.width}/${row.profile} R${row.diameter}`;
  return {
    title,
    specs: [
      { label: t('filters.season', 'Сезон'), value: row.season || '—' },
      {
        label: t('filters.studded', 'Шипи'),
        value: parseBool(row.studded) ? t('product.yes', 'Так') : t('product.no', 'Ні'),
      },
      ...(row.load_index ? [{ label: t('product.loadIndex', 'Індекс навантаження'), value: row.load_index }] : []),
      ...(row.speed_index ? [{ label: t('product.speedIndex', 'Індекс швидкості'), value: row.speed_index }] : []),
      ...(row.year ? [{ label: t('filters.year', 'Рік'), value: row.year }] : []),
      ...(row.country ? [{ label: t('filters.country', 'Країна'), value: row.country }] : []),
    ],
    price: parsePrice(row.price),
    inStock: parseBool(row.in_stock),
    key: `tires:${title}:${size}`,
    detailUrl: row.__detailUrl ?? '',
    sizeLine: size,
    imageUrl: row.image_url?.trim() || null,
    brand: row.brand?.trim() || null,
  };
}

/**
 * @param {Record<string, string>} row
 * @param {Translate} t
 * @returns {CardInfo}
 */
export function describeWheel(row, t) {
  const title = `${row.brand ?? ''} ${row.model ?? ''} R${row.diameter} J${row.width}`.trim();
  const size = `R${row.diameter} J${row.width} PCD ${row.pcd} ET${row.et}`;
  return {
    title,
    specs: [
      { label: t('filters.type', 'Тип'), value: row.type || '—' },
      { label: 'PCD', value: row.pcd || '—' },
      { label: 'ET', value: row.et || '—' },
      { label: 'DIA', value: row.dia || '—' },
      ...(row.color ? [{ label: t('product.color', 'Колір'), value: row.color }] : []),
    ],
    price: parsePrice(row.price),
    inStock: parseBool(row.in_stock),
    key: `wheels:${title}:${size}`,
    detailUrl: row.__detailUrl ?? '',
    sizeLine: size,
    imageUrl: row.image_url?.trim() || null,
    brand: row.brand?.trim() || null,
  };
}

/** Ярлик каталогу для крихт і заголовків. @param {'tires'|'wheels'} kind @param {Translate} t */
export function catalogLabel(kind, t) {
  return kind === 'tires' ? t('nav.tires', 'Шини') : t('nav.wheels', 'Диски');
}

/** Ціна рядком у тій самій формі, що бачить користувач. "грн" однакове в обох мовах, а
 *  uk-UA-групування розрядів збігається з ru-UA — тому локаль зафіксована.
 *  @param {number|null} price @param {Translate} t */
export function priceText(price, t) {
  return price !== null ? `${price.toLocaleString('uk-UA')} грн` : t('product.priceOnRequest', 'Ціна за запитом');
}
