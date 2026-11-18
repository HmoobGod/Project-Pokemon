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
import {
  BLESSING_EFFECT_EVIDENCE,
  BLESSING_OPTION_COUNT,
  BLESSING_RARITIES,
  NORMAL_RULES,
  PORTAL,
  RARITY_ODDS_EVIDENCE,
  RARITY_STYLE,
  blessingIsEvidenced,
  type BlessingEffectEvidence,
  type RarityOddsEvidence,
  type RunRules,
} from '../src/sim/config.ts';
import { oddsAreEvidenced, rollBlessingOffer } from '../src/sim/blessings.ts';
import { createRng } from '../src/sim/rng.ts';

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

// ---------- Unown blessings: three randomized options, four rarities, evidence-gated ----------
test('shipped blessing data: four rarities with colours, three options, no effects, no rarity odds, no Luck formula', () => {
  assert.deepEqual([...BLESSING_RARITIES], ['common', 'rare', 'epic', 'legendary']);
  assert.deepEqual(Object.keys(RARITY_STYLE), ['common', 'rare', 'epic', 'legendary']);
  assert.deepEqual(
    BLESSING_RARITIES.map((r) => RARITY_STYLE[r].label),
    ['Common', 'Rare', 'Epic', 'Legendary'],
  );
  assert.equal(BLESSING_OPTION_COUNT, 3);
  assert.equal(BLESSING_EFFECT_EVIDENCE.length, 0, 'no invented effects');
  assert.deepEqual(RARITY_ODDS_EVIDENCE, { weights: null, luckFormula: null, source: null }, 'no invented odds');
  assert.equal(oddsAreEvidenced(RARITY_ODDS_EVIDENCE), false);
  assert.equal(NORMAL_RULES.blessingEffects, BLESSING_EFFECT_EVIDENCE);
  assert.equal(createWorld(1).player.luck, 0);
});

test('seeded offers: always exactly 3 options, only valid rarities, deterministic per seed, flagged as placeholder rarity', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const a = rollBlessingOffer(createRng(seed), 0, RARITY_ODDS_EVIDENCE, BLESSING_EFFECT_EVIDENCE);
    const b = rollBlessingOffer(createRng(seed), 0, RARITY_ODDS_EVIDENCE, BLESSING_EFFECT_EVIDENCE);
    assert.equal(a.length, 3);
    assert.deepEqual(a, b, 'same seed -> same offer');
    for (const o of a) {
      assert.ok((BLESSING_RARITIES as readonly string[]).includes(o.rarity));
      assert.equal(o.effect, null);
      assert.equal(o.rarityEvidenced, false);
      assert.equal(o.luckApplied, false);
    }
  }
});

test('no fixed rarity lineup: offers vary across seeds, repeats are allowed, and there is never a fixed four-rarity set', () => {
  const lineups = new Set<string>();
  let sawRepeat = false;
  for (let seed = 1; seed <= 200; seed++) {
    const o = rollBlessingOffer(createRng(seed), 0, RARITY_ODDS_EVIDENCE, BLESSING_EFFECT_EVIDENCE).map((x) => x.rarity);
    assert.notEqual(o.length, 4);
    lineups.add(o.join(','));
    if (new Set(o).size < o.length) sawRepeat = true;
  }
  assert.ok(lineups.size > 10, `offers vary: ${lineups.size} distinct lineups`);
  assert.ok(sawRepeat, 'options are independent draws (no assumption that rarities are distinct)');
});

test('Luck is passed but NOT applied while the formula is unknown (same offer for any Luck)', () => {
  for (const luck of [0, 5, 100]) {
    assert.deepEqual(
      rollBlessingOffer(createRng(77), luck, RARITY_ODDS_EVIDENCE, BLESSING_EFFECT_EVIDENCE),
      rollBlessingOffer(createRng(77), 0, RARITY_ODDS_EVIDENCE, BLESSING_EFFECT_EVIDENCE),
    );
  }
});

test('odds plumbing (TEST-ONLY fixture weights, not game data): evidenced weights + Luck formula are honoured', () => {
  const onlyEpic: RarityOddsEvidence = { weights: { common: 0, rare: 0, epic: 1, legendary: 0 }, luckFormula: null, source: 'TEST FIXTURE ONLY' };
  for (const o of rollBlessingOffer(createRng(5), 0, onlyEpic, [])) {
    assert.equal(o.rarity, 'epic');
    assert.equal(o.rarityEvidenced, true);
    assert.equal(o.luckApplied, false);
  }
  const luckToLegendary: RarityOddsEvidence = {
    weights: { common: 1, rare: 0, epic: 0, legendary: 0 },
    luckFormula: (w, luck) => (luck >= 10 ? { common: 0, rare: 0, epic: 0, legendary: 1 } : w),
    source: 'TEST FIXTURE ONLY',
  };
  assert.ok(rollBlessingOffer(createRng(5), 0, luckToLegendary, []).every((o) => o.rarity === 'common'));
  assert.ok(rollBlessingOffer(createRng(5), 10, luckToLegendary, []).every((o) => o.rarity === 'legendary' && o.luckApplied));
  assert.equal(oddsAreEvidenced({ ...onlyEpic, source: null }), false, 'weights without a source are not used');
});

test('effect gate (TEST-ONLY fixture effect): only an evidenced effect of the drawn rarity applies, once, on the one picked option', () => {
  const effects: BlessingEffectEvidence[] = [{ rarity: 'rare', stat: 'damage', amount: 3, source: 'TEST FIXTURE ONLY' }];
  const odds: RarityOddsEvidence = { weights: { common: 0, rare: 1, epic: 0, legendary: 0 }, luckFormula: null, source: 'TEST FIXTURE ONLY' };
  const rules: RunRules = { ...NORMAL_RULES, blessingEffects: effects, rarityOdds: odds };
  const w = createWorld(4, { rules });
  w.spawnTimer = 1e9;
  w.player.attackTimer = 1e9;
  at(w, w.map.unown!.pos);
  for (let i = 0; i < 60 * (rules.unownChargeSeconds + 0.2); i++) step(w, still, DT);
  assert.equal(w.phase, 'blessing');
  assert.ok(w.blessingChoices!.every((o) => o.effect?.stat === 'damage'));
  const d = w.player.damage;
  chooseBlessing(w, 0);
  assert.equal(w.player.damage, d + 3, 'one option applied, not all three');
  assert.deepEqual(w.blessings, [{ rarity: 'rare', stat: 'damage', amount: 3, applied: true, rarityEvidenced: true }]);
  assert.equal(blessingIsEvidenced({ ...effects[0]!, source: '' }), false);
  assert.equal(blessingIsEvidenced({ ...effects[0]!, amount: 0 }), false);
  assert.equal(blessingIsEvidenced({ ...effects[0]!, amount: Number.NaN }), false);
  assert.equal(blessingIsEvidenced(null), false);
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
