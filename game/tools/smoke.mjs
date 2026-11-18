// Real browser smoke test: drives the BUILT game with keyboard + touch input in headless Chromium,
// serves dist/ from a loopback-only static server, blocks every other request, saves screenshots.
// Usage: node tools/smoke.mjs dist [outDir]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { resolve, join, normalize, extname, sep } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const out = resolve(process.argv[3] ?? 'smoke-output');
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
async function serve(root) {
  const srv = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(root, path === '/' ? 'index.html' : path));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, origin: `http://127.0.0.1:${srv.address().port}` };
}
// SMOKE_ORIGIN lets CI drive an already-running server (e.g. `vite preview`) for the main run.
const { srv: server, origin } = process.env.SMOKE_ORIGIN ? { srv: { close() {} }, origin: process.env.SMOKE_ORIGIN.replace(/\/$/, '') } : await serve(dist);
const url = `${origin}/index.html?seed=12345`;
const localOrigins = [origin];
const isLocal = (u) => localOrigins.some((o) => u.startsWith(o + '/')) || u.startsWith('data:') || u.startsWith('blob:');
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
// A 404 for the optional private sprite folder is expected when no sprites are installed.
page.on('console', (m) => { if (m.type() === 'error' && !(m.location().url || '').includes('/private-sprites/')) errors.push(m.text()); });
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
  note(`serving main run from ${process.env.SMOKE_ORIGIN ? 'external server ' + origin : 'built-in loopback server'}`);
  note(`WebGL: ${gl}`);
  if (!gl) fail('no WebGL context available');
  const renderer = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const ext = g && g.getExtension('WEBGL_debug_renderer_info'); return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
  note(`WebGL renderer: ${renderer}`);
  // Prove the game canvas actually rendered pixels (read in the same frame, after the game's own render).
  const pixels = await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => { const c = document.getElementById('view'); const t = document.createElement('canvas'); t.width = 64; t.height = 40; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 40); const d = x.getImageData(0, 0, 64, 40).data; const set = new Set(); let lit = 0; for (let i = 0; i < d.length; i += 4) { set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`); if (d[i] + d[i + 1] + d[i + 2] > 60) lit++; } done({ distinctColours: set.size, litPixels: lit, total: d.length / 4 }); })));
  note(`canvas pixels: ${JSON.stringify(pixels)}`);
  if (pixels.litPixels < pixels.total * 0.5 || pixels.distinctColours < 4) fail('game canvas did not render a scene');
  await page.screenshot({ path: join(out, '01-start.png') });
  // No private sprites in this build: placeholders + base credits only.
  let sp = await waitFor((x) => x.sprites !== null, 5000, 'sprite check');
  if (sp.sprites.status !== 'none' || sp.sprites.rendered.length !== 0) fail(`expected no sprites, got ${JSON.stringify(sp.sprites)}`);
  await page.click('#credits-btn');
  const baseCredits = await page.textContent('#credits-list');
  if (!baseCredits.includes('three.js') || baseCredits.includes('Source:')) fail(`unexpected base credits: ${baseCredits}`);
  note(`no-sprite build: status=${sp.sprites.status}, placeholders used, credits = base only`);
  await page.click('#credits-close');
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
  if (!(await page.isVisible('#result'))) fail('result overlay not visible');
  if ((await page.textContent('#result-title')) !== 'Defeated' || s.result?.outcome !== 'defeat') fail(`expected defeat result, got ${JSON.stringify(s.result)}`);
  note(`defeat result: outcome=${s.result.outcome} stage=${s.result.stageReached} bosses=${s.result.bossesDefeated} (stage state at defeat: ${s.stage.state} ${s.stage.kills}/${s.stage.quota})`);
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

  // Pause -> Quit is its own outcome (not defeat, not victory), then restart.
  await page.click('#pause');
  s = await waitFor((x) => x.paused, 2000, 'pause');
  const tp = s.time;
  await page.waitForTimeout(800);
  s = await snap();
  if (Math.abs(s.time - tp) > 1e-9) fail('time advanced while paused');
  await page.click('#quit-btn');
  s = await waitFor((x) => x.phase === 'quit', 2000, 'quit');
  if ((await page.textContent('#result-title')) !== 'Run abandoned' || s.result.outcome !== 'quit') fail(`quit result wrong: ${JSON.stringify(s.result)}`);
  await page.screenshot({ path: join(out, '06b-quit.png') });
  await page.click('#restart-btn');
  s = await waitFor((x) => x.runCount === 3 && x.phase === 'playing', 2000, 'restart after quit');
  note(`pause froze time; quit -> outcome=quit ("Run abandoned"); restart -> fresh run #${s.runCount}`);
  await page.close();

  // ---- Full stage -> boss -> portal -> stage 2 -> boss -> FINAL portal -> victory, played through real input ----
  // Uses ?preset=short (same mechanics, smaller quotas/boss HP) so it fits a real-time CI run.
  {
    const sp = await context.newPage();
    sp.on('pageerror', (e) => errors.push(String(e)));
    const ssnap = () => sp.evaluate(() => window.__arenaSlice.snapshot());
    const held = new Set();
    async function setKeys(want) {
      for (const k of [...held]) if (!want.has(k)) { await sp.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await sp.keyboard.down(k); held.add(k); }
    }
    function steer(x) {
      const p = x.player; let mx = 0, mz = 0, nearest = Infinity;
      for (const [ex, ez, isBoss] of x.enemyPositions) {
        const dx = p.x - ex, dz = p.z - ez, d = Math.hypot(dx, dz) || 0.01;
        nearest = Math.min(nearest, d);
        const danger = isBoss ? (x.boss && x.boss.ai === 'slam' ? 8 : 6.5) : 4.5;
        if (d < danger) { const w = ((danger - d) / danger) * (isBoss ? 3 : 1); mx += (dx / d) * w; mz += (dz / d) * w; }
      }
      if (Math.abs(p.x) > 25) mx -= Math.sign(p.x) * 1.5;
      if (Math.abs(p.z) > 25) mz -= Math.sign(p.z) * 1.5;
      let goal = x.stage.portal;
      if (!goal && nearest > 4) { let best = 12; for (const [ox, oz] of x.orbPositions) { const d = Math.hypot(ox - p.x, oz - p.z); if (d < best) { best = d; goal = { x: ox, z: oz }; } } }
      if (!goal && x.boss && Math.hypot(x.boss.x - p.x, x.boss.z - p.z) > 11) goal = { x: x.boss.x, z: x.boss.z };
      if (goal) { const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz) || 1; const pull = x.stage.portal ? 1.6 : 0.8; mx += (dx / d) * pull; mz += (dz / d) * pull; }
      const keys = new Set();
      const len = Math.hypot(mx, mz);
      if (len > 0.15) { mx /= len; mz /= len; if (mx > 0.38) keys.add('KeyD'); if (mx < -0.38) keys.add('KeyA'); if (mz > 0.38) keys.add('KeyS'); if (mz < -0.38) keys.add('KeyW'); }
      return keys;
    }
    let won = null;
    const seen = new Set();
    for (let attempt = 1; attempt <= 4 && !won; attempt++) {
      await sp.goto(`${origin}/index.html?preset=short&seed=${4000 + attempt}`);
      await sp.waitForFunction(() => !!window.__arenaSlice);
      if (!(await sp.isVisible('#preset-tag'))) fail('short preset is not labelled on screen');
      await sp.click('#start-btn');
      const tStart = Date.now();
      let bossHpSeen = null;
      for (;;) {
        const x = await ssnap();
        const tag = `${x.stage.index + 1}:${x.stage.state}`;
        if (!seen.has(tag)) { seen.add(tag); note(`  attempt ${attempt}: stage ${tag} at t=${x.time.toFixed(1)}s kills=${x.stage.kills}/${x.stage.quota}`); if (x.stage.state === 'boss') await sp.screenshot({ path: join(out, `10-stage${x.stage.index + 1}-boss.png`) }); if (x.stage.state === 'portal') await sp.screenshot({ path: join(out, `11-stage${x.stage.index + 1}-portal.png`) }); }
        if (x.boss && !seen.has('bossshot') && Math.hypot(x.boss.x - x.player.x, x.boss.z - x.player.z) < 8) { seen.add('bossshot'); await sp.screenshot({ path: join(out, '10b-boss-fight.png') }); }
        if (x.boss) { if (bossHpSeen !== null && x.boss.hp < bossHpSeen && !seen.has(`dmg${x.stage.index}`)) { seen.add(`dmg${x.stage.index}`); note(`  boss ${x.stage.index + 1} taking damage: ${x.boss.hp}/${x.boss.maxHp}`); } bossHpSeen = x.boss.hp; } else bossHpSeen = null;
        if (x.phase === 'levelup') { await setKeys(new Set()); await sp.keyboard.press('Digit1'); continue; }
        if (x.phase === 'victory') { won = x; break; }
        if (x.phase === 'defeated') { await setKeys(new Set()); note(`  attempt ${attempt}: defeated at stage ${tag} (retrying with a new run)`); break; }
        if (x.stage.canEnter) {
          await setKeys(new Set());
          if (!(await sp.isVisible('#portal-btn'))) fail('portal button not shown while standing in an open portal');
          if (x.stage.isFinal) await sp.screenshot({ path: join(out, '12-final-portal-button.png') });
          await sp.click('#portal-btn'); // the explicit activation action
          continue;
        }
        await setKeys(steer(x));
        if (Date.now() - tStart > 240000) fail(`short run did not finish in 240s: ${JSON.stringify(x.stage)}`);
        await sp.waitForTimeout(60);
      }
    }
    await setKeys(new Set());
    if (!won) fail('bot did not reach victory in 4 short-preset runs');
    for (const t of ['1:objective', '1:boss', '1:portal', '2:objective', '2:boss', '2:portal']) if (!seen.has(t)) fail(`stage state ${t} never observed`);
    if (!seen.has('dmg0') || !seen.has('dmg1')) fail('boss damage not observed for both bosses');
    if ((await sp.textContent('#result-title')) !== 'Victory!' || won.result.outcome !== 'victory' || won.result.bossesDefeated !== 2 || won.result.stagesCleared !== 2) fail(`victory result wrong: ${JSON.stringify(won.result)}`);
    await sp.screenshot({ path: join(out, '13-victory.png') });
    note(`VICTORY via final portal: t=${won.time.toFixed(1)}s kills=${won.result.kills} bosses=${won.result.bossesDefeated} stagesCleared=${won.result.stagesCleared} level=${won.result.level}`);
    await sp.keyboard.press('KeyR');
    const r = await sp.waitForFunction(() => { const x = window.__arenaSlice.snapshot(); return x.phase === 'playing' && x.stage.index === 0 && x.stage.state === 'objective' && x.result === null ? x : null; }, null, { timeout: 3000 });
    await r.dispose();
    note('restart after victory -> fresh stage 1 objective');
    await sp.close();
  }

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

  // ---- Optional sprite loader, using an ORIGINAL sheet generated right here (never committed) ----
  const fx = mkdtempSync(join(tmpdir(), 'arena-fixture-'));
  try {
    cpSync(dist, fx, { recursive: true });
    mkdirSync(join(fx, 'private-sprites'), { recursive: true });
    writeFileSync(join(fx, 'private-sprites', 'sheet.png'), makeFixtureSheet(32, 40, 4, 8));
    const fixtureCredit = { title: 'Smoke fixture sheet', authors: ['Smoke Test Generator'], source: 'generated by tools/smoke.mjs at test time', license: 'CC0-1.0' };
    const writeManifest = (sprites) => writeFileSync(join(fx, 'private-sprites', 'sprites.js'), `window.ARENA_PRIVATE_SPRITES = ${JSON.stringify({ version: 1, sprites })};\n`);
    const ent = (o = {}) => ({ image: 'sheet.png', frameWidth: 32, frameHeight: 40, frames: 4, directions: 8, fps: 8, height: 1.8, credit: fixtureCredit, ...o });
    writeManifest({ player: ent(), chaser: ent(), brute: ent({ image: 'missing.png', credit: { ...fixtureCredit, authors: ['Must Not Be Credited'] } }) });
    const { srv: fsrv, origin: forigin } = await serve(fx);
    localOrigins.push(forigin);
    try {
      const fctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
      await fctx.route('**/*', (route) => { const u = route.request().url(); if (isLocal(u)) return route.continue(); blocked.push(u); return route.abort(); });
      const fp = await fctx.newPage();
      fp.on('pageerror', (e) => errors.push(String(e)));
      const fsnap = () => fp.evaluate(() => window.__arenaSlice.snapshot());
      await fp.goto(`${forigin}/index.html?seed=777`);
      await fp.waitForFunction(() => window.__arenaSlice && window.__arenaSlice.snapshot().sprites !== null, null, { timeout: 10000 });
      let fs = await fsnap();
      if (fs.sprites.status !== 'partial' || [...fs.sprites.rendered].sort().join() !== 'chaser,player') fail(`fixture sprites not applied: ${JSON.stringify(fs.sprites)}`);
      note(`fixture sprites: status=${fs.sprites.status} rendered=${fs.sprites.rendered.join(',')} problems=${fs.sprites.problems.length} (brute fell back)`);
      await fp.click('#credits-btn');
      const ctext = await fp.textContent('#credits-list');
      if (!ctext.includes('Smoke Test Generator') || !ctext.includes('License: CC0-1.0')) fail('loaded sprite not credited');
      if (ctext.includes('Must Not Be Credited')) fail('failed sprite was credited');
      await fp.screenshot({ path: join(out, '08-credits-fixture.png') });
      note('credits list exactly the loaded fixture sprites');
      await fp.click('#credits-close');
      await fp.click('#start-btn');
      await fp.keyboard.down('KeyD'); await fp.waitForTimeout(700); await fp.keyboard.up('KeyD');
      fs = await fsnap();
      if (!(fs.player.x > 2)) fail('player did not move with sprites active');
      await fp.waitForFunction(() => window.__arenaSlice.snapshot().enemies >= 3, null, { timeout: 20000 });
      const magenta = await fp.evaluate(() => new Promise((done) => requestAnimationFrame(() => { const c = document.getElementById('view'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] > 200) n++; done(n); })));
      await fp.screenshot({ path: join(out, '09-fixture-sprites-ingame.png') });
      if (magenta < 50) fail(`fixture sprite pixels not visible on canvas (${magenta})`);
      note(`fixture billboard sprites rendered in-game: ${magenta} fixture-coloured pixels; player moved to x=${fs.player.x.toFixed(2)}`);
      await fctx.close();

      // Invalid metadata: unsafe path + missing credit -> every role stays a placeholder, game still runs.
      writeManifest({ player: ent({ image: '../escape.png' }), chaser: ent({ credit: undefined }) });
      const bctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
      await bctx.route('**/*', (route) => { const u = route.request().url(); if (isLocal(u)) return route.continue(); blocked.push(u); return route.abort(); });
      const bp = await bctx.newPage();
      bp.on('pageerror', (e) => errors.push(String(e)));
      await bp.goto(`${forigin}/index.html?seed=778`);
      await bp.waitForFunction(() => window.__arenaSlice && window.__arenaSlice.snapshot().sprites !== null, null, { timeout: 10000 });
      await bp.click('#start-btn');
      await bp.keyboard.down('KeyA'); await bp.waitForTimeout(600); await bp.keyboard.up('KeyA');
      const bs = await bp.evaluate(() => window.__arenaSlice.snapshot());
      if (bs.sprites.status !== 'failed' || bs.sprites.rendered.length !== 0 || bs.sprites.problems.length !== 2) fail(`invalid manifest not rejected: ${JSON.stringify(bs.sprites)}`);
      if (!(bs.player.x < -2)) fail('game not playable after invalid manifest');
      note(`invalid manifest: status=${bs.sprites.status}, 0 sprites used, placeholders, game playable (x=${bs.player.x.toFixed(2)})`);
      await bctx.close();
    } finally {
      fsrv.close();
    }
  } finally {
    rmSync(fx, { recursive: true, force: true });
  }

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

// Minimal PNG encoder for the generated ORIGINAL fixture sheet (no image libraries needed).
function makeFixtureSheet(fw, fh, frames, rows) {
  const w = fw * frames, h = fh * rows;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const fxp = x % fw, fyp = y % fh;
      const inside = fxp > 4 && fxp < fw - 4 && fyp > 2 && fyp < fh - 1;
      const o = y * (w * 4 + 1) + 1 + x * 4;
      if (inside) { raw[o] = 255; raw[o + 1] = 0; raw[o + 2] = 255; raw[o + 3] = 255; } // magenta body
      if (inside && fyp < 10 && Math.floor(y / fh) % 2 === 0) { raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255; } // marker
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
