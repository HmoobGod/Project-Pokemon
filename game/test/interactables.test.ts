import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activatePortal,
  availableAction,
  chooseBlessing,
  chooseUpgrade,
  createWorld,
  hitEnemy,
  performAction,
  quitRun,
  spawnEnemy,
  startChallenge,
  step,
  wakeGuardian,
  type World,
} from '../src/sim/world.ts';
import { CHALLENGE, NORMAL_RULES, SHORT_RULES, UNOWN, ZONES } from '../src/sim/config.ts';
import { mapMarkers, projectFullMap, projectMinimap } from '../src/ui/minimap.ts';

const DT = 1 / 60;
const still = { x: 0, z: 0 };

function quiet(rules = NORMAL_RULES): World {
  const w = createWorld(9, { rules });
  w.spawnTimer = 1e9;
  w.player.attackTimer = 1e9; // keep auto-attacks out unless a test wants them
  return w;
}
function stepFor(w: World, seconds: number, input = still): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(w, input, DT);
}
const at = (w: World, p: { x: number; z: number }) => (w.player.pos = { x: p.x, z: p.z });

// ---------- Unown altar ----------
test('Unown: every zone has one, idle and empty; it only charges while the player stands in its circle', () => {
  const w = quiet();
  const u = w.map.unown!;
  assert.deepEqual(u.pos, ZONES[0]!.unown);
  assert.equal(u.state, 'idle');
  assert.equal(u.charge, 0);
  stepFor(w, 3); // player at spawn, far away
  assert.equal(u.charge, 0);
  at(w, { x: u.pos.x + UNOWN.radius + 0.2, z: u.pos.z });
  stepFor(w, 2);
  assert.equal(u.charge, 0, 'just outside the circle');
  at(w, { x: u.pos.x + UNOWN.radius - 0.2, z: u.pos.z });
  stepFor(w, 1);
  assert.equal(u.state, 'charging');
  assert.ok(Math.abs(u.charge - 1 / NORMAL_RULES.unownChargeSeconds) < 0.01, `charge ${u.charge}`);
});

test('Unown: stepping out keeps progress (placeholder) and stops charging; it fills only with enough time inside', () => {
  const w = quiet();
  const u = w.map.unown!;
  at(w, u.pos);
  stepFor(w, 2);
  const c = u.charge;
  at(w, { x: 0, z: 0 });
  stepFor(w, 5);
  assert.equal(u.charge, c);
  assert.equal(u.state, 'idle');
  at(w, u.pos);
  stepFor(w, NORMAL_RULES.unownChargeSeconds - 2 - 0.2);
  assert.equal(w.phase, 'playing', 'not full yet');
  stepFor(w, 0.3);
  assert.equal(w.phase, 'blessing');
  assert.equal(u.state, 'choosing');
  assert.equal(u.charge, 1);
});

test('Unown charge does not advance while paused for a level-up choice', () => {
  const w = quiet();
  const u = w.map.unown!;
  at(w, u.pos);
  stepFor(w, 1);
  const e = spawnEnemy(w, 'chaser', { x: u.pos.x + 1, z: u.pos.z });
  hitEnemy(w, e, 9999);
  w.orbs[0]!.value = 5;
  w.orbs[0]!.pos = { ...w.player.pos };
  step(w, still, DT);
  assert.equal(w.phase, 'levelup');
  const c = u.charge;
  stepFor(w, 10);
  assert.equal(u.charge, c);
  chooseUpgrade(w, 0);
  stepFor(w, 1);
  assert.ok(u.charge > c);
});

test('blessing choice: three options with valid rarities; with no evidence the pick changes no stat; altar spent; one pick only', () => {
  const w = quiet();
  const u = w.map.unown!;
  at(w, u.pos);
  stepFor(w, NORMAL_RULES.unownChargeSeconds + 0.1);
  assert.equal(w.phase, 'blessing');
  assert.equal(w.blessingChoices!.length, 3);
  for (const o of w.blessingChoices!) {
    assert.ok(['common', 'rare', 'epic', 'legendary'].includes(o.rarity));
    assert.equal(o.effect, null);
    assert.equal(o.rarityEvidenced, false);
    assert.equal(o.luckApplied, false);
  }
  const t = w.time;
  stepFor(w, 3);
  assert.equal(w.time, t, 'game is paused while choosing');
  const before = JSON.stringify(w.player);
  assert.equal(chooseBlessing(w, 3), false, 'only three options');
  assert.equal(chooseBlessing(w, -1), false);
  const picked = w.blessingChoices![1]!;
  assert.equal(chooseBlessing(w, 1), true);
  assert.equal(JSON.stringify(w.player), before, 'no invented effect applied');
  assert.deepEqual(w.blessings, [{ rarity: picked.rarity, stat: null, amount: null, applied: false, rarityEvidenced: false }]);
  assert.equal(u.state, 'spent');
  assert.equal(w.phase, 'playing');
  assert.equal(chooseBlessing(w, 0), false, 'one pick per choice, not three buffs');
  stepFor(w, NORMAL_RULES.unownChargeSeconds + 1);
  assert.equal(w.phase, 'playing', 'spent altar never charges again');
  assert.equal(w.blessings.length, 1);
});

// ---------- Challenge altar ----------
test('Challenge: needs proximity + explicit action; never starts by walking past', () => {
  const w = quiet();
  const c = w.map.challenge!;
  assert.equal(startChallenge(w), false, 'far away');
  at(w, { x: c.pos.x + CHALLENGE.activateRange + 0.2, z: c.pos.z });
  assert.equal(availableAction(w), null);
  at(w, c.pos);
  stepFor(w, 3);
  assert.equal(c.state, 'idle', 'standing on it does nothing by itself');
  assert.equal(availableAction(w), 'start-challenge');
});

test('Challenge: one explicit start spawns exactly N enemies of ONE species; starting again does nothing', () => {
  const w = quiet();
  const c = w.map.challenge!;
  at(w, c.pos);
  assert.equal(performAction(w), 'start-challenge');
  assert.equal(c.state, 'active');
  const wave = w.enemies.filter((e) => e.challenge);
  assert.equal(wave.length, NORMAL_RULES.challengeWaveSize);
  assert.equal(new Set(wave.map((e) => e.kind)).size, 1);
  assert.equal(wave[0]!.kind, ZONES[0]!.challenge.species);
  assert.equal(c.total, NORMAL_RULES.challengeWaveSize);
  assert.equal(c.remaining, c.total);
  assert.equal(startChallenge(w), false);
  assert.equal(w.enemies.filter((e) => e.challenge).length, NORMAL_RULES.challengeWaveSize, 'no second wave');
});

test('Challenge: only wave KOs count; win needs all of them; no payout of any kind', () => {
  const w = quiet();
  const c = w.map.challenge!;
  at(w, c.pos);
  startChallenge(w);
  for (let i = 0; i < 5; i++) hitEnemy(w, spawnEnemy(w, 'chaser', { x: -10, z: -10 }), 9999);
  assert.equal(c.remaining, c.total, 'ordinary KOs do not count');
  const wave = w.enemies.filter((e) => e.challenge);
  for (const e of wave.slice(0, -1)) hitEnemy(w, e, 9999);
  assert.equal(c.state, 'active');
  assert.equal(c.remaining, 1);
  const before = { ...w.player, upgradesTaken: [...w.player.upgradesTaken] };
  hitEnemy(w, wave.at(-1)!, 9999);
  assert.equal(c.state, 'won');
  assert.equal(w.stats.challengesWon, 1);
  assert.ok(w.events.some((e) => e.type === 'challengeWon'));
  assert.deepEqual({ ...w.player, upgradesTaken: [...w.player.upgradesTaken] }, before, 'no stat/item grant (Great Ball NOT granted)');
  const json = JSON.stringify({ ...w, rng: null, rules: null }).toLowerCase();
  for (const word of ['great ball', 'greatball', 'inventory', '"item', 'stardust', 'pokedollar', 'reward']) assert.ok(!json.includes(word), word);
  assert.equal(availableAction(w), null, 'won altar cannot be restarted');
});

test('Challenge enemies fight for real: they damage the player and are killed by auto-attacks', () => {
  const w = quiet();
  w.player.attackTimer = 0.1;
  const c = w.map.challenge!;
  at(w, c.pos);
  startChallenge(w);
  stepFor(w, 25);
  assert.ok(w.stats.damageTaken > 0, 'wave hit the player');
  assert.ok(c.remaining < c.total, `auto-attacks killed some: ${c.remaining}/${c.total}`);
});

test('Challenge failure: dying mid-wave records a failed challenge and a normal defeat', () => {
  const w = quiet();
  const c = w.map.challenge!;
  at(w, c.pos);
  startChallenge(w);
  w.player.hp = 1;
  stepFor(w, 15);
  assert.equal(w.phase, 'defeated');
  assert.equal(c.state, 'failed');
  assert.equal(w.result!.challengesFailed, 1);
  assert.equal(w.result!.challengesWon, 0);
});

test('Challenge failure: leaving the zone through the portal mid-wave fails it; next zone has fresh altars', () => {
  const w = quiet();
  const c = w.map.challenge!;
  at(w, c.pos);
  startChallenge(w);
  at(w, w.map.altar!.pos);
  wakeGuardian(w);
  hitEnemy(w, w.enemies.find((e) => e.id === w.map.bossId)!, 99999);
  at(w, w.map.portal!);
  assert.equal(activatePortal(w), true);
  assert.equal(w.stats.challengesFailed, 1);
  assert.ok(w.events.some((e) => e.type === 'challengeFailed' && e.reason === 'left-zone'));
  assert.equal(w.map.index, 1);
  assert.equal(w.map.challenge!.state, 'idle');
  assert.deepEqual(w.map.challenge!.pos, { x: ZONES[1]!.challenge.x, z: ZONES[1]!.challenge.z });
  assert.equal(w.map.challenge!.species, 'brute');
  assert.equal(w.map.unown!.state, 'idle');
  assert.equal(w.map.unown!.charge, 0);
});

test('Interactables work during the Final Swarm and stop when the run is quit; the Shrine has none', () => {
  const w = quiet(SHORT_RULES);
  stepFor(w, SHORT_RULES.zoneSeconds + 0.5);
  assert.equal(w.map.finalSwarm, true);
  at(w, w.map.challenge!.pos);
  assert.equal(startChallenge(w), true);
  quitRun(w);
  assert.equal(availableAction(w), null);
  const s = quiet();
  for (let z = 0; z < 3; z++) {
    at(s, s.map.altar!.pos);
    wakeGuardian(s);
    hitEnemy(s, s.enemies.find((e) => e.id === s.map.bossId)!, 99999);
    at(s, s.map.portal!);
    activatePortal(s);
    while (s.phase === 'levelup') chooseUpgrade(s, 0);
  }
  assert.equal(s.map.kind, 'shrine');
  assert.equal(s.map.unown, null);
  assert.equal(s.map.challenge, null);
});

test('existing loop unchanged: KOs never wake the Guardian; altar -> guardian -> portal still works with new altars present', () => {
  const w = quiet();
  for (let i = 0; i < 200; i++) hitEnemy(w, spawnEnemy(w, 'chaser', { x: 5, z: 5 }), 9999);
  while (w.phase === 'levelup') chooseUpgrade(w, 0);
  assert.equal(w.map.altar!.state, 'dormant');
  at(w, w.map.altar!.pos);
  assert.equal(availableAction(w), 'wake-guardian');
});

// ---------- minimap model ----------
test('minimap: player-centred projection, scale, and edge pinning for important markers', () => {
  const c = projectMinimap(10, 10, 10, 10, 20, 120, true)!;
  assert.deepEqual(c, { px: 60, py: 60, edge: false });
  const right = projectMinimap(0, 0, 10, 0, 20, 120, false)!;
  assert.deepEqual(right, { px: 90, py: 60, edge: false });
  const down = projectMinimap(0, 0, 0, 20, 20, 120, false)!;
  assert.equal(down.py, 120);
  assert.equal(projectMinimap(0, 0, 50, 0, 20, 120, false), null, 'far enemy hidden');
  const pinned = projectMinimap(0, 0, 50, 0, 20, 120, true)!;
  assert.equal(pinned.edge, true);
  assert.ok(pinned.px > 60 && pinned.px <= 120 && pinned.py === 60);
});

test('full map: arena corners map to the canvas corners', () => {
  assert.deepEqual(projectFullMap(-30, -30, 300), { px: 0, py: 0 });
  assert.deepEqual(projectFullMap(30, 30, 300), { px: 300, py: 300 });
  assert.deepEqual(projectFullMap(0, 0, 300), { px: 150, py: 150 });
});

test('map markers reflect real state: altars, portal only when open, boss while awake', () => {
  const w = quiet();
  let kinds = mapMarkers(w, false).map((m) => m.kind).sort();
  assert.deepEqual(kinds, ['challenge', 'guardian-altar', 'player', 'unown']);
  at(w, w.map.altar!.pos);
  wakeGuardian(w);
  kinds = mapMarkers(w, false).map((m) => m.kind);
  assert.ok(kinds.includes('boss'));
  assert.ok(!kinds.includes('portal'));
  assert.equal(mapMarkers(w, false).find((m) => m.kind === 'guardian-altar')!.state, 'awakened');
  hitEnemy(w, w.enemies.find((e) => e.id === w.map.bossId)!, 99999);
  const markers = mapMarkers(w, false);
  assert.ok(markers.some((m) => m.kind === 'portal' && m.state === 'to-zone'));
  assert.ok(!markers.some((m) => m.kind === 'boss'));
  const p = markers.find((m) => m.kind === 'player')!;
  assert.deepEqual([p.x, p.z], [w.player.pos.x, w.player.pos.z]);
});
