import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// base: './' — відносні шляхи в білді, щоб сайт коректно працював
// і на GitHub Pages (у підпапці репозиторію), і на Netlify/Cloudflare Pages (у корені).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      // Другий entry — /admin (редагування текстових блоків), не входить у публічний бандл.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin/index.html', import.meta.url)),
      },
    },
  },
});
