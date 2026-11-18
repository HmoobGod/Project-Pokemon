import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activatePortal,
  applyBlessingStat,
  availableAction,
  chooseBlessing,
  chooseUpgrade,
  createWorld,
  damagePlayer,
  exitStage,
  hitEnemy,
  performAction,
  quitRun,
  step,
  wakeGuardian,
  type World,
} from '../src/sim/world.ts';
import { BLESSING_EVIDENCE, BLESSING_TIERS, NORMAL_RULES, PORTAL, blessingIsEvidenced, type BlessingEvidence, type RunRules } from '../src/sim/config.ts';

const DT = 1 / 60;
const still = { x: 0, z: 0 };
const at = (w: World, p: { x: number; z: number }) => (w.player.pos = { x: p.x, z: p.z });

/** Real path to the Shrine: wake + defeat each Guardian, enter each portal. */
function toShrine(rules: RunRules = NORMAL_RULES): World {
  const w = createWorld(21, { rules });
  w.spawnTimer = 1e9;
  w.player.attackTimer = 1e9;
  for (let z = 0; z < 3; z++) {
    at(w, w.map.altar!.pos);
    assert.equal(wakeGuardian(w), true);
    hitEnemy(w, w.enemies.find((e) => e.id === w.map.bossId)!, 1e9);
    at(w, w.map.portal!);
    assert.equal(activatePortal(w), true);
    while (w.phase === 'levelup') chooseUpgrade(w, 0);
  }
  for (let i = 0; i < 60 * rules.shrine.introDelay + 2; i++) step(w, still, DT);
  assert.equal(w.map.state, 'legendary');
  return w;
}
const legendary = (w: World) => w.enemies.find((e) => e.id === w.map.bossId)!;

// ---------- Legendary victory -> exit portal state machine (owner rule 2026-11-18) ----------
test('reaching the Shrine and damaging the Legendary is not victory; only its HP-zero defeat is', () => {
  const w = toShrine();
  assert.equal(w.victory, null);
  const leg = legendary(w);
  hitEnemy(w, leg, leg.hp - 1);
  assert.equal(w.victory, null);
  assert.equal(w.map.portal, null, 'no exit portal before the defeat');
  assert.equal(availableAction(w), null);
  assert.equal(exitStage(w), false);
});

test('Legendary defeat records the run victory exactly once and opens the exit portal; the run keeps going', () => {
  const w = toShrine();
  w.time = 1234.5;
  const leg = legendary(w);
  hitEnemy(w, leg, leg.hp);
  assert.deepEqual(w.victory, { time: 1234.5 });
  assert.equal(w.events.filter((e) => e.type === 'runVictory').length, 1);
  assert.ok(w.events.some((e) => e.type === 'exitPortalOpened'));
  assert.equal(w.map.state, 'cleared');
  assert.deepEqual(w.map.portal, NORMAL_RULES.shrine.exitPortal);
  assert.equal(w.phase, 'playing', 'player still has to exit through the portal');
  assert.equal(w.result, null);
  // further hits / time cannot record another victory
  hitEnemy(w, leg, 999);
  for (let i = 0; i < 120; i++) step(w, still, DT);
  assert.deepEqual(w.victory, { time: 1234.5 });
  assert.equal(w.stats.legendaryDefeated, true);
});

test('exit portal: needs proximity + explicit action; ends the run as the SAME victory (no second record)', () => {
  const w = toShrine();
  const leg = legendary(w);
  hitEnemy(w, leg, leg.hp);
  const won = w.victory!.time;
  const p = w.map.portal!;
  at(w, { x: p.x + PORTAL.activateRange + 0.3, z: p.z });
  assert.equal(availableAction(w), null);
  assert.equal(exitStage(w), false);
  for (let i = 0; i < 300; i++) step(w, still, DT);
  assert.equal(w.phase, 'playing', 'standing near the portal does not exit by itself');
  at(w, p);
  assert.equal(availableAction(w), 'exit-stage');
  assert.equal(performAction(w), 'exit-stage');
  assert.equal(w.phase, 'victory');
  assert.equal(w.result!.outcome, 'victory');
  assert.equal(w.result!.victoryTime, won, 'victory moment is the Legendary defeat, not the exit');
  assert.equal(w.result!.exitedViaPortal, true);
  assert.equal(w.events.filter((e) => e.type === 'runVictory').length, 0, 'exit emits stageExited, not another victory');
  assert.ok(w.events.some((e) => e.type === 'stageExited'));
  // single completion: nothing else can be done
  assert.equal(exitStage(w), false);
  assert.equal(performAction(w), null);
  assert.equal(quitRun(w), false);
  const t = w.time;
  step(w, { x: 1, z: 0 }, DT);
  assert.equal(w.time, t);
});

test('after the victory nothing can turn the run into a defeat', () => {
  const w = toShrine();
  hitEnemy(w, legendary(w), 1e9);
  w.player.hp = 1;
  assert.equal(damagePlayer(w, 999), false);
  assert.equal(w.player.hp, 1);
  assert.equal(w.phase, 'playing');
});

test('quitting after the victory but before the exit keeps the single victory (not a quit); exitedViaPortal=false', () => {
  const w = toShrine();
  hitEnemy(w, legendary(w), 1e9);
  const won = w.victory!.time;
  assert.equal(quitRun(w), true);
  assert.equal(w.result!.outcome, 'victory');
  assert.equal(w.result!.victoryTime, won);
  assert.equal(w.result!.exitedViaPortal, false);
});

test('defeat by the Legendary before its defeat is a defeat with no victory', () => {
  const w = toShrine();
  w.player.hp = 1;
  const leg = legendary(w);
  leg.pos = { x: w.player.pos.x + 3.5, z: w.player.pos.z };
  leg.slamTimer = 99;
  for (let i = 0; i < 240 && w.phase === 'playing'; i++) step(w, still, DT);
  assert.equal(w.result?.outcome, 'defeat');
  assert.equal(w.result?.victoryTime, null);
  assert.equal(w.victory, null);
});

test('zone portals are unaffected: they never record victory and never offer the exit action', () => {
  const w = createWorld(3);
  w.spawnTimer = 1e9;
  at(w, w.map.altar!.pos);
  wakeGuardian(w);
  hitEnemy(w, w.enemies.find((e) => e.id === w.map.bossId)!, 1e9);
  at(w, w.map.portal!);
  assert.equal(availableAction(w), 'enter-portal');
  assert.equal(exitStage(w), false);
  activatePortal(w);
  assert.equal(w.victory, null);
});

test('victory carries no reward/currency data', () => {
  const w = toShrine();
  hitEnemy(w, legendary(w), 1e9);
  at(w, w.map.portal!);
  exitStage(w);
  const json = JSON.stringify(w.result).toLowerCase();
  for (const word of ['stardust', 'bonkoin', 'pokedollar', 'currency', 'reward', 'payout', 'unlock']) assert.ok(!json.includes(word), word);
});

// ---------- four-tier Unown blessings: evidence-gated ----------
test('shipped blessing table: exactly tiers 1-4, every stat/amount/source empty (no invented values)', () => {
  assert.deepEqual(BLESSING_TIERS, [1, 2, 3, 4]);
  assert.equal(BLESSING_EVIDENCE.length, 4);
  for (const e of BLESSING_EVIDENCE) {
    assert.deepEqual([e.stat, e.amount, e.source], [null, null, null]);
    assert.equal(blessingIsEvidenced(e), false);
  }
  assert.equal(NORMAL_RULES.blessings, BLESSING_EVIDENCE);
});

test('evidence gate: a row needs stat AND positive finite amount AND source', () => {
  const ok: BlessingEvidence = { tier: 1, stat: 'damage', amount: 1, source: 'TEST FIXTURE' };
  assert.equal(blessingIsEvidenced(ok), true);
  assert.equal(blessingIsEvidenced({ ...ok, stat: null }), false);
  assert.equal(blessingIsEvidenced({ ...ok, amount: null }), false);
  assert.equal(blessingIsEvidenced({ ...ok, amount: 0 }), false);
  assert.equal(blessingIsEvidenced({ ...ok, amount: Number.NaN }), false);
  assert.equal(blessingIsEvidenced({ ...ok, source: null }), false);
  assert.equal(blessingIsEvidenced({ ...ok, source: '' }), false);
});

test('mechanism (TEST-ONLY fixture values, not game data): an evidenced tier applies its stat once; unevidenced tiers do nothing', () => {
  // These numbers exist only inside this test to prove the plumbing. They are NOT shipped or claimed as authentic.
  const fixture: BlessingEvidence[] = [
    { tier: 1, stat: 'damage', amount: 3, source: 'TEST FIXTURE ONLY' },
    { tier: 2, stat: null, amount: null, source: null },
    { tier: 3, stat: 'maxHp', amount: 10, source: 'TEST FIXTURE ONLY' },
    { tier: 4, stat: 'moveSpeed', amount: 0.1, source: null },
  ];
  const rules: RunRules = { ...NORMAL_RULES, blessings: fixture };
  const pick = (index: number) => {
    const w = createWorld(4, { rules });
    w.spawnTimer = 1e9;
    w.player.attackTimer = 1e9;
    at(w, w.map.unown!.pos);
    for (let i = 0; i < 60 * (rules.unownChargeSeconds + 0.2); i++) step(w, still, DT);
    assert.equal(w.phase, 'blessing');
    const before = { ...w.player };
    assert.equal(chooseBlessing(w, index), true);
    return { w, before };
  };
  const t1 = pick(0);
  assert.equal(t1.w.player.damage, t1.before.damage + 3);
  assert.deepEqual(t1.w.blessings, [{ tier: 1, stat: 'damage', amount: 3, applied: true }]);
  const t2 = pick(1);
  assert.equal(JSON.stringify(t2.w.player), JSON.stringify(t2.before));
  assert.equal(t2.w.blessings[0]!.applied, false);
  const t3 = pick(2);
  assert.equal(t3.w.player.maxHp, t3.before.maxHp + 10);
  const t4 = pick(3);
  assert.equal(t4.w.player.speed, t4.before.speed, 'no source -> not applied');
  assert.equal(t4.w.blessings[0]!.applied, false);
});

test('applyBlessingStat math for each supported stat', () => {
  const w = createWorld(1);
  const p = w.player;
  const d = p.damage, hp = p.maxHp, cd = p.attackCooldown, sp = p.speed;
  applyBlessingStat(p, 'damage', 2);
  applyBlessingStat(p, 'maxHp', 5);
  applyBlessingStat(p, 'attackSpeed', 0.25);
  applyBlessingStat(p, 'moveSpeed', 0.5);
  assert.equal(p.damage, d + 2);
  assert.equal(p.maxHp, hp + 5);
  assert.ok(Math.abs(p.attackCooldown - cd / 1.25) < 1e-12);
  assert.ok(Math.abs(p.speed - sp * 1.5) < 1e-12);
});
