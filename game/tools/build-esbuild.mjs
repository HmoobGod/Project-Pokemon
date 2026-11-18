// Fallback offline build that does not need Vite (used where Vite cannot be installed).
// Produces dist/index.html + dist/game.js + dist/style.css with relative paths only.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife', // classic script: also opens directly from file:// (no module CORS rules)
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
  outfile: join(out, 'game.js'),
  logLevel: 'info',
});
copyFileSync(join(root, 'src/style.css'), join(out, 'style.css'));
const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace('./src/style.css', './style.css')
  .replace('<script type="module" src="./src/main.ts"></script>', '<script defer src="./game.js"></script>');
if (!html.includes('src="./game.js"')) throw new Error('index.html script tag not rewritten');
writeFileSync(join(out, 'index.html'), html);
console.log('built', out);
