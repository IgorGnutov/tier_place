import { defineConfig } from 'vite';

// base: './' — відносні шляхи в білді, щоб сайт коректно працював
// і на GitHub Pages (у підпапці репозиторію), і на Netlify/Cloudflare Pages (у корені).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
