import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSafeRelativeImagePath, parseSpriteManifest } from '../src/sprites/manifest.ts';
import { loadPrivateSprites, type LoaderDeps, type LoadedImage } from '../src/sprites/loader.ts';
import { BASE_CREDITS, buildCredits, spriteStatusText } from '../src/sprites/credits.ts';
import { directionRow, frameIndex, frameUv, sheetFits } from '../src/sprites/spriteMath.ts';
import { chooseUpgrade, createWorld, step } from '../src/sim/world.ts';

const credit = { title: 'Test Hero', authors: ['Fixture Artist'], source: 'generated test fixture', license: 'CC0-1.0' };
const entry = (over: Record<string, unknown> = {}) => ({ image: 'hero/walk.png', frameWidth: 32, frameHeight: 40, frames: 4, directions: 8, fps: 8, height: 1.8, credit, ...over });

function fakeDeps(opts: { script?: boolean | 'throw'; manifest?: unknown; images?: Record<string, LoadedImage | 'missing'> }): LoaderDeps & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async loadScript(url) {
      requested.push(url);
      if (opts.script === 'throw') throw new Error('boom');
      return opts.script ?? false;
    },
    readManifest: () => opts.manifest,
    async loadImage(url) {
      requested.push(url);
      const name = url.replace('./private-sprites/', '');
      const img = opts.images?.[name];
      if (!img || img === 'missing') throw new Error(`image not found (${url})`);
      return img;
    },
  };
}

// ---------- manifest validation ----------
test('valid manifest entry is accepted with its credit', () => {
  const r = parseSpriteManifest({ version: 1, sprites: { player: entry() } });
  assert.deepEqual(r.problems, []);
  assert.equal(r.specs.length, 1);
  assert.equal(r.specs[0]!.role, 'player');
  assert.deepEqual(r.specs[0]!.credit.authors, ['Fixture Artist']);
});

test('invalid metadata: bad shapes are rejected per entry, never thrown', () => {
  for (const bad of [null, 42, 'x', [], { version: 2, sprites: {} }, { version: 1 }, { version: 1, sprites: [] }]) {
    const r = parseSpriteManifest(bad);
    assert.equal(r.specs.length, 0);
    assert.ok(r.problems.length > 0);
  }
  const r = parseSpriteManifest({
    version: 1,
    sprites: {
      player: entry({ frameWidth: 0 }),
      chaser: entry({ directions: 4 }),
      brute: entry({ fps: 'fast' }),
      dragon: entry(),
    },
  });
  assert.equal(r.specs.length, 0);
  assert.equal(r.problems.length, 4);
  assert.ok(r.problems.some((p) => p.startsWith('dragon: unknown role')));
});

test('unsafe image paths are rejected', () => {
  for (const p of ['../secret.png', '/abs.png', 'https://evil.example/x.png', 'a//b.png', 'a\\\\b.png', 'x.svg', 'x.js', 'ok/../x.png', 'ok/./x.png', '']) {
    assert.equal(isSafeRelativeImagePath(p), false, p);
  }
  assert.equal(isSafeRelativeImagePath('pmd/0025/Walk-Anim.png'), true);
  const r = parseSpriteManifest({ version: 1, sprites: { player: entry({ image: 'https://cdn.example/a.png' }) } });
  assert.equal(r.specs.length, 0);
});

test('sprites without complete credit are not used (no unattributed art)', () => {
  const cases = [
    entry({ credit: undefined }),
    entry({ credit: { ...credit, authors: [] } }),
    entry({ credit: { ...credit, authors: ['ok', ''] } }),
    entry({ credit: { ...credit, license: '' } }),
    entry({ credit: { ...credit, source: undefined } }),
    entry({ credit: { ...credit, licenseUrl: 'http://insecure.example' } }),
  ];
  for (const c of cases) {
    const r = parseSpriteManifest({ version: 1, sprites: { player: c } });
    assert.equal(r.specs.length, 0, JSON.stringify(c.credit));
    assert.match(r.problems[0]!, /credit/);
  }
});

// ---------- loader ----------
test('missing sprites.js -> status none, placeholders, no images requested', async () => {
  const deps = fakeDeps({ script: false });
  const r = await loadPrivateSprites(deps);
  assert.equal(r.status, 'none');
  assert.equal(r.sprites.size, 0);
  assert.deepEqual(deps.requested, ['./private-sprites/sprites.js']);
});

test('script that throws or never defines the manifest falls back safely', async () => {
  assert.equal((await loadPrivateSprites(fakeDeps({ script: 'throw' }))).status, 'none');
  const r = await loadPrivateSprites(fakeDeps({ script: true, manifest: undefined }));
  assert.equal(r.status, 'failed');
  assert.equal(r.sprites.size, 0);
  const t = await loadPrivateSprites({ loadScript: () => new Promise(() => {}), readManifest: () => undefined, loadImage: () => new Promise(() => {}) }, './private-sprites/', 20);
  assert.equal(t.status, 'none', 'hung script times out');
});

test('optional loading: good sprite loads, missing/undersized images fall back individually', async () => {
  const manifest = {
    version: 1,
    sprites: {
      player: entry(),
      chaser: entry({ image: 'gone.png' }),
      brute: entry({ image: 'tiny.png' }),
    },
  };
  const r = await loadPrivateSprites(
    fakeDeps({ script: true, manifest, images: { 'hero/walk.png': { width: 128, height: 320, image: 'IMG' }, 'tiny.png': { width: 64, height: 40, image: 'T' } } }),
  );
  assert.equal(r.status, 'partial');
  assert.deepEqual([...r.sprites.keys()], ['player']);
  assert.equal(r.sprites.get('player')!.image, 'IMG');
  assert.ok(r.problems.some((p) => p.startsWith('chaser:')));
  assert.ok(r.problems.some((p) => p.startsWith('brute:') && /too small/.test(p)));
});

test('all sprites valid -> loaded; all invalid -> failed', async () => {
  const ok = await loadPrivateSprites(fakeDeps({ script: true, manifest: { version: 1, sprites: { player: entry() } }, images: { 'hero/walk.png': { width: 128, height: 320, image: 1 } } }));
  assert.equal(ok.status, 'loaded');
  const bad = await loadPrivateSprites(fakeDeps({ script: true, manifest: { version: 1, sprites: { player: entry({ image: 'nope.png' }) } }, images: {} }));
  assert.equal(bad.status, 'failed');
});

// ---------- credits ----------
test('credits: only base credits when nothing loaded', () => {
  const c = buildCredits({ sprites: new Map() });
  assert.deepEqual(c, BASE_CREDITS.map((x) => ({ heading: x.heading, lines: [...x.lines] })));
  assert.ok(!JSON.stringify(c).includes('Source:'));
});

test('credits list exactly the sprites that loaded, with their stated authors/source/license', async () => {
  const manifest = {
    version: 1,
    sprites: {
      player: entry({ credit: { title: 'Hero', authors: ['A One', 'B Two'], source: 'local folder', license: 'CC BY-NC 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/' } }),
      chaser: entry({ image: 'missing.png', credit: { ...credit, authors: ['Should Not Appear'] } }),
    },
  };
  const r = await loadPrivateSprites(fakeDeps({ script: true, manifest, images: { 'hero/walk.png': { width: 128, height: 320, image: 1 } } }));
  const text = JSON.stringify(buildCredits(r));
  assert.ok(text.includes('A One, B Two'));
  assert.ok(text.includes('License: CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/)'));
  assert.ok(!text.includes('Should Not Appear'), 'failed sprite is not credited');
  assert.match(spriteStatusText(r), /1 loaded/);
  assert.match(spriteStatusText(null), /checking/);
});

// ---------- sheet math ----------
test('direction rows follow PMD order and frames cycle', () => {
  assert.equal(directionRow(0, 1, 8), 0); // down
  assert.equal(directionRow(1, 1, 8), 1); // down-right
  assert.equal(directionRow(1, 0, 8), 2); // right
  assert.equal(directionRow(0, -1, 8), 4); // up
  assert.equal(directionRow(-1, 0, 8), 6); // left
  assert.equal(directionRow(-1, 1, 8), 7); // down-left
  assert.equal(directionRow(1, 0, 1), 0);
  assert.equal(directionRow(NaN, 0, 8), 0);
  assert.equal(frameIndex(0, 8, 4), 0);
  assert.equal(frameIndex(0.5, 8, 4), 0);
  assert.equal(frameIndex(0.13, 8, 4), 1);
  assert.equal(frameIndex(1, 0, 4), 0);
  const uv = frameUv(32, 40, 128, 320, 1, 0);
  assert.deepEqual(uv, { repeatX: 0.25, repeatY: 0.125, offsetX: 0.25, offsetY: 0.875 });
  assert.equal(sheetFits(128, 320, 32, 40, 4, 8), true);
  assert.equal(sheetFits(127, 320, 32, 40, 4, 8), false);
});

test('sprite support does not change gameplay outcomes (sim never reads asset state)', () => {
  const run = () => {
    const w = createWorld(99);
    for (let i = 0; i < 60 * 30; i++) {
      step(w, { x: Math.sin(i / 40), z: 0 }, 1 / 60);
      if (w.phase === 'levelup') chooseUpgrade(w, 0);
    }
    return { t: w.time, kills: w.stats.kills, hp: w.player.hp, lvl: w.player.level };
  };
  const before = run();
  // Loading/validating manifests in between must not perturb the deterministic simulation.
  parseSpriteManifest({ version: 1, sprites: { player: entry() } });
  assert.deepEqual(run(), before);
});

test('the committed template is safe: copied as-is it loads nothing (unfilled credit/frames)', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const ctx: { window: Record<string, unknown> } = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../private-sprites.example.js', import.meta.url), 'utf8'), ctx);
  const r = parseSpriteManifest(ctx.window.ARENA_PRIVATE_SPRITES);
  assert.equal(r.specs.length, 0);
  assert.ok(r.problems.length > 0);
});
