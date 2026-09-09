// Накопичувач URL для sitemap. Кожен крок конвеєра дописує свої URL у .build/urls.json, а
// фінальний scripts/generate-sitemap.mjs збирає файл цілком.
//
// Чому так, а не "дописати перед </urlset>", як було: із трьома генераторами такий підхід
// стає порядко-залежним, і достатньо переставити кроки, щоб частина URL зникла з sitemap.
import { existsSync, readFileSync } from 'node:fs';
import { buildPath, writeBuildJson } from './build-dir.mjs';

/**
 * @typedef {{ hreflang: string, href: string }} Alternate
 * @typedef {{
 *   loc: string,
 *   changefreq?: string,
 *   priority?: string,
 *   alternates?: Alternate[],
 *   images?: string[],
 * }} SitemapEntry
 */

const FILE = 'urls.json';

/** Скидає накопичувач. Викликається на початку білда — інакше видалені сторінки лишались би
 *  в sitemap назавжди. */
export function resetUrls() {
  writeBuildJson(FILE, []);
}

/** @returns {SitemapEntry[]} */
export function readUrls() {
  const path = buildPath(FILE);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** @param {SitemapEntry[]} entries */
export function appendUrls(entries) {
  writeBuildJson(FILE, [...readUrls(), ...entries]);
}
