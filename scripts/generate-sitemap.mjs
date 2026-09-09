// Крок 8 (фінальний) конвеєра: збирає dist/sitemap.xml ЦІЛКОМ з .build/urls.json.
//
// Раніше public/sitemap.xml містив 2 рукописних записи, а generate-product-pages.mjs дописував
// свої перед </urlset>. З трьома генераторами це стало порядко-залежним: достатньо переставити
// кроки, щоб частина URL зникла з sitemap. Тепер кожен крок лише ДОПИСУЄ свої URL у
// .build/urls.json (корінь репо, у .gitignore — свідомо не в dist/, інакше файл поїхав би на
// прод), а цей крок віддає готовий XML.
import { writeFileSync } from 'node:fs';
import { root } from './lib/build-dir.mjs';
import { readUrls } from './lib/urls.mjs';
import { escapeAttr } from '../src/shared/html-escape.mjs';

const LABEL = 'generate-sitemap';

/** Порядок у файлі: головні → кластерні → товарні. Google порядок не читає, але людині так
 *  значно легше перевіряти файл очима. */
function sortKey(entry) {
  const path = new URL(entry.loc).pathname;
  const depth = path.split('/').filter(Boolean).length;
  if (path === '/' || path === '/ru/') return [0, path];
  if (Number(entry.priority) >= 0.7) return [1, path];
  return [2 + depth * 0, path];
}

function urlXml(entry, today) {
  const alternates = (entry.alternates ?? [])
    .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${escapeAttr(a.hreflang)}" href="${escapeAttr(a.href)}" />`)
    .join('');
  // image:image допомагає індексуванню фото товару в Google Images окремо від Web Search —
  // це той самий ownDomain-URL, що вже пішов у og:image (не хотлінк на postimg.cc).
  const images = (entry.images ?? [])
    .map((src) => `\n    <image:image>\n      <image:loc>${escapeAttr(src)}</image:loc>\n    </image:image>`)
    .join('');
  return (
    `  <url>\n    <loc>${escapeAttr(entry.loc)}</loc>\n    <lastmod>${today}</lastmod>\n` +
    `    <changefreq>${entry.changefreq ?? 'weekly'}</changefreq>\n` +
    `    <priority>${entry.priority ?? '0.5'}</priority>${alternates}${images}\n  </url>`
  );
}

function main() {
  const entries = readUrls();
  // Порожній список означає, що попередні кроки не виконались. Віддати такий sitemap не можна:
  // delete-sync деплой замінив би робочий файл на порожній.
  if (entries.length === 0) {
    throw new Error('у .build/urls.json немає жодного URL — попередні кроки конвеєра не виконались');
  }

  const byLoc = new Map();
  for (const entry of entries) byLoc.set(entry.loc, entry);
  const unique = [...byLoc.values()].sort((a, b) => {
    const [ka, pa] = sortKey(a);
    const [kb, pb] = sortKey(b);
    return ka - kb || pa.localeCompare(pb);
  });

  const today = new Date().toISOString().slice(0, 10);
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"' +
    ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' +
    ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    unique.map((entry) => urlXml(entry, today)).join('\n') +
    '\n</urlset>\n';

  writeFileSync(`${root}dist/sitemap.xml`, xml);
  console.log(`${LABEL}: ${unique.length} URL у dist/sitemap.xml.`);
}

try {
  main();
} catch (err) {
  console.error(`${LABEL}: ${err.message}`);
  process.exitCode = 1;
}
