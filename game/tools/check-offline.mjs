// Fails if the built game references any remote resource it would load at runtime.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const dir = process.argv[2] ?? 'dist';
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);
const problems = [];
for (const f of files) {
  const ext = extname(f);
  if (!['.html', '.js', '.css'].includes(ext)) continue;
  const text = readFileSync(f, 'utf8');
  if (ext === '.html' && /(src|href)\s*=\s*["'](https?:)?\/\//i.test(text)) problems.push(`${f}: remote src/href`);
  if (ext === '.css' && /url\(\s*["']?(https?:)?\/\//i.test(text)) problems.push(`${f}: remote css url()`);
  if (ext === '.js') {
    for (const m of text.matchAll(/(fetch|importScripts|WebSocket|EventSource|XMLHttpRequest)\s*\(/g)) {
      problems.push(`${f}: runtime network API ${m[1]}`);
    }
    for (const m of text.matchAll(/import\s*\(\s*["'](https?:)?\/\//g)) problems.push(`${f}: remote dynamic import ${m[0]}`);
  }
}
if (problems.length) {
  console.error('OFFLINE CHECK FAILED\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`offline check passed: ${files.length} files, no remote loads`);
