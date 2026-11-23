import {defineConfig} from 'astro/config';
export default defineConfig({
  site: 'https://irlcommons.org',
  output: 'static',
  build: { format: 'file', assets: 'assets', inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
  compressHTML: false,
});
