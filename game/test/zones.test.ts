import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activatePortal,
  availableAction,
  chooseUpgrade,
  createWorld,
  hitEnemy,
  performAction,
  quitRun,
  spawnEnemy,
  step,
  wakeGuardian,
  type MoveInput,
  type World,
} from '../src/sim/world.ts';
import { ALTAR, BOSS_SLAM, ENEMIES, NORMAL_RULES, PORTAL, SHORT_RULES, ZONES } from '../src/sim/config.ts';

const DT = 1 / 60;
const still = { x: 0, z: 0 };

function quiet(rules = NORMAL_RULES): World {
  const w = createWorld(5, { rules });
  w.spawnTimer = 1e9;
  return w;
}

/** advance the zone clock in large exact steps without enemies (MAX_STEP clamps dt to 0.05). */
function advance(w: World, seconds: number): void {
  let left = seconds;
  while (left > 1e-9) {
    const d = Math.min(0.05, left);
    step(w, still, d);
    left -= d;
    w.spawnTimer = 1e9;
    w.enemies = [];
  }
}

function goTo(w: World, pos: { x: number; z: number }): void {
  w.player.pos = { x: pos.x, z: pos.z };
}

function guardian(w: World) {
  return w.enemies.find((e) => e.id === w.map.bossId);
}

/** wake + really kill the current zone's guardian, then stand in the portal */
function clearZone(w: World): void {
  goTo(w, w.map.altar!.pos);
  assert.equal(wakeGuardian(w), true);
  const g = guardian(w)!;
  hitEnemy(w, g, g.hp);
  goTo(w, w.map.portal!);
}

// ---------- structure ----------
test('normal run = 3 zones of 600 active seconds, each a distinct map, then the Shrine', () => {
  assert.equal(NORMAL_RULES.zones.length, 3);
  assert.equal(NORMAL_RULES.zoneSeconds, 600);
  const w = createWorld(1);
  assert.equal(w.map.kind, 'zone');
  assert.equal(w.map.index, 0);
  assert.equal(w.map.state, 'explore');
  assert.equal(w.map.altar!.state, 'dormant');
  assert.equal(w.map.portal, null);
  assert.equal(w.map.bossId, null);
  const keys = ZONES.map((z) => JSON.stringify([z.name, z.ground, z.altar, z.obstacles]));
  assert.equal(new Set(keys).size, 3, 'three different map contexts');
});

// ---------- zone clock / Final Swarm ----------
test('599.9 s: no Final Swarm; 600 s: Final Swarm starts and play simply continues (no exit, no transition)', () => {
  const w = quiet();
  advance(w, 599.9);
  assert.ok(Math.abs(w.map.zoneTime - 599.9) < 1e-6);
  assert.equal(w.map.finalSwarm, false);
  advance(w, 0.1);
  assert.equal(w.map.finalSwarm, true);
  assert.equal(w.stats.finalSwarmsReached, 1);
  assert.equal(w.phase, 'playing');
  assert.equal(w.map.index, 0);
  assert.equal(w.map.kind, 'zone');
  assert.equal(w.map.portal, null);
  assert.equal(w.result, null);
  advance(w, 300);
  assert.equal(w.phase, 'playing', 'still playing 5 minutes into overtime');
  assert.equal(w.map.index, 0, 'never moved on by itself');
  assert.equal(w.stats.finalSwarmsReached, 1, 'Final Swarm event fires once per zone');
});

test('the Final Swarm event is emitted exactly at the crossing step', () => {
  const w = quiet();
  advance(w, 599.95);
  step(w, still, 0.05);
  assert.ok(w.events.some((e) => e.type === 'finalSwarm' && e.zone === 1));
});

test('zone clock only moves during active play: not while choosing a level-up, not after the run ends', () => {
  const w = quiet();
  advance(w, 100);
  const e = spawnEnemy(w, 'chaser', { x: 3, z: 0 });
  hitEnemy(w, e, 9999);
  w.orbs[0]!.value = 50;
  w.orbs[0]!.pos = { x: 0, z: 0 };
  step(w, still, DT);
  assert.equal(w.phase, 'levelup');
  const t = w.map.zoneTime;
  for (let i = 0; i < 600; i++) step(w, still, DT);
  assert.equal(w.map.zoneTime, t, 'frozen during level-up');
  while (w.phase === 'levelup') chooseUpgrade(w, 0);
  advance(w, 1);
  assert.ok(Math.abs(w.map.zoneTime - (t + 1)) < 1e-6);
  quitRun(w);
  const t2 = w.map.zoneTime;
  step(w, still, DT);
  assert.equal(w.map.zoneTime, t2, 'frozen after quit');
});

test('Final Swarm makes newly spawned wild enemies much tougher, growing with overtime (placeholder values)', () => {
  const w = quiet();
  advance(w, 599);
  const before = spawnEnemy(w, 'chaser', { x: 10, z: 10 });
  advance(w, 1);
  const at = spawnEnemy(w, 'chaser', { x: 10, z: 10 });
  advance(w, 120);
  const later = spawnEnemy(w, 'chaser', { x: 10, z: 10 });
  assert.ok(at.maxHp >= before.maxHp * 1.9, `${before.maxHp} -> ${at.maxHp}`);
  assert.ok(later.maxHp > at.maxHp);
  assert.ok(at.damageMul > 1 && later.damageMul > at.damageMul);
});

test('combat continues in the Final Swarm: swarm enemies hit harder and can still be defeated', () => {
  const w = quiet();
  advance(w, 600);
  w.player.attackTimer = 1e9;
  const e = spawnEnemy(w, 'chaser', { x: 1.2, z: 0 });
  for (let i = 0; i < 60; i++) step(w, still, DT);
  assert.equal(w.player.hp, 100 - Math.round(ENEMIES.chaser.damage * e.damageMul));
  hitEnemy(w, e, 9999);
  assert.equal(w.enemies.includes(e), false);
  assert.ok(w.stats.kills >= 1);
});

test('defeat during the Final Swarm is a defeat', () => {
  const w = quiet();
  advance(w, 650);
  w.player.hp = 1;
  w.player.attackTimer = 1e9;
  spawnEnemy(w, 'chaser', { x: 1.2, z: 0 });
  for (let i = 0; i < 120 && w.phase === 'playing'; i++) step(w, still, DT);
  assert.equal(w.result?.outcome, 'defeat');
  assert.equal(w.result?.finalSwarmsReached, 1);
});

// ---------- guardian altar ----------
test('KOs alone never wake the Guardian (no KO-quota trigger)', () => {
  const w = quiet();
  for (let i = 0; i < 500; i++) hitEnemy(w, spawnEnemy(w, 'chaser', { x: 8, z: 8 }), 9999);
  while (w.phase === 'levelup') chooseUpgrade(w, 0);
  advance(w, 5);
  assert.equal(w.stats.kills, 500);
  assert.equal(w.map.state, 'explore');
  assert.equal(w.map.altar!.state, 'dormant');
  assert.equal(w.enemies.filter((e) => e.kind === 'boss').length, 0);
});

test('altar needs proximity + explicit action; it works only once (no infinite guardians)', () => {
  const w = quiet();
  assert.equal(availableAction(w), null, 'nothing in reach at spawn');
  assert.equal(wakeGuardian(w), false, 'far from altar');
  const a = w.map.altar!.pos;
  goTo(w, { x: a.x + ALTAR.activateRange + 0.2, z: a.z });
  assert.equal(wakeGuardian(w), false, 'just outside range');
  goTo(w, { x: a.x + ALTAR.activateRange - 0.2, z: a.z });
  assert.equal(availableAction(w), 'wake-guardian');
  assert.equal(performAction(w), 'wake-guardian');
  assert.equal(w.map.altar!.state, 'awakened');
  assert.equal(w.map.state, 'guardian');
  assert.ok(w.events.some((e) => e.type === 'guardianAwakened'));
  assert.equal(wakeGuardian(w), false, 'second press does nothing');
  assert.equal(performAction(w), null);
  assert.equal(w.enemies.filter((e) => e.kind === 'boss').length, 1);
  assert.equal(guardian(w)!.maxHp, ZONES[0]!.guardianHp);
});

test('the altar can be used whenever the player is ready: early, or during the Final Swarm', () => {
  const early = quiet();
  goTo(early, early.map.altar!.pos);
  assert.equal(wakeGuardian(early), true, 'right at the start');
  const late = quiet();
  advance(late, 700);
  goTo(late, late.map.altar!.pos);
  assert.equal(wakeGuardian(late), true, 'during the Final Swarm');
  assert.equal(late.map.finalSwarm, true);
});

test('no action while choosing a level-up or after the run ended', () => {
  const w = quiet();
  goTo(w, w.map.altar!.pos);
  w.phase = 'levelup';
  assert.equal(wakeGuardian(w), false);
  w.phase = 'playing';
  quitRun(w);
  assert.equal(wakeGuardian(w), false);
});

// ---------- guardian combat ----------
test('Guardian really fights: telegraphed slam damages the player; stepping out of the ring dodges', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  goTo(w, w.map.altar!.pos);
  wakeGuardian(w);
  const g = guardian(w)!;
  g.pos = { x: w.player.pos.x + 4, z: w.player.pos.z };
  g.slamTimer = 0;
  step(w, still, DT);
  assert.equal(g.ai, 'slam');
  for (let i = 0; i < 60 * BOSS_SLAM.windup + 2; i++) step(w, still, DT);
  assert.equal(w.player.hp, 100 - BOSS_SLAM.damage);

  const d = quiet();
  d.player.attackTimer = 1e9;
  goTo(d, d.map.altar!.pos);
  wakeGuardian(d);
  const g2 = guardian(d)!;
  g2.pos = { x: d.player.pos.x + 4, z: d.player.pos.z };
  g2.slamTimer = 0;
  step(d, still, DT);
  for (let i = 0; i < 60 * BOSS_SLAM.windup + 2; i++) step(d, { x: -1, z: 0 }, DT);
  assert.equal(d.player.hp, 100);
});

test('Guardian takes real projectile damage; only its HP-zero defeat opens the portal (at the altar)', () => {
  const w = quiet();
  goTo(w, w.map.altar!.pos);
  wakeGuardian(w);
  const g = guardian(w)!;
  g.slamTimer = 99;
  for (let i = 0; i < 120; i++) step(w, still, DT);
  assert.ok(g.hp < g.maxHp, `guardian hp ${g.hp}/${g.maxHp}`);
  assert.equal(w.map.portal, null, 'damaged is not defeated');
  hitEnemy(w, g, g.hp - 1);
  assert.equal(w.map.portal, null, '1 HP left: still no portal');
  hitEnemy(w, g, 1);
  assert.equal(w.map.state, 'portal');
  assert.deepEqual(w.map.portal, w.map.altar!.pos);
  assert.equal(w.map.altar!.state, 'spent');
  assert.equal(w.stats.guardiansDefeated, 1);
  assert.equal(w.stats.zonesCleared, 0, 'guardian defeat is not zone completion');
  assert.equal(w.phase, 'playing');
  assert.equal(w.result, null);
});

test('defeat while the Guardian is up is a defeat; the portal never opens', () => {
  const w = quiet();
  goTo(w, w.map.altar!.pos);
  wakeGuardian(w);
  w.player.hp = 1;
  w.player.attackTimer = 1e9;
  const g = guardian(w)!;
  g.pos = { x: w.player.pos.x + 2.6, z: w.player.pos.z };
  g.slamTimer = 99;
  for (let i = 0; i < 180 && w.phase === 'playing'; i++) step(w, still, DT);
  assert.equal(w.result?.outcome, 'defeat');
  assert.equal(w.map.portal, null);
});

// ---------- portal ----------
test('portal: blocked before the guardian dies, blocked out of range, accepted only by explicit action in range', () => {
  const w = quiet();
  goTo(w, w.map.altar!.pos);
  assert.equal(activatePortal(w), false, 'no portal yet (explore)');
  wakeGuardian(w);
  assert.equal(activatePortal(w), false, 'no portal yet (guardian alive)');
  hitEnemy(w, guardian(w)!, 9999);
  const p = w.map.portal!;
  goTo(w, { x: p.x + PORTAL.activateRange + 0.3, z: p.z });
  assert.equal(activatePortal(w), false, 'out of range');
  advance(w, 30);
  assert.equal(w.map.index, 0, 'standing around does not transfer you');
  while (w.phase === 'levelup') chooseUpgrade(w, 0);
  goTo(w, p);
  assert.equal(availableAction(w), 'enter-portal');
  assert.equal(activatePortal(w), true);
  assert.equal(w.map.index, 1);
});

test('each portal loads a fresh map context: new layout, clock reset, new dormant altar; run build kept', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  advance(w, 640); // into Final Swarm of zone 1
  w.player.level = 7;
  w.player.damage = 30;
  hitEnemy(w, spawnEnemy(w, 'chaser', { x: -20, z: -20 }), 9999); // leave an earned orb on the ground
  w.spawnTimer = 1e9;
  clearZone(w);
  const xpBefore = w.stats.xpCollected;
  spawnEnemy(w, 'chaser', { x: 20, z: 20 });
  assert.equal(activatePortal(w), true);
  assert.ok(w.events.some((e) => e.type === 'zoneTransition' && e.from === 1 && e.to === 2));
  assert.equal(w.map.index, 1);
  assert.equal(w.map.name, ZONES[1]!.name);
  assert.equal(w.map.zoneTime, 0);
  assert.equal(w.map.finalSwarm, false);
  assert.equal(w.map.state, 'explore');
  assert.equal(w.map.altar!.state, 'dormant');
  assert.deepEqual(w.map.altar!.pos, ZONES[1]!.altar);
  assert.equal(w.map.obstacles, ZONES[1]!.obstacles);
  assert.equal(w.enemies.length, 0);
  assert.equal(w.orbs.length, 0);
  assert.ok(w.stats.xpCollected > xpBefore, 'already-earned orbs collected');
  assert.ok(w.player.level >= 7 && w.player.damage === 30, 'run-only build carried over');
  assert.equal(w.stats.zonesCleared, 1);
});

test('three zones in sequence, then the zone-3 portal leads to the Shrine — NOT a victory', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  const names: string[] = [];
  let lastEvents: typeof w.events = [];
  for (let z = 0; z < 3; z++) {
    names.push(w.map.name);
    clearZone(w);
    if (z === 2) assert.ok(w.events.some((e) => e.type === 'portalOpened' && e.toShrine));
    assert.equal(activatePortal(w), true);
    lastEvents = w.events;
    while (w.phase === 'levelup') chooseUpgrade(w, 0);
    w.spawnTimer = 1e9;
  }
  assert.deepEqual(names, ZONES.map((z) => z.name));
  assert.equal(w.map.kind, 'shrine');
  assert.equal(w.stats.zonesCleared, 3);
  assert.equal(w.stats.guardiansDefeated, 3);
  assert.equal(w.phase, 'playing');
  assert.equal(w.result, null, 'arriving at the Shrine ends nothing');
  assert.ok(lastEvents.some((e) => e.type === 'shrineEntered'));
  assert.equal(availableAction(w), null);
  assert.equal(activatePortal(w), false);
});

test('Shrine: Legendary appears, fights, and its real defeat ends the run as shrine-cleared (never "victory")', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  for (let z = 0; z < 3; z++) {
    clearZone(w);
    activatePortal(w);
    while (w.phase === 'levelup') chooseUpgrade(w, 0);
  }
  assert.equal(w.map.state, 'intro');
  for (let i = 0; i < 60 * NORMAL_RULES.shrine.introDelay + 2; i++) step(w, still, DT);
  assert.equal(w.map.state, 'legendary');
  const leg = guardian(w)!;
  assert.equal(leg.kind, 'legendary');
  assert.equal(leg.maxHp, NORMAL_RULES.shrine.legendaryHp);
  for (let i = 0; i < 600; i++) step(w, still, DT); // no wild spawns in the shrine prototype
  assert.equal(w.enemies.filter((e) => e.kind !== 'legendary').length, 0);
  hitEnemy(w, leg, leg.hp - 1);
  assert.equal(w.result, null);
  hitEnemy(w, leg, 1);
  assert.equal(w.phase, 'shrine-cleared');
  assert.equal(w.result!.outcome, 'shrine-cleared');
  assert.notEqual(w.result!.outcome as string, 'victory');
  assert.equal(w.result!.legendaryDefeated, true);
  assert.equal(w.result!.reached, 'Shrine');
  const t = w.time;
  step(w, { x: 1, z: 0 }, DT);
  assert.equal(w.time, t);
  assert.equal(quitRun(w), false);
});

test('defeat at the Shrine is a defeat; quit is its own outcome; restart is a fresh zone 1', () => {
  const w = quiet();
  w.player.attackTimer = 1e9;
  for (let z = 0; z < 3; z++) {
    clearZone(w);
    activatePortal(w);
    while (w.phase === 'levelup') chooseUpgrade(w, 0);
  }
  for (let i = 0; i < 60 * 3.5; i++) step(w, still, DT);
  w.player.hp = 1;
  const leg = guardian(w)!;
  leg.pos = { x: w.player.pos.x + 3.5, z: w.player.pos.z };
  leg.slamTimer = 99;
  for (let i = 0; i < 240 && w.phase === 'playing'; i++) step(w, still, DT);
  assert.equal(w.result?.outcome, 'defeat');
  assert.equal(w.result?.reached, 'Shrine');

  const q = quiet();
  clearZone(q);
  assert.equal(quitRun(q), true);
  assert.equal(q.result!.outcome, 'quit');
  assert.equal(activatePortal(q), false, 'cannot use the portal after quitting');

  const fresh = createWorld(77);
  assert.equal(fresh.map.index, 0);
  assert.equal(fresh.map.zoneTime, 0);
  assert.equal(fresh.stats.zonesCleared, 0);
});

test('no economy: no currency/reward fields anywhere in the world or result', () => {
  const w = quiet();
  clearZone(w);
  quitRun(w);
  assert.deepEqual(Object.keys(w.result!).sort(), ['finalSwarmsReached', 'guardiansDefeated', 'kills', 'legendaryDefeated', 'level', 'outcome', 'reached', 'time', 'zonesCleared']);
  const json = JSON.stringify({ ...w, rng: null, rules: null }).toLowerCase();
  for (const word of ['stardust', 'bonkoin', 'pokedollar', 'currency', 'reward', 'unlock']) assert.ok(!json.includes(word), word);
});

test('SHORT test preset: same mechanics with 30-second zones and small boss HP', () => {
  assert.equal(SHORT_RULES.zoneSeconds, 30);
  assert.equal(SHORT_RULES.zones.length, 3);
  const w = quiet(SHORT_RULES);
  advance(w, 29.9);
  assert.equal(w.map.finalSwarm, false);
  advance(w, 0.1);
  assert.equal(w.map.finalSwarm, true);
  assert.equal(w.phase, 'playing');
});

// ---------- a kiting bot plays real runs ----------
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
    const big = e.kind === 'boss' || e.kind === 'legendary';
    const danger = big ? (e.ai === 'slam' ? 9 : 7) : 4.5;
    if (d < danger) {
      const wgt = ((danger - d) / danger) * (big ? 3 : 1);
      mx += (dx / d) * wgt;
      mz += (dz / d) * wgt;
    }
  }
  const lim = 26;
  if (Math.abs(p.x) > lim) mx -= Math.sign(p.x) * 1.5;
  if (Math.abs(p.z) > lim) mz -= Math.sign(p.z) * 1.5;
  const m = w.map;
  let goal: { x: number; z: number } | null = m.portal;
  // policy (not a rule): wake the guardian once reasonably levelled or after 90 s in the zone
  if (!goal && m.state === 'explore' && m.altar && (w.player.level >= 4 + 3 * m.index || m.zoneTime > 90)) goal = m.altar.pos;
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
  const boss = w.enemies.find((e) => e.id === m.bossId);
  if (!goal && boss && Math.hypot(boss.pos.x - p.x, boss.pos.z - p.z) > 11) goal = boss.pos;
  if (goal) {
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const pull = m.portal || goal === m.altar?.pos ? 1.6 : 0.8;
    mx += (dx / d) * pull;
    mz += (dz / d) * pull;
  }
  return { x: mx, z: mz };
}

const PREF = ['multishot', 'haste', 'power', 'vitality', 'pulse', 'swift', 'magnet'] as const;

function playWithBot(w: World, maxSeconds: number): void {
  for (let i = 0; i < maxSeconds * 60; i++) {
    if (w.phase === 'levelup') {
      const c = w.choices!;
      const idx = Math.max(0, PREF.map((p) => c.indexOf(p)).find((j) => j >= 0) ?? 0);
      chooseUpgrade(w, idx);
      continue;
    }
    if (w.phase !== 'playing') return;
    if (availableAction(w) && performAction(w)) continue;
    step(w, botInput(w), DT);
  }
}

test('NORMAL rules played by a bot: zones are cleared through altar -> guardian -> portal, and the Shrine is reachable', () => {
  const outcomes: string[] = [];
  let reachedShrine = 0;
  let guardians = 0;
  for (const seed of [1, 2, 3]) {
    const w = createWorld(seed);
    playWithBot(w, 20 * 60);
    guardians += w.stats.guardiansDefeated;
    if (w.map.kind === 'shrine') reachedShrine++;
    assert.notEqual(w.phase as string, 'victory');
    outcomes.push(`${seed}:${w.result?.outcome ?? w.phase}@${w.time.toFixed(0)}s ${w.map.kind}${w.map.index + 1}/${w.map.state} g${w.stats.guardiansDefeated} lvl${w.player.level}`);
  }
  console.log('bot outcomes (normal):', outcomes.join(' | '));
  assert.ok(guardians >= 3, `guardians defeated across seeds: ${guardians}`);
  assert.ok(reachedShrine >= 1, `at least one seed reaches the Shrine: ${outcomes.join(' | ')}`);
});

test('SHORT preset bot run reaches and clears the Shrine through real combat', () => {
  const w = createWorld(11, { rules: SHORT_RULES });
  playWithBot(w, 8 * 60);
  assert.equal(w.result?.outcome, 'shrine-cleared', `short bot: ${w.phase} ${w.map.kind} ${w.map.state}`);
  assert.equal(w.stats.guardiansDefeated, 3);
  assert.equal(w.stats.zonesCleared, 3);
});
