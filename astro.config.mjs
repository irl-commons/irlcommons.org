import {defineConfig} from 'astro/config';
import renderBlockingScript from './scripts/render-blocking-script.mjs';
export default defineConfig({
  site: 'https://irlcommons.org',
  output: 'static',
  build: { format: 'file', assets: 'assets', inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [renderBlockingScript()],
  compressHTML: false,
});
