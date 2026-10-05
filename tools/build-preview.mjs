/**
 * Builds one self-contained HTML file of the app for previewing inside Claude.
 * Usage (needs Node 18+):  npx esbuild --version  &&  node tools/build-preview.mjs
 * Output: preview/wordnest-preview.html
 *
 * It bundles js/app.js, inlines the CSS and logo, and turns on CONFIG.PREVIEW
 * (no outside network, Claude picks new words, sync off). Your GitHub files are not changed.
 */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const previewPlugin = {
  name: 'preview',
  setup(b) {
    b.onLoad({ filter: /config\.js$/ }, (args) => ({
      contents: fs.readFileSync(args.path, 'utf8').replace('PREVIEW: false', 'PREVIEW: true'),
      loader: 'js',
    }));
  },
};

const result = await build({
  entryPoints: [path.join(root, 'js/app.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: false,
  write: false,
  plugins: [previewPlugin],
});
const iconUri = 'data:image/svg+xml;base64,' + Buffer.from(read('icons/icon.svg')).toString('base64');
const js = result.outputFiles[0].text
  .replaceAll('"icons/icon.svg"', JSON.stringify(iconUri))
  .replace(/<\/script/gi, '<\\/script');

let html = read('index.html')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${iconUri}">`)
  .replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>\n${read('css/styles.css')}\n</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>\n${js}\n</script>`);

fs.mkdirSync(path.join(root, 'preview'), { recursive: true });
fs.writeFileSync(path.join(root, 'preview/wordnest-preview.html'), html);
console.log(`Built preview/wordnest-preview.html (${Math.round(html.length / 1024)} KB)`);
