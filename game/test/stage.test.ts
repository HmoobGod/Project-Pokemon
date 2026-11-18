import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activatePortal,
  canActivatePortal,
  chooseUpgrade,
  createWorld,
  hitEnemy,
  quitRun,
  spawnEnemy,
  step,
  type MoveInput,
  type World,
} from '../src/sim/world.ts';
import { BOSS_SLAM, ENEMIES, PORTAL, SHORT_STAGES, STAGES } from '../src/sim/config.ts';
import { UPGRADES } from '../src/sim/upgrades.ts';

const DT = 1 / 60;
const still = { x: 0, z: 0 };

function quiet(stages = STAGES): World {
  const w = createWorld(5, { stages });
  w.spawnTimer = 1e9;
  return w;
}

function killNormals(w: World, n: number): void {
  for (let i = 0; i < n; i++) hitEnemy(w, spawnEnemy(w, 'chaser', { x: 10, z: 10 }), 9999);
}

function boss(w: World) {
  return w.enemies.find((e) => e.id === w.stage.bossId);
}

function walkTo(w: World, target: { x: number; z: number }, maxSeconds = 20): void {
  for (let i = 0; i < maxSeconds * 60 && w.phase === 'playing'; i++) {
    const dx = target.x - w.player.pos.x;
    const dz = target.z - w.player.pos.z;
    if (Math.hypot(dx, dz) < 0.5) break;
    step(w, { x: dx, z: dz }, DT);
  }
}

/** Defeat the stage's boss by real hits and stand in the open portal. */
function clearStageToPortal(w: World): void {
  killNormals(w, w.stage.killQuota - w.stage.kills);
  const b = boss(w)!;
  hitEnemy(w, b, b.hp);
  walkTo(w, w.stage.portal!);
}

test('normal rules define 2 stages; stage 1 starts with a KO objective, no boss, no portal', () => {
  const w = createWorld(1);
  assert.equal(w.stage.count, STAGES.length);
  assert.equal(w.stage.count, 2);
  assert.equal(w.stage.state, 'objective');
  assert.equal(w.stage.bossId, null);
  assert.equal(w.stage.portal, null);
  assert.equal(w.result, null);
});

test('time alone never advances the stage: no KOs -> no boss, no portal', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  for (let i = 0; i < 60 * 300; i++) step(w, still, DT);
  assert.ok(w.time > 299);
  assert.equal(w.stage.state, 'objective');
  assert.equal(w.stage.kills, 0);
  assert.equal(w.enemies.filter((e) => e.kind === 'boss').length, 0);
});

test('KO quota counts only real kills; the boss spawns exactly when it is met', () => {
  const w = quiet();
  const quota = w.stage.killQuota;
  const e = spawnEnemy(w, 'chaser', { x: 5, z: 5 });
  hitEnemy(w, e, 1); // damaged, not killed
  assert.equal(w.stage.kills, 0);
  killNormals(w, quota - 1);
  assert.equal(w.stage.state, 'objective');
  assert.equal(boss(w), undefined);
  hitEnemy(w, e, 9999);
  assert.equal(w.stage.state, 'boss');
  const b = boss(w)!;
  assert.ok(b, 'boss spawned');
  assert.equal(b.maxHp, STAGES[0]!.bossHp);
  assert.ok(w.events.some((ev) => ev.type === 'bossSpawned'));
  killNormals(w, 10);
  assert.equal(w.enemies.filter((x) => x.kind === 'boss').length, 1, 'only one boss per stage');
});

test('boss fights back: chases, telegraphed slam damages the player, stepping out dodges', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  killNormals(w, w.stage.killQuota);
  const b = boss(w)!;
  b.pos = { x: 4, z: 0 };
  b.slamTimer = 0;
  step(w, still, DT);
  assert.equal(b.ai, 'slam');
  assert.ok(w.events.some((e) => e.type === 'bossSlamWindup'));
  for (let i = 0; i < 60 * BOSS_SLAM.windup + 2; i++) step(w, still, DT);
  assert.equal(w.player.hp, 100 - BOSS_SLAM.damage, 'slam hit');

  const d = quiet();
  d.player.attackTimer = 1e9;
  killNormals(d, d.stage.killQuota);
  const b2 = boss(d)!;
  b2.pos = { x: 4, z: 0 };
  b2.slamTimer = 0;
  step(d, still, DT);
  for (let i = 0; i < 60 * BOSS_SLAM.windup + 2; i++) step(d, { x: -1, z: 0 }, DT);
  assert.equal(d.player.hp, 100, 'dodged by leaving the ring');
  assert.ok(d.events.length >= 0);
});

test('boss takes real damage from player projectiles', () => {
  const w = quiet();
  killNormals(w, w.stage.killQuota);
  const b = boss(w)!;
  b.pos = { x: 6, z: 0 };
  b.slamTimer = 99;
  for (let i = 0; i < 60 * 2; i++) step(w, still, DT);
  assert.ok(b.hp < b.maxHp, `boss hp ${b.hp}/${b.maxHp}`);
});

test('boss defeat opens a portal but is NOT victory; the run keeps going', () => {
  const w = quiet();
  killNormals(w, w.stage.killQuota);
  const b = boss(w)!;
  hitEnemy(w, b, b.hp);
  assert.equal(w.stats.bossesDefeated, 1);
  assert.equal(w.stage.state, 'portal');
  assert.ok(w.stage.portal);
  assert.equal(w.phase, 'playing');
  assert.equal(w.result, null);
  const pd = Math.hypot(w.stage.portal!.x - w.player.pos.x, w.stage.portal!.z - w.player.pos.z);
  assert.ok(pd >= PORTAL.minDistanceFromPlayer, `portal placed ${pd.toFixed(1)} away — must be walked to`);
  assert.equal(canActivatePortal(w), false, 'not in range yet');
  assert.equal(activatePortal(w), false);
  assert.equal(w.stage.index, 0);
});

test('portal cannot be activated before it exists, from outside its range, or while paused for level-up', () => {
  const w = quiet();
  assert.equal(activatePortal(w), false, 'no portal during objective');
  killNormals(w, w.stage.killQuota);
  assert.equal(activatePortal(w), false, 'no portal during boss');
  hitEnemy(w, boss(w)!, 9999);
  w.player.pos = { x: w.stage.portal!.x + PORTAL.activateRange + 0.3, z: w.stage.portal!.z };
  assert.equal(activatePortal(w), false, 'just outside range');
  w.player.pos = { ...w.stage.portal! };
  w.phase = 'levelup';
  assert.equal(activatePortal(w), false, 'not during level-up');
  w.phase = 'playing';
  assert.equal(activatePortal(w), true);
});

test('stage portal advances to stage 2: fresh objective, field cleared, earned orbs collected, not victory', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  killNormals(w, 3); // leave some orbs on the ground
  const groundXp = w.orbs.reduce((s, o) => s + o.value, 0);
  clearStageToPortal(w);
  spawnEnemy(w, 'chaser', { x: -20, z: -20 });
  const xpBefore = w.stats.xpCollected;
  const orbsBefore = w.orbs.reduce((s, o) => s + o.value, 0);
  assert.ok(groundXp > 0 && orbsBefore > 0);
  assert.equal(activatePortal(w), true);
  assert.equal(w.stage.index, 1);
  assert.equal(w.stage.state, 'objective');
  assert.equal(w.stage.kills, 0);
  assert.equal(w.stage.killQuota, STAGES[1]!.killQuota);
  assert.equal(w.enemies.length, 0);
  assert.equal(w.orbs.length, 0);
  assert.equal(w.stats.xpCollected, xpBefore + orbsBefore, 'only already-earned XP is collected');
  assert.equal(w.stats.stagesCleared, 1);
  assert.notEqual(w.phase, 'victory');
  assert.equal(w.result, null);
  assert.ok(w.events.some((e) => e.type === 'stageAdvanced'));
  // stage 2 enemies are tougher
  if (w.phase === 'levelup') chooseUpgrade(w, 0);
  const e2 = spawnEnemy(w, 'chaser', { x: 9, z: 9 });
  assert.equal(e2.maxHp, Math.round(ENEMIES.chaser.maxHp * STAGES[1]!.enemyHpMul));
});

test('final portal activation is the only completed victory, and it ends the run', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  clearStageToPortal(w);
  activatePortal(w);
  if (w.phase === 'levelup') while (w.phase === 'levelup') chooseUpgrade(w, 0);
  w.spawnTimer = 1e9;
  clearStageToPortal(w);
  assert.equal(w.stage.isFinal, true);
  assert.equal(w.stats.bossesDefeated, 2);
  assert.equal(w.phase, 'playing', 'final boss defeated, still not victory');
  assert.equal(activatePortal(w), true);
  assert.equal(w.phase, 'victory');
  assert.deepEqual(
    { outcome: w.result!.outcome, stagesCleared: w.result!.stagesCleared, bosses: w.result!.bossesDefeated, stage: w.result!.stageReached },
    { outcome: 'victory', stagesCleared: 2, bosses: 2, stage: 2 },
  );
  const t = w.time;
  step(w, { x: 1, z: 0 }, DT);
  assert.equal(w.time, t, 'world frozen after victory');
  assert.equal(activatePortal(w), false);
  assert.equal(quitRun(w), false, 'cannot turn a victory into a quit');
  assert.equal(chooseUpgrade(w, 0), false);
});

test('defeat during the boss fight is a defeat (never victory), even with the portal pending', () => {
  const w = quiet();
  killNormals(w, w.stage.killQuota);
  w.player.hp = 1;
  const b = boss(w)!;
  b.pos = { x: 2.6, z: 0 };
  b.slamTimer = 99;
  for (let i = 0; i < 60 * 3 && w.phase === 'playing'; i++) step(w, still, DT);
  assert.equal(w.phase, 'defeated');
  assert.equal(w.result!.outcome, 'defeat');
  assert.equal(w.result!.stagesCleared, 0);
  assert.equal(activatePortal(w), false);
});

test('defeat after the portal opens is still defeat; quit is its own outcome', () => {
  const w = quiet();
  killNormals(w, w.stage.killQuota);
  hitEnemy(w, boss(w)!, 9999);
  w.player.hp = 1;
  w.player.attackTimer = 1e9;
  spawnEnemy(w, 'chaser', { x: 1.2, z: 0 });
  for (let i = 0; i < 60 && w.phase === 'playing'; i++) step(w, still, DT);
  assert.equal(w.result!.outcome, 'defeat');
  assert.equal(w.result!.bossesDefeated, 1);

  const q = quiet();
  killNormals(q, 4);
  assert.equal(quitRun(q), true);
  assert.equal(q.phase, 'quit');
  assert.equal(q.result!.outcome, 'quit');
  assert.equal(quitRun(q), false, 'cannot quit twice');
  assert.equal(activatePortal(q), false);
  const t = q.time;
  step(q, { x: 1, z: 0 }, DT);
  assert.equal(q.time, t);
});

test('quit during a level-up choice is allowed and ends the run as quit', () => {
  const w = quiet();
  killNormals(w, 1);
  w.orbs[0]!.value = 5;
  w.orbs[0]!.pos = { x: 0, z: 0 };
  step(w, still, DT);
  assert.equal(w.phase, 'levelup');
  assert.equal(quitRun(w), true);
  assert.equal(w.result!.outcome, 'quit');
  assert.equal(w.choices, null);
});

test('no economy: results contain no currency/reward fields', () => {
  const w = quiet();
  quitRun(w);
  assert.deepEqual(Object.keys(w.result!).sort(), ['bossesDefeated', 'kills', 'level', 'outcome', 'stageReached', 'stagesCleared', 'time']);
  assert.ok(!JSON.stringify(w).toLowerCase().includes('stardust'));
});

// ---------- a simple kiting bot proves the full loop is winnable through real play ----------
function botInput(w: World): MoveInput {
  const p = w.player.pos;
  let mx = 0;
  let mz = 0;
  let nearest = Infinity;
  for (const e of w.enemies) {
    const dx = p.x - e.pos.x;
    const dz = p.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 0.01;
    nearest = Math.min(nearest, d - e.radius);
    const danger = e.kind === 'boss' ? (e.ai === 'slam' ? 8 : 6) : 4.5;
    if (d < danger) {
      const wgt = (danger - d) / danger;
      mx += (dx / d) * wgt * (e.kind === 'boss' ? 3 : 1);
      mz += (dz / d) * wgt * (e.kind === 'boss' ? 3 : 1);
    }
  }
  const lim = 26;
  if (Math.abs(p.x) > lim) mx -= Math.sign(p.x) * 1.5;
  if (Math.abs(p.z) > lim) mz -= Math.sign(p.z) * 1.5;
  let goal: { x: number; z: number } | null = w.stage.portal;
  if (!goal && nearest > 3.5) {
    let best = Infinity;
    for (const o of w.orbs) {
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < best && d < 12) {
        best = d;
        goal = o.pos;
      }
    }
  }
  if (!goal && w.stage.state === 'boss') {
    const b = w.enemies.find((e) => e.id === w.stage.bossId);
    if (b && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) > 11) goal = b.pos; // stay in shooting range
  }
  if (goal) {
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const pull = w.stage.portal ? 1.6 : 0.8;
    mx += (dx / d) * pull;
    mz += (dz / d) * pull;
  }
  return { x: mx, z: mz };
}

const PREFERENCE = ['multishot', 'haste', 'power', 'vitality', 'pulse', 'swift', 'magnet'] as const;

function playWithBot(w: World, maxSeconds: number): void {
  for (let i = 0; i < maxSeconds * 60; i++) {
    if (w.phase === 'levelup') {
      const choices = w.choices!;
      let idx = 0;
      for (const pref of PREFERENCE) {
        const j = choices.indexOf(pref);
        if (j >= 0) {
          idx = j;
          break;
        }
      }
      chooseUpgrade(w, idx);
      continue;
    }
    if (w.phase !== 'playing') return;
    if (canActivatePortal(w)) {
      activatePortal(w);
      continue;
    }
    step(w, botInput(w), DT);
  }
}

test('full NORMAL rules are winnable by actual play (bot) on several seeds: stage -> boss -> portal -> stage 2 -> boss -> final portal', () => {
  let wins = 0;
  const outcomes: string[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = createWorld(seed);
    playWithBot(w, 15 * 60);
    outcomes.push(`${seed}:${w.result?.outcome ?? w.phase}@${w.time.toFixed(0)}s s${w.stage.index + 1}/${w.stage.state} b${w.stats.bossesDefeated}`);
    if (w.result?.outcome === 'victory') {
      wins++;
      assert.equal(w.stats.bossesDefeated, 2);
      assert.equal(w.stats.stagesCleared, 2);
      assert.ok(w.stats.kills >= STAGES[0]!.killQuota + STAGES[1]!.killQuota + 2);
    }
  }
  console.log('bot outcomes (normal):', outcomes.join(' | '));
  assert.ok(wins >= 3, `bot should win most seeds, got ${wins}/5: ${outcomes.join(' | ')}`);
});

test('SHORT preset keeps the same mechanics (quota -> boss -> portal x2) with smaller numbers', () => {
  const w = createWorld(11, { stages: SHORT_STAGES });
  playWithBot(w, 5 * 60);
  assert.equal(w.result?.outcome, 'victory', `short preset bot result ${w.phase} stage ${w.stage.index + 1} ${w.stage.state}`);
  assert.equal(w.stats.bossesDefeated, 2);
});

test('upgrade definitions are unchanged in number (no new reward-type upgrades)', () => {
  assert.equal(Object.keys(UPGRADES).length, 7);
});
