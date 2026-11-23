import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Astro adds the type and src of processed scripts. Keep the bundled entry
// render-blocking in production so a stored theme is applied on the first paint.
export default function renderBlockingScript() {
  return {
    name: 'render-blocking-script',
    hooks: {
      'astro:build:done': async ({dir}) => {
        const root = fileURLToPath(dir);
        const pages = (await readdir(root, {recursive: true})).filter(file => file.endsWith('.html'));
        await Promise.all(pages.map(async file => {
          const path = join(root, file);
          const html = await readFile(path, 'utf8');
          const next = html.replace(/<script type="module" src="\/assets\/Layout\.astro_[\w.-]+\.js">/g,
            script => script.replace(' type=', ' blocking="render" type='));
          if (next !== html) await writeFile(path, next);
        }));
      },
    },
  };
}
