// Real browser smoke test: drives the BUILT game with keyboard + touch input in headless Chromium,
// serves dist/ from a loopback-only static server, blocks every other request, saves screenshots.
// Usage: node tools/smoke.mjs dist [outDir]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, normalize, extname, sep } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const out = resolve(process.argv[3] ?? 'smoke-output');
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(dist, path === '/' ? 'index.html' : path));
  if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/index.html?seed=12345`;
const isLocal = (u) => u.startsWith(origin + '/') || u.startsWith('data:') || u.startsWith('blob:');
const log = [];
const note = (m) => { log.push(m); console.log(m); };
const fail = (m) => { throw new Error(m); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({ viewport: { width: 960, height: 600 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
const blocked = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await context.route('**/*', (route) => {
  const u = route.request().url();
  if (isLocal(u)) return route.continue();
  blocked.push(u);
  return route.abort();
});

const snap = () => page.evaluate(() => window.__arenaSlice.snapshot());
async function waitFor(pred, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    const s = await snap();
    if (pred(s)) return s;
    if (Date.now() - t0 > timeoutMs) fail(`timeout waiting for ${label}; last=${JSON.stringify(s)}`);
    await page.waitForTimeout(100);
  }
}

try {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__arenaSlice);
  const gl = await page.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); return g ? g.getParameter(g.VERSION) : null; });
  note(`WebGL: ${gl}`);
  if (!gl) fail('no WebGL context available');
  const renderer = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const ext = g && g.getExtension('WEBGL_debug_renderer_info'); return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  note(`WebGL renderer: ${renderer}`);
  // Prove the game canvas actually rendered pixels (read in the same frame, after the game's own render).
  const pixels = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => { const c = document.getElementById('view'); const t = document.createElement('canvas'); t.width = 64; t.height = 40; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 40); const d = x.getImageData(0, 0, 64, 40).data; const set = new Set(); let lit = 0; for (let i = 0; i < d.length; i += 4) { set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`); if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; } done({ distinctColours: set.size, litPixels: lit, total: d.length / 4 }); })));
  note(`canvas pixels: ${JSON.stringify(pixels)}`);
  if (pixels.litPixels < pixels.total * 0.5 || pixels.distinctColours < 4) fail('game canvas did not render a scene');
  await page.screenshot({ path: join(out, '01-start.png') });
  await page.click('#start-btn');
  let s = await waitFor((x) => x.started, 2000, 'start');
  note(`started phase=${s.phase} hp=${s.player.hp}`);

  // Keyboard movement
  const x0 = s.player.x;
  await page.keyboard.down('KeyD'); await page.waitForTimeout(800); await page.keyboard.up('KeyD');
  s = await snap();
  if (!(s.player.x > x0 + 2)) fail(`keyboard D did not move right: ${x0} -> ${s.player.x}`);
  note(`keyboard D moved x ${x0.toFixed(2)} -> ${s.player.x.toFixed(2)}`);
  const z0 = s.player.z;
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  s = await snap();
  if (!(s.player.z < z0 - 1.5)) fail(`keyboard W did not move up: ${z0} -> ${s.player.z}`);
  note(`keyboard W moved z ${z0.toFixed(2)} -> ${s.player.z.toFixed(2)}`);

  // Touch joystick (real touch events via CDP -> pointer events with pointerType=touch)
  const cdp = await context.newCDPSession(page);
  const tx0 = (await snap()).player.x;
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', 300, 400);
  for (let i = 1; i <= 5; i++) { await touch('touchMove', 300 - i * 20, 400); await page.waitForTimeout(16); }
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, '02-touch-joystick.png') });
  await touch('touchEnd', 200, 400);
  s = await snap();
  if (!(s.player.x < tx0 - 1.5)) fail(`touch joystick did not move left: ${tx0} -> ${s.player.x}`);
  note(`touch joystick moved x ${tx0.toFixed(2)} -> ${s.player.x.toFixed(2)}`);

  // Combat + earned XP -> level-up choice
  s = await waitFor((x) => x.phase === 'levelup' || x.phase === 'defeated', 90000, 'first level-up');
  if (s.phase !== 'levelup') fail('defeated before first level-up');
  note(`level-up at t=${s.time.toFixed(1)}s kills=${s.kills} xpCollected=${s.xpCollected} choices=${s.choices}`);
  if (s.kills < 1 || s.xpCollected < 1) fail('level-up without kills/xp');
  await page.screenshot({ path: join(out, '03-levelup-choice.png') });
  const firstChoice = s.choices[0];
  await page.keyboard.press('Digit1');
  s = await waitFor((x) => x.phase !== 'levelup' || x.player.upgrades.length > 0, 2000, 'choice applied');
  if (s.player.upgrades[0] !== firstChoice) fail(`expected upgrade ${firstChoice}, got ${s.player.upgrades}`);
  note(`picked ${firstChoice}; phase=${s.phase}`);

  // Let the run continue; resolve further level-ups by clicking the first card.
  let midShot = false;
  let hpDropped = false;
  const t0 = Date.now();
  for (;;) {
    s = await snap();
    if (s.player.hp < s.player.maxHp) hpDropped = true;
    if (!midShot && s.enemies >= 4 && s.phase === 'playing') { await page.screenshot({ path: join(out, '04-combat.png') }); midShot = true; }
    if (s.phase === 'levelup') await page.click('#choices .choice');
    if (s.phase === 'defeated') break;
    if (Date.now() - t0 > 300000) fail(`run did not end within 300s; last=${JSON.stringify(s)}`);
    await page.waitForTimeout(150);
  }
  if (!hpDropped) fail('never observed enemy damage before defeat');
  note(`defeated at t=${s.time.toFixed(1)}s level=${s.player.level} kills=${s.kills} upgrades=${s.player.upgrades.join(',')}`);
  if (!(await page.isVisible('#defeat'))) fail('defeat overlay not visible');
  await page.screenshot({ path: join(out, '05-defeat.png') });

  // Restart
  await page.keyboard.press('KeyR');
  s = await waitFor((x) => x.runCount === 2, 2000, 'restart');
  if (s.phase !== 'playing' || s.player.hp !== s.player.maxHp || s.player.level !== 1 || s.kills !== 0) fail(`restart not fresh: ${JSON.stringify(s)}`);
  await page.waitForTimeout(1500);
  s = await snap();
  if (!(s.time > 0.5)) fail('restarted run is not ticking');
  note(`restart OK: fresh run ticking t=${s.time.toFixed(1)}s hp=${s.player.hp}`);
  await page.screenshot({ path: join(out, '06-restarted.png') });

  // Portrait phone-sized viewport: tap Start, drag the joystick upward, confirm movement.
  const phone = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await phone.route('**/*', (route) => { const u = route.request().url(); if (isLocal(u)) return route.continue(); blocked.push(u); return route.abort(); });
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push(String(e)));
  await pp.goto(url);
  await pp.waitForFunction(() => !!window.__arenaSlice);
  const box = await pp.locator('#start-btn').boundingBox();
  await pp.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await pp.waitForFunction(() => window.__arenaSlice.snapshot().started);
  const pcdp = await phone.newCDPSession(pp);
  const ptouch = (type, x, y) => pcdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const pz0 = (await pp.evaluate(() => window.__arenaSlice.snapshot())).player.z;
  await ptouch('touchStart', 206, 700);
  for (let i = 1; i <= 5; i++) { await ptouch('touchMove', 206, 700 - i * 20); await pp.waitForTimeout(16); }
  await pp.waitForTimeout(800);
  await pp.screenshot({ path: join(out, '07-phone-portrait.png') });
  await ptouch('touchEnd', 206, 600);
  const pz1 = (await pp.evaluate(() => window.__arenaSlice.snapshot())).player.z;
  if (!(pz1 < pz0 - 1.5)) fail(`phone portrait joystick did not move up: ${pz0} -> ${pz1}`);
  note(`phone 412x915 touch: tap Start OK, joystick moved z ${pz0.toFixed(2)} -> ${pz1.toFixed(2)}`);
  await phone.close();

  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
  if (blocked.length) fail(`attempted network requests: ${blocked.join(', ')}`);
  note('network: 0 non-local requests attempted');
  note('SMOKE PASS');
} catch (e) {
  note(`SMOKE FAIL: ${e.message}`);
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  writeFileSync(join(out, 'smoke-log.txt'), log.join('\n') + '\n');
  await browser.close();
  server.close();
}
