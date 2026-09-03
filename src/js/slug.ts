// Генерація URL-slug для сторінки товару з існуючих колонок CSV (без зміни таблиці).
// Та сама формула продубльована в scripts/generate-product-pages.mjs звичайним JS — це
// скрипт для Node 20 у CI, який не може імпортувати .ts. Змінюючи формулу тут, оновіть і там.
import type { CsvRow } from './csv';

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ю: 'iu', я: 'ia', ы: 'y', э: 'e', ъ: '',
};

export function slugify(input: string): string {
  const translit = input
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('');
  return translit
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function tireSlug(row: CsvRow): string {
  const parts = [row.brand, row.model, row.width, row.profile, row.diameter && `r${row.diameter}`, row.season];
  return slugify(parts.filter(Boolean).join('-'));
}

export function wheelSlug(row: CsvRow): string {
  const parts = [
    row.brand,
    row.model,
    row.diameter && `r${row.diameter}`,
    row.width && `j${row.width}`,
    row.pcd && `pcd${row.pcd}`,
    row.et && `et${row.et}`,
  ];
  return slugify(parts.filter(Boolean).join('-'));
}

/** Дедуплікація slug-ів у межах одного каталогу — колізії отримують суфікс -2, -3... за порядком рядків. */
export function dedupeSlugs<T>(rows: T[], slugOf: (row: T) => string): string[] {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const base = slugOf(row);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    if (seen > 0) console.warn(`slug: колізія "${base}" — застосовано суфікс -${seen + 1}`);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}
