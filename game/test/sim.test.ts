import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseUpgrade, createWorld, hitEnemy, spawnEnemy, step, type World } from '../src/sim/world.ts';
import { ARENA_HALF_SIZE, ENEMIES, PLAYER_BASE, SPAWN, xpToNext } from '../src/sim/config.ts';

const DT = 1 / 60;
const still = { x: 0, z: 0 };

/** World with spawning pushed far into the future so tests control every enemy. */
function quietWorld(seed = 1): World {
  const w = createWorld(seed);
  w.spawnTimer = 1e9;
  return w;
}

function run(w: World, seconds: number, input = still): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) step(w, input, DT);
}

test('player moves with input at its speed and diagonal input is not faster', () => {
  const w = quietWorld();
  run(w, 1, { x: 1, z: 0 });
  assert.ok(Math.abs(w.player.pos.x - PLAYER_BASE.speed) < 0.05, `x=${w.player.pos.x}`);
  const d = quietWorld();
  run(d, 1, { x: 1, z: 1 });
  assert.ok(Math.hypot(d.player.pos.x, d.player.pos.z) <= PLAYER_BASE.speed + 0.05);
});

test('player cannot leave the arena', () => {
  const w = quietWorld();
  run(w, 20, { x: 1, z: -1 });
  assert.ok(w.player.pos.x <= ARENA_HALF_SIZE - w.player.radius + 1e-9);
  assert.ok(w.player.pos.z >= -ARENA_HALF_SIZE + w.player.radius - 1e-9);
});

test('enemies spawn over time and chase the player', () => {
  const w = createWorld(7);
  run(w, SPAWN.initialDelay + 0.05);
  assert.ok(w.enemies.length >= 1, 'an enemy spawned');
  const q = quietWorld();
  const e = spawnEnemy(q, 'chaser', { x: 10, z: 0 });
  run(q, 1);
  assert.ok(e.pos.x < 10 - ENEMIES.chaser.speed * 0.9, `enemy approached: ${e.pos.x}`);
});

test('enemy attack: wind-up then strike reduces HP; i-frames block immediate repeat', () => {
  const w = quietWorld();
  w.player.attackTimer = 1e9; // keep the player from killing it during this test
  spawnEnemy(w, 'chaser', { x: 1.2, z: 0 });
  run(w, 0.1);
  assert.equal(w.enemies[0]!.ai, 'windup');
  assert.equal(w.player.hp, PLAYER_BASE.maxHp, 'no damage during wind-up');
  run(w, ENEMIES.chaser.windup);
  assert.equal(w.player.hp, PLAYER_BASE.maxHp - ENEMIES.chaser.damage);
  assert.ok(w.player.invulnTimer > 0);
  assert.equal(w.stats.damageTaken, ENEMIES.chaser.damage);
});

test('stepping away during the wind-up dodges the strike', () => {
  const w = quietWorld();
  w.player.attackTimer = 1e9;
  spawnEnemy(w, 'chaser', { x: 1.2, z: 0 });
  run(w, 0.05);
  assert.equal(w.enemies[0]!.ai, 'windup');
  run(w, 0.5, { x: -1, z: 0 });
  assert.equal(w.player.hp, PLAYER_BASE.maxHp);
});

test('player auto-attacks: projectiles hit, reduce enemy HP and a kill drops an XP orb', () => {
  const w = quietWorld();
  const e = spawnEnemy(w, 'chaser', { x: 8, z: 0 });
  run(w, 0.8);
  assert.ok(e.hp < ENEMIES.chaser.maxHp, `enemy damaged: hp=${e.hp}`);
  run(w, 2);
  assert.equal(w.enemies.length, 0, 'enemy killed');
  assert.equal(w.stats.kills, 1);
  assert.ok(w.orbs.length === 1 || w.stats.xpCollected === 1, 'xp orb dropped (or already collected)');
});

test('no target in range means no projectiles (no free damage)', () => {
  const w = quietWorld();
  run(w, 3);
  assert.equal(w.projectiles.length, 0);
  assert.equal(w.stats.damageDealt, 0);
  assert.equal(w.player.xp, 0);
});

test('XP is only earned by collecting orbs from kills, and fills to a level-up choice', () => {
  const w = quietWorld();
  const need = xpToNext(1);
  for (let i = 0; i < need; i++) {
    const e = spawnEnemy(w, 'chaser', { x: 5, z: 5 });
    hitEnemy(w, e, 999);
  }
  assert.equal(w.player.xp, 0, 'orbs not yet collected');
  assert.equal(w.orbs.length, need);
  for (const o of w.orbs) o.pos = { x: 0.2, z: 0 };
  step(w, still, DT);
  assert.equal(w.phase, 'levelup');
  assert.equal(w.player.level, 2);
  assert.ok(w.choices && w.choices.length === 3);
  assert.equal(new Set(w.choices).size, 3, 'choices are distinct');
});

test('simulation is paused during level-up and resumes after a valid choice', () => {
  const w = quietWorld();
  const e = spawnEnemy(w, 'chaser', { x: 3, z: 0 });
  hitEnemy(w, e, 999);
  w.orbs[0]!.value = xpToNext(1);
  w.orbs[0]!.pos = { x: 0, z: 0 };
  step(w, still, DT);
  assert.equal(w.phase, 'levelup');
  const t = w.time;
  run(w, 1, { x: 1, z: 0 });
  assert.equal(w.time, t, 'time frozen');
  assert.equal(w.player.pos.x, 0, 'player frozen');
  assert.equal(chooseUpgrade(w, 5), false, 'out-of-range pick rejected');
  assert.equal(chooseUpgrade(w, -1), false);
  const before = { ...w.player };
  const picked = w.choices![0]!;
  assert.equal(chooseUpgrade(w, 0), true);
  assert.equal(w.phase, 'playing');
  assert.deepEqual(w.player.upgradesTaken, [picked]);
  assert.notDeepEqual({ ...w.player, upgradesTaken: [] }, { ...before, upgradesTaken: [] }, 'a stat changed');
  assert.equal(chooseUpgrade(w, 0), false, 'cannot pick twice');
});

test('multiple level-ups queue one choice at a time', () => {
  const w = quietWorld();
  const e = spawnEnemy(w, 'chaser', { x: 3, z: 0 });
  hitEnemy(w, e, 999);
  w.orbs[0]!.value = xpToNext(1) + xpToNext(2);
  w.orbs[0]!.pos = { x: 0, z: 0 };
  step(w, still, DT);
  assert.equal(w.player.level, 3);
  assert.equal(w.pendingLevelUps, 2);
  chooseUpgrade(w, 0);
  assert.equal(w.phase, 'levelup', 'second choice offered');
  chooseUpgrade(w, 0);
  assert.equal(w.phase, 'playing');
  assert.equal(w.player.upgradesTaken.length, 2);
});

test('HP reaching zero ends the run; the world stops updating', () => {
  const w = quietWorld();
  w.player.attackTimer = 1e9;
  w.player.hp = ENEMIES.chaser.damage;
  spawnEnemy(w, 'chaser', { x: 1.2, z: 0 });
  run(w, 1);
  assert.equal(w.player.hp, 0);
  assert.equal(w.phase, 'defeated');
  const t = w.time;
  run(w, 1, { x: 1, z: 0 });
  assert.equal(w.time, t);
  assert.equal(chooseUpgrade(w, 0), false);
});

test('restart = fresh world: full HP, level 1, nothing carried over', () => {
  const w = createWorld(3);
  run(w, 5);
  const fresh = createWorld(4);
  assert.equal(fresh.player.hp, PLAYER_BASE.maxHp);
  assert.equal(fresh.player.level, 1);
  assert.equal(fresh.enemies.length, 0);
  assert.equal(fresh.stats.kills, 0);
});

test('same seed + same inputs = identical run (deterministic)', () => {
  const a = createWorld(42);
  const b = createWorld(42);
  for (let i = 0; i < 60 * 40; i++) {
    const input = { x: Math.sin(i / 50), z: Math.cos(i / 70) };
    step(a, input, DT);
    step(b, input, DT);
    if (a.phase === 'levelup') chooseUpgrade(a, 0);
    if (b.phase === 'levelup') chooseUpgrade(b, 0);
  }
  assert.equal(a.time, b.time);
  assert.deepEqual(a.player, b.player);
  assert.equal(a.stats.kills, b.stats.kills);
  assert.equal(a.enemies.length, b.enemies.length);
});

test('a real unattended run: kills happen, XP comes only from kills, run eventually ends in defeat', () => {
  const w = createWorld(123);
  let guard = 0;
  while (w.phase !== 'defeated' && guard < 60 * 60 * 10) {
    step(w, still, DT);
    if (w.phase === 'levelup') chooseUpgrade(w, 0);
    guard++;
  }
  assert.equal(w.phase, 'defeated', 'standing still eventually loses');
  assert.ok(w.stats.kills > 0);
  assert.ok(w.stats.xpCollected <= w.stats.kills * ENEMIES.brute.xp);
  assert.ok(w.time > 10, `survived ${w.time.toFixed(1)}s`);
});

test('bad dt values are ignored or clamped', () => {
  const w = quietWorld();
  step(w, still, NaN);
  step(w, still, -1);
  assert.equal(w.time, 0);
  step(w, still, 5);
  assert.ok(w.time <= 1 / 20 + 1e-12);
  step(w, { x: NaN, z: 1 }, DT);
  assert.ok(Number.isFinite(w.player.pos.x) && Number.isFinite(w.player.pos.z));
});
