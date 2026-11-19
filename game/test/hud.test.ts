import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activatePortal, chooseBlessing, chooseUpgrade, createWorld, hitEnemy, spawnEnemy, step, wakeGuardian, type World } from '../src/sim/world.ts';
import { NORMAL_RULES, SHORT_RULES } from '../src/sim/config.ts';
import { blessingDots, formatClock, formatRunClock, timerPill, toastFor, upgradeSlots, zoneMedals } from '../src/ui/hud.ts';
import { parseSpriteManifest } from '../src/sprites/manifest.ts';
import { loadPrivateSprites, type LoaderDeps } from '../src/sprites/loader.ts';

const DT = 1 / 60;
const quiet = (rules = NORMAL_RULES): World => {
  const w = createWorld(3, { rules });
  w.spawnTimer = 1e9;
  w.player.attackTimer = 1e9;
  return w;
};

test('run clock and countdown formatting', () => {
  assert.equal(formatRunClock(0), '0:00.0');
  assert.equal(formatRunClock(1291.24), '21:31.2');
  assert.equal(formatRunClock(-5), '0:00.0');
  assert.equal(formatClock(600), '10:00');
  assert.equal(formatClock(18.2), '0:19');
  assert.equal(formatClock(-1), '0:00');
});

test('timer pill: zone countdown, then FINAL SWARM overtime, Shrine label', () => {
  const w = quiet(SHORT_RULES);
  assert.deepEqual(timerPill(w), { text: 'Zone 1/3 · Grove · 0:30', swarm: false });
  for (let i = 0; i < 60 * 31; i++) step(w, { x: 0, z: 0 }, DT);
  const p = timerPill(w);
  assert.equal(p.swarm, true);
  assert.match(p.text, /^Zone 1\/3 · FINAL SWARM \+0:0[12]$/);
});

test('zone medals: one per zone + shrine; cleared/current/locked follow real progress', () => {
  const w = quiet();
  assert.deepEqual(zoneMedals(w), ['current', 'locked', 'locked', 'locked']);
  w.player.pos = { ...w.map.altar!.pos };
  wakeGuardian(w);
  hitEnemy(w, w.enemies.find((e) => e.id === w.map.bossId)!, 1e9);
  assert.deepEqual(zoneMedals(w), ['current', 'locked', 'locked', 'locked'], 'guardian defeat alone does not clear the zone medal');
  w.player.pos = { ...w.map.portal! };
  activatePortal(w);
  assert.deepEqual(zoneMedals(w), ['cleared', 'current', 'locked', 'locked']);
});

test('upgrade slots: first-taken order, levels counted, MAX when no longer offered', () => {
  const w = quiet();
  w.player.upgradesTaken = ['power', 'multishot', 'power'];
  w.player.projectileCount = 5;
  const s = upgradeSlots(w);
  assert.deepEqual(s.map((x) => [x.id, x.level, x.max]), [['power', 2, false], ['multishot', 1, true]]);
  assert.deepEqual(upgradeSlots(quiet()), []);
});

test('blessing dots: three slots, filled by picked rarities in order', () => {
  const w = quiet();
  assert.deepEqual(blessingDots(w), [null, null, null]);
  w.player.pos = { ...w.map.unown!.pos };
  for (let i = 0; i < 60 * 7; i++) step(w, { x: 0, z: 0 }, DT);
  assert.equal(w.phase, 'blessing');
  const r = w.blessingChoices![0]!.rarity;
  chooseBlessing(w, 0);
  const d = blessingDots(w);
  assert.equal(d[0]!.rarity, r);
  assert.equal(d[1], null);
});

test('toasts only for notable events, with honest text', () => {
  const w = quiet();
  assert.equal(toastFor({ type: 'shot', count: 1 }, w), null);
  assert.equal(toastFor({ type: 'finalSwarm', zone: 1 }, w)!.tone, 'danger');
  assert.match(toastFor({ type: 'blessingChosen', rarity: 'epic', applied: false }, w)!.text, /Epic blessing chosen \(effect pending\)/);
  assert.match(toastFor({ type: 'runVictory', time: 1 }, w)!.text, /VICTORY/);
  hitEnemy(w, spawnEnemy(w, 'chaser', { x: 5, z: 5 }), 1e9);
  while (w.phase === 'levelup') chooseUpgrade(w, 0);
});

test('manifest: optional portrait + name accepted when safe, rejected (with problem) when not', () => {
  const credit = { title: 'T', authors: ['A'], source: 'S', license: 'CC BY-NC 4.0' };
  const base = { image: 'a/walk.png', frameWidth: 32, frameHeight: 40, frames: 4, directions: 8, credit };
  const ok = parseSpriteManifest({ version: 1, sprites: { player: { ...base, portrait: 'a/Normal.png', name: 'My Hero' } } });
  assert.equal(ok.specs[0]!.portrait, 'a/Normal.png');
  assert.equal(ok.specs[0]!.name, 'My Hero');
  const bad = parseSpriteManifest({ version: 1, sprites: { player: { ...base, portrait: '../x.png', name: 'x'.repeat(30) } } });
  assert.equal(bad.specs.length, 1, 'sprite still usable');
  assert.equal(bad.specs[0]!.portrait, undefined);
  assert.equal(bad.specs[0]!.name, undefined);
  assert.equal(bad.problems.length, 2);
});

test('loader: portrait loads with the sprite; a missing portrait keeps the sprite and falls back in the HUD', async () => {
  const credit = { title: 'T', authors: ['A'], source: 'S', license: 'CC BY-NC 4.0' };
  const manifest = { version: 1, sprites: { player: { image: 'w.png', frameWidth: 32, frameHeight: 40, frames: 4, directions: 8, credit, portrait: 'p.png' }, chaser: { image: 'w.png', frameWidth: 32, frameHeight: 40, frames: 4, directions: 8, credit, portrait: 'gone.png' } } };
  const deps: LoaderDeps = {
    loadScript: async () => true,
    readManifest: () => manifest,
    loadImage: async (url) => {
      if (url.endsWith('w.png')) return { width: 128, height: 320, image: 'W' };
      if (url.endsWith('p.png')) return { width: 40, height: 40, image: 'P' };
      throw new Error('missing');
    },
  };
  const r = await loadPrivateSprites(deps);
  assert.equal(r.sprites.get('player')!.portrait!.image, 'P');
  assert.ok(r.sprites.has('chaser'));
  assert.equal(r.sprites.get('chaser')!.portrait, undefined);
  assert.ok(r.problems.some((p) => p.startsWith('chaser: portrait')));
});
