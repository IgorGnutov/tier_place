// Маніфест оптимізованих фото товару, згенерований scripts/generate-product-pages.mjs під час
// білда: мапить оригінальний image_url з таблиці (як є, після trim()) на локальні AVIF/WebP/JPEG
// зменшеної якості для мініатюр каталогу — щоб картки не тягли повнорозмірні фото з postimg.cc.
// У dev-режимі (npm run dev) файл не генерується — public/data/product-images.json лишається
// порожнім стабом ({}), і всі картки просто показують оригінальний imageUrl (див. render-products.ts).
export interface ProductImageSet {
  avif?: string;
  webp?: string;
  jpg?: string;
}

type Manifest = Record<string, ProductImageSet>;

let manifestPromise: Promise<Manifest> | null = null;

async function fetchManifest(): Promise<Manifest> {
  try {
    const res = await fetch('/data/product-images.json', { cache: 'no-store' });
    if (!res.ok) return {};
    return (await res.json()) as Manifest;
  } catch {
    // Немає файлу (dev-режим) або мережева помилка — не критично, картки покажуть оригінал.
    return {};
  }
}

export function getProductImageManifest(): Promise<Manifest> {
  if (!manifestPromise) manifestPromise = fetchManifest();
  return manifestPromise;
}
