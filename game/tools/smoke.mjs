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
  // HUD remake: hero card, zone panel, run clock, timer pill, floating HP, upgrade slot with level
  for (const sel of ['#hero-card', '#zone-panel', '#zone-clock', '#player-hp', '#minimap', '#upgrade-slots .slot']) if (!(await page.isVisible(sel))) fail(`HUD element not visible: ${sel}`);
  const runClockTxt = await page.textContent('#run-clock');
  if (!/^\d+:\d\d\.\d$/.test(runClockTxt)) fail(`run clock format wrong: ${runClockTxt}`);
  const slotTxt = await page.textContent('#upgrade-slots .slot');
  if (!slotTxt.includes('1') && !slotTxt.includes('MAX')) fail(`upgrade slot shows no level: ${slotTxt}`);
  if ((await page.textContent('#hero-level')) !== String(s.player.level)) fail('hero level badge out of sync');
  await page.screenshot({ path: join(out, '03b-hud.png') });
  note(`HUD: hero card (Lv ${s.player.level}), zone panel + run clock ${runClockTxt}, timer pill, floating HP, upgrade slot "${slotTxt.replace(/\s+/g, ' ').trim()}" visible`);

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
  note(`defeat result: outcome=${s.result.outcome} reached=${s.result.reached} guardians=${s.result.guardiansDefeated} (zone clock at defeat ${s.map.zoneTime.toFixed(1)}s, altar ${s.map.altar.state}, KOs never woke the guardian: ${s.boss === null})`);
  if (s.map.altar.state !== 'dormant' || s.boss !== null) fail('guardian woke without the altar action');
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

  // ---- Zone 1 -> Final Swarm -> altar -> Guardian -> portal -> Zone 2 -> Zone 3 -> Shrine Legendary, via real input ----
  // Uses ?preset=short (same mechanics, 30 s zone clocks, small Guardian/Legendary HP) so it fits a real-time CI run.
  {
    const sp = await context.newPage();
    sp.on('pageerror', (e) => errors.push(String(e)));
    const ssnap = () => sp.evaluate(() => window.__arenaSlice.snapshot());
    const held = new Set();
    async function setKeys(want) {
      for (const k of [...held]) if (!want.has(k)) { await sp.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await sp.keyboard.down(k); held.add(k); }
    }
    // release movement keys before slow (software-WebGL) screenshots so the bot never walks blind
    async function shot(name) { await setKeys(new Set()); await sp.screenshot({ path: join(out, name) }); }
    // Two scenarios on the same build: 'interactables' (minimap/Unown/Challenge/Final Swarm/pause in zone 1) and
    // 'loop' (wake each Guardian right away, wait at the open zone-1 portal through the Final Swarm, then zones 2-3,
    // Shrine, Legendary victory, exit portal). Splitting keeps the scripted bot out of long crowded Guardian fights.
    let mode = 'interactables';
    function steer(x) {
      const p = x.player; let mx = 0, mz = 0, nearest = Infinity;
      for (const [ex, ez, isBoss] of x.enemyPositions) {
        const dx = p.x - ex, dz = p.z - ez, d = Math.hypot(dx, dz) || 0.01;
        nearest = Math.min(nearest, d);
        // fight the boss from ~7.5 units (just outside its slam trigger) so auto-aim (nearest enemy) can hit it
        const danger = isBoss ? (x.boss && x.boss.ai === 'slam' ? 10 : 7.5) : 4.5;
        if (d < danger) { const w = ((danger - d) / danger) * (isBoss ? 3 : 1); mx += (dx / d) * w; mz += (dz / d) * w; }
      }
      if (Math.abs(p.x) > 25) mx -= Math.sign(p.x) * 1.5;
      if (Math.abs(p.z) > 25) mz -= Math.sign(p.z) * 1.5;
      const m = x.map;
      // zone 1: wait at the open portal until the Final Swarm has started (proves an open portal never auto-exits)
      let goal = m.portal && (m.index > 0 || m.finalSwarm) ? m.portal : null;
      if (mode === 'interactables') {
        if (x.unown && x.unown.state !== 'spent') goal = { x: x.unown.x, z: x.unown.z, strong: true };
        else if (x.challenge && x.challenge.state === 'idle') goal = { x: x.challenge.x, z: x.challenge.z, strong: true };
      }
      // zone 1: hold off the altar until the Final Swarm has started, to cover overtime combat
      if (!goal && mode === 'loop' && m.kind === 'zone' && m.state === 'explore' && m.altar) goal = { x: m.altar.x, z: m.altar.z };
      if (!goal && x.boss && x.boss.ai !== 'slam' && Math.hypot(x.boss.x - p.x, x.boss.z - p.z) > 8.5) goal = { x: x.boss.x, z: x.boss.z, boss: true };
      if (!goal && nearest > 4) { let best = 12; for (const [ox, oz] of x.orbPositions) { const d = Math.hypot(ox - p.x, oz - p.z); if (d < best) { best = d; goal = { x: ox, z: oz }; } } }

      if (goal) { const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz) || 1; const pull = goal.strong ? 3 : goal.boss ? 1.2 : m.portal || (m.altar && goal.x === m.altar.x) ? 1.7 : 0.8; mx += (dx / d) * pull; mz += (dz / d) * pull; }
      const keys = new Set();
      const len = Math.hypot(mx, mz);
      if (len > 0.15) { mx /= len; mz /= len; if (mx > 0.38) keys.add('KeyD'); if (mx < -0.38) keys.add('KeyA'); if (mz > 0.38) keys.add('KeyS'); if (mz < -0.38) keys.add('KeyW'); }
      return keys;
    }
    let done = null;
    const seen = new Set();
    for (let attempt = 1; attempt <= 10 && !done; attempt++) {
      if (mode === 'interactables' && ['blessing', 'chalwon0', 'swarm0', 'pauseclock'].every((k) => seen.has(k))) {
        mode = 'loop';
        note('  interactables scenario complete -> starting full-loop scenario');
      }
      await sp.goto(`${origin}/index.html?preset=short&seed=${4000 + attempt}`);
      await sp.waitForFunction(() => !!window.__arenaSlice);
      if (!(await sp.isVisible('#preset-tag'))) fail('short preset is not labelled on screen');
      await sp.click('#start-btn');
      if (attempt === 1) {
        await sp.waitForTimeout(500);
        const mini = await sp.evaluate(() => { const c = document.getElementById('minimap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return { w: c.width, painted: n }; });
        if (mini.painted < mini.w * mini.w * 0.3) fail(`minimap not drawn: ${JSON.stringify(mini)}`);
        await sp.keyboard.press('Tab');
        const m1 = await ssnap(); await sp.waitForTimeout(700); const m2 = await ssnap();
        if (!m2.paused || m1.map.zoneTime !== m2.map.zoneTime || !(await sp.isVisible('#fullmap'))) fail('Tab did not open the paused full map');
        const full = await sp.evaluate(() => { const c = document.getElementById('fullmap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return { w: c.width, painted: n }; });
        if (full.painted < full.w * full.w * 0.9) fail(`full map not drawn: ${JSON.stringify(full)}`);
        await shot('07b-full-map.png');
        await sp.keyboard.press('Tab');
        await sp.waitForFunction(() => !window.__arenaSlice.snapshot().paused);
        // touch path: tapping the minimap also opens the full map
        await sp.click('#minimap');
        if (!(await ssnap()).paused) fail('tapping the minimap did not open the full map');
        await sp.click('#resume-btn');
        note(`minimap drawn (${mini.painted}/${mini.w * mini.w} px painted); Tab and minimap tap open the full map in the pause menu (zone clock frozen); full map ${full.painted}/${full.w * full.w} px`);
      }
      let tStart = Date.now();
      let bossHpSeen = null;
      let pausedChecked = seen.has('pauseclock');
      for (;;) {
        const x = await ssnap();
        if (mode === 'interactables' && ['blessing', 'chalwon0', 'swarm0', 'pauseclock'].every((k) => seen.has(k))) { await setKeys(new Set()); break; }
        if (mode === 'loop' && x.map.kind === 'zone' && x.map.index === 0 && x.map.finalSwarm && x.map.portal && !seen.has('swarmportal')) {
          seen.add('swarmportal');
          note(`  Final Swarm reached with the zone-1 portal OPEN: still in zone 1 (no auto-exit), zone state=${x.map.state}`);
        }
        const tag = `${x.map.kind}${x.map.index + 1}:${x.map.state}`;
        if (!seen.has(`${attempt}:${tag}`)) { seen.add(`${attempt}:${tag}`); tStart = Date.now(); } // progress resets the stall timer
        if (!seen.has(tag)) {
          seen.add(tag);
          note(`  attempt ${attempt}: ${x.map.label} state=${x.map.state} zoneClock=${x.map.zoneTime.toFixed(1)}s swarm=${x.map.finalSwarm} run t=${x.time.toFixed(1)}s`);
          if (x.map.state === 'guardian' || x.map.state === 'legendary') await shot(`10-${x.map.kind}${x.map.index + 1}-${x.map.state}.png`);
          if (x.map.state === 'portal') await shot(`11-zone${x.map.index + 1}-portal.png`);
          if (x.map.kind === 'shrine' && x.map.state === 'intro') await shot('14-shrine-arrival.png');
        }
        if (x.map.kind === 'zone' && x.map.index > 0 && x.map.state === 'explore' && !seen.has(`fresh${x.map.index}`)) {
          seen.add(`fresh${x.map.index}`);
          if (x.map.zoneTime > 3 || x.map.finalSwarm || x.map.altar.state !== 'dormant') fail(`zone ${x.map.index + 1} did not start fresh: ${JSON.stringify(x.map)}`);
          note(`  zone ${x.map.index + 1} fresh map "${x.map.name}": clock ${x.map.zoneTime.toFixed(1)}s, altar dormant at (${x.map.altar.x},${x.map.altar.z}), level kept ${x.player.level}`);
        }
        if (x.map.finalSwarm && !seen.has(`swarm${x.map.index}`)) {
          seen.add(`swarm${x.map.index}`);
          if (x.phase !== 'playing' && x.phase !== 'levelup') fail('Final Swarm ended play');
          if (!(await sp.textContent('#zone-clock')).includes('FINAL SWARM')) fail('Final Swarm not shown on HUD');
          await shot('09-final-swarm.png');
          note(`  FINAL SWARM in ${x.map.label} at zone clock ${x.map.zoneTime.toFixed(1)}s — still playing, still in zone ${x.map.index + 1}, zone state=${x.map.state}${x.map.portal ? ' (portal open but NOT auto-entered)' : ''}`);
        }
        if (!pausedChecked && x.map.finalSwarm && x.phase === 'playing') {
          pausedChecked = true; seen.add('pauseclock');
          await setKeys(new Set());
          await sp.click('#pause');
          const a1 = await ssnap(); await sp.waitForTimeout(1000); const a2 = await ssnap();
          if (a1.map.zoneTime !== a2.map.zoneTime || !a2.paused) fail('zone clock moved while paused');
          await sp.click('#resume-btn');
          note(`  pause during Final Swarm: zone clock frozen at ${a2.map.zoneTime.toFixed(2)}s for 1 s, resumed`);
          continue;
        }
        if (x.boss) { if (bossHpSeen !== null && x.boss.hp < bossHpSeen && !seen.has(`dmg${x.map.kind}${x.map.index}`)) { seen.add(`dmg${x.map.kind}${x.map.index}`); note(`  ${x.boss.kind} in ${x.map.label} taking damage: ${x.boss.hp}/${x.boss.maxHp}`); } bossHpSeen = x.boss.hp; } else bossHpSeen = null;
        if (x.phase === 'blessing') {
          await setKeys(new Set());
          if (!(await sp.isVisible('#blessing'))) fail('blessing overlay not shown');
          const txt = await sp.textContent('#blessing');
          if (!txt.includes('no gameplay effect yet') || !txt.includes('pending evidence') || !txt.includes('placeholder draw')) fail('blessing UI is not labelled provisional');
          if (!seen.has('blessingshot')) { seen.add('blessingshot'); await shot('07c-unown-blessing.png'); }
          const cards = await sp.$$eval('#blessing-choices .choice', (els) => els.map((e) => e.dataset.rarity));
          const before = JSON.stringify(x.player);
          await sp.click('#blessing-choices .choice');
          const y = await ssnap();
          if (y.blessings.length !== 1 || y.unown.state !== 'spent' || JSON.stringify({ ...y.player, x: 0, z: 0 }) !== JSON.stringify({ ...JSON.parse(before), x: 0, z: 0 })) fail(`blessing pick wrong: ${JSON.stringify(y.blessings)} ${y.unown.state}`);
          seen.add('blessing');
          const rar = x.blessingChoices.map((o) => o.rarity);
          if (rar.length !== 3 || cards.length !== 3 || !rar.every((r) => ['common', 'rare', 'epic', 'legendary'].includes(r)) || JSON.stringify(cards) !== JSON.stringify(rar)) fail(`blessing offer wrong: ${JSON.stringify(rar)} cards ${JSON.stringify(cards)}`);
          if (y.blessings[0].applied !== false || y.blessings[0].rarity !== rar[0] || x.blessingChoices.some((o) => o.effect !== null || o.rarityEvidenced)) fail(`blessing pick wrong: ${JSON.stringify(y.blessings)}`);
          note(`  Unown circle filled at zone clock ${x.map.zoneTime.toFixed(1)}s -> 3 options offered, rarities ${JSON.stringify(rar)} (placeholder draw); picked option 1 = ${y.blessings[0].rarity}, effect pending evidence, applied=false, no stat change; altar spent`);
          continue;
        }
        if (mode === 'interactables' && x.challenge && x.challenge.state === 'active' && !seen.has(`chal${x.map.index}`)) {
          seen.add(`chal${x.map.index}`);
          const species = new Set(x.challengeEnemies);
          if (x.challengeEnemies.length !== x.challenge.total || species.size !== 1) fail(`challenge wave wrong: ${JSON.stringify(x.challengeEnemies)}`);
          await shot('07d-challenge-wave.png');
          note(`  Challenge started: ${x.challenge.total} x ${[...species][0]} (one species)`);
        }
        if (mode === 'interactables' && x.challenge && x.challenge.state === 'won' && !seen.has(`chalwon${x.map.index}`)) {
          seen.add(`chalwon${x.map.index}`);
          note(`  Challenge WON in ${x.map.label}: ${x.challenge.total}/${x.challenge.total} defeated by real combat; no item granted (Great Ball pending)`);
        }
        if (x.phase === 'levelup') { await setKeys(new Set()); await sp.keyboard.press('Digit1'); continue; }
        if (x.victory && !seen.has('victoryrec')) {
          seen.add('victoryrec');
          if (x.phase !== 'playing' || x.result !== null || !x.map.portal) fail(`after Legendary defeat expected playing + exit portal, got ${x.phase} ${JSON.stringify(x.map.portal)}`);
          await shot('13a-victory-exit-portal.png');
          note(`  VICTORY recorded once at Legendary defeat (run t=${x.victory.time.toFixed(1)}s); exit portal open, run still active until exit`);
        }
        if (x.phase === 'victory') { done = x; break; }
        if (x.phase === 'defeated') { await setKeys(new Set()); note(`  attempt ${attempt}: defeated in ${tag} (retrying with a new run)`); break; }
        if (x.map.action && !(x.map.action === 'start-challenge' && (mode === 'loop' || x.map.index > 0)) && !(x.map.action === 'wake-guardian' && mode === 'interactables') && !(x.map.action === 'enter-portal' && x.map.index === 0 && !x.map.finalSwarm)) {
          await setKeys(new Set());
          const btn = await sp.getAttribute('#action-btn', 'data-action');
          if (!(await sp.isVisible('#action-btn')) || btn !== x.map.action) fail(`action button missing/wrong: ${btn} vs ${x.map.action}`);
          if (x.map.action === 'wake-guardian' && !seen.has(`altarshot${x.map.index}`)) { seen.add(`altarshot${x.map.index}`); await shot(`08-zone${x.map.index + 1}-altar-button.png`); }
          if (x.map.action === 'enter-portal' && x.map.index === 2) await shot('12-portal-to-shrine-button.png');
          if (x.map.action === 'exit-stage') { await shot('13b-exit-stage-button.png'); seen.add('exitclick'); }
          if (x.map.action === 'start-challenge' && !seen.has('chalbtn')) { seen.add('chalbtn'); await shot('07c2-challenge-button.png'); }
          const act = x.map.action;
          await sp.click('#action-btn'); // the explicit action
          if (act === 'wake-guardian' && !seen.has('toast')) {
            const toasts = await sp.$$eval('#toasts .toast', (els) => els.map((e) => e.textContent));
            if (!toasts.some((t) => t.includes('Guardian awakens'))) fail(`no Guardian toast: ${JSON.stringify(toasts)}`);
            seen.add('toast');
            note(`  toast shown: ${JSON.stringify(toasts)}`);
          }
          continue;
        }
        await setKeys(steer(x));
        // a scripted bot can stalemate a crowded Guardian fight: give up on this attempt and start a fresh run
        if (Date.now() - tStart > 150000) { await setKeys(new Set()); note(`  attempt ${attempt}: no progress for 150 s in ${tag}, retrying with a new run`); break; }
        await sp.waitForTimeout(30);
      }
    }
    await setKeys(new Set());
    if (!done) fail(`bot did not win and exit within 10 short-preset runs (mode=${mode})`);
    if (!seen.has('swarmportal')) fail('Final Swarm with an open portal never observed');
    for (const t of ['zone1:explore', 'zone1:guardian', 'zone1:portal', 'zone2:explore', 'zone2:guardian', 'zone2:portal', 'zone3:explore', 'zone3:guardian', 'zone3:portal', 'shrine4:intro', 'shrine4:legendary', 'shrine4:cleared']) if (!seen.has(t)) fail(`state ${t} never observed`);
    if (!seen.has('swarm0')) fail('Final Swarm never observed');
    if (!seen.has('blessing')) fail('Unown blessing never observed');
    if (!seen.has('chal0') || !seen.has('chalwon0')) fail('Challenge wave start/win not observed in zone 1');
    for (const k of ['dmgzone0', 'dmgzone1', 'dmgzone2', 'dmgshrine3']) if (!seen.has(k)) fail(`boss damage not observed: ${k}`);
    const title = await sp.textContent('#result-title');
    const summary = await sp.textContent('#result-summary');
    if (title !== 'Victory!' || done.result.outcome !== 'victory' || !done.result.exitedViaPortal || !seen.has('exitclick') || !summary.includes('left through the exit portal')) fail(`victory/exit result wrong: ${title} ${JSON.stringify(done.result)}`);
    if (done.result.victoryTime === null || done.result.victoryTime > done.result.time || !seen.has('victoryrec')) fail('victory not recorded at the Legendary defeat');
    if (done.result.zonesCleared !== 3 || done.result.guardiansDefeated !== 3 || !done.result.legendaryDefeated) fail(`counts wrong: ${JSON.stringify(done.result)}`);
    await shot('13-victory-result.png');
    note(`VICTORY: Legendary defeated at ${done.result.victoryTime.toFixed(1)}s (single record) -> exit portal taken at ${done.result.time.toFixed(1)}s -> outcome=victory exitedViaPortal=true zones=${done.result.zonesCleared} guardians=${done.result.guardiansDefeated} blessings=${JSON.stringify(done.result.blessings)} kills=${done.result.kills}`);
    await sp.keyboard.press('KeyR');
    const r = await sp.waitForFunction(() => { const x = window.__arenaSlice.snapshot(); return x.phase === 'playing' && x.map.kind === 'zone' && x.map.index === 0 && x.map.state === 'explore' && x.result === null ? x : null; }, null, { timeout: 3000 });
    await r.dispose();
    note('restart after victory -> fresh Zone 1');
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
    writeFileSync(join(fx, 'private-sprites', 'face.png'), makeFixtureSheet(40, 40, 1, 1));
    const fixtureCredit = { title: 'Smoke fixture sheet', authors: ['Smoke Test Generator'], source: 'generated by tools/smoke.mjs at test time', license: 'CC0-1.0' };
    const writeManifest = (sprites) => writeFileSync(join(fx, 'private-sprites', 'sprites.js'), `window.ARENA_PRIVATE_SPRITES = ${JSON.stringify({ version: 1, sprites })};\n`);
    const ent = (o = {}) => ({ image: 'sheet.png', frameWidth: 32, frameHeight: 40, frames: 4, directions: 8, fps: 8, height: 1.8, credit: fixtureCredit, ...o });
    writeManifest({ player: ent({ portrait: 'face.png', name: 'Fixture Hero' }), chaser: ent(), brute: ent({ image: 'missing.png', credit: { ...fixtureCredit, authors: ['Must Not Be Credited'] } }) });
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
      const portraitOk = await fp.evaluate(() => { const i = document.getElementById('hero-portrait'); return !i.classList.contains('hidden') && i.naturalWidth === 40 && document.getElementById('hero-placeholder').classList.contains('hidden'); });
      if (!portraitOk || (await fp.textContent('#hero-name')) !== 'Fixture Hero') fail('HUD portrait/name from private sprite not shown');
      note('HUD portrait + name loaded from the private (fixture) sprite settings');
      await fp.click('#credits-btn');
      const ctext = await fp.textContent('#credits-list');
      if (!ctext.includes('Smoke Test Generator') || !ctext.includes('License: CC0-1.0')) fail('loaded sprite not credited');
      if (ctext.includes('Must Not Be Credited')) fail('failed sprite was credited');
      await fp.screenshot({ path: join(out, '08-credits-fixture.png') });
      note('credits list exactly the loaded fixture sprites');
      await fp.click('#credits-close');
      await fp.click('#start-btn');
      // hold until moved (slow CI software rendering can drop below 10 fps, which slows game time)
      await fp.keyboard.down('KeyD');
      for (let i = 0; i < 40 && (await fsnap()).player.x <= 2; i++) await fp.waitForTimeout(100);
      await fp.keyboard.up('KeyD');
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
      await bp.keyboard.down('KeyA');
      for (let i = 0; i < 40 && (await bp.evaluate(() => window.__arenaSlice.snapshot().player.x)) >= -2; i++) await bp.waitForTimeout(100);
      await bp.keyboard.up('KeyA');
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
