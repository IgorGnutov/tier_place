// Генерує AVIF/WebP/JPEG у розмірах 480/768/1200/1920px для всіх фото з assets/photos/
// (крім вже згенерованих у assets/photos/optimized/). Запуск: npm run optimize:photos
import { readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC_DIR = path.resolve('public/assets/photos');
const OUT_DIR = path.resolve('public/assets/photos/optimized');
const WIDTHS = [480, 768, 1200, 1920];
const FORMATS = ['avif', 'webp', 'jpg'];

async function run() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(SRC_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));
  if (files.length === 0) {
    console.log('Немає фото для обробки в assets/photos/. Додайте файли за інструкцією з README.');
    return;
  }

  for (const file of files) {
    const base = file.replace(/\.(jpe?g|png)$/i, '');
    const srcPath = path.join(SRC_DIR, file);
    const meta = await sharp(srcPath).metadata();
    console.log(`\n${file} — ${meta.width}x${meta.height}`);

    for (const width of WIDTHS) {
      if (width > (meta.width ?? width)) continue; // без апскейлу

      for (const format of FORMATS) {
        const outPath = path.join(OUT_DIR, `${base}-${width}.${format}`);
        let pipeline = sharp(srcPath).resize({ width, withoutEnlargement: true });

        if (format === 'avif') pipeline = pipeline.avif({ quality: 55 });
        else if (format === 'webp') pipeline = pipeline.webp({ quality: 70 });
        else pipeline = pipeline.jpeg({ quality: 75, progressive: true, mozjpeg: true });

        await pipeline.toFile(outPath);
        console.log(`  → ${path.relative(process.cwd(), outPath)}`);
      }
    }
  }

  console.log('\nГотово. Оновіть src/data/gallery.ts, якщо додали нові фото/слоти.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
