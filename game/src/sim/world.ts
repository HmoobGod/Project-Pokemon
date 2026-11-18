/**
 * Pure gameplay simulation (no DOM, rendering or network), so the rules can be unit tested and later
 * run inside an offline Android WebView.
 *
 * Run structure (GUIDE #01/#11 from the owner-supplied guide screenshots; numbers are prototype values):
 *   Zone 1 -> Zone 2 -> Zone 3 -> Shrine.
 *   Each zone is a separate map context with a 10-minute ACTIVE zone clock (it does not run while paused
 *   or choosing a level-up). When it runs out the Final Swarm starts: combat continues, normal enemies get
 *   much tougher, nothing ends or moves on automatically.
 *   The player wakes the zone's Guardian at its altar with an explicit action, whenever they choose.
 *   Only the Guardian's real HP-zero defeat opens the portal; entering it is another explicit action.
 *   The zone-3 portal leads to the Shrine, where the map's Legendary is fought.
 *
 * OWNER RULE (2026-11-18): defeating the final Legendary IS the run victory; the player then exits the stage
 * through the portal. Victory is recorded exactly once, at the Legendary's real HP-zero defeat; the exit
 * portal only ends the stage and never records a second victory or any credit.
 * Save-and-quit is not implemented (no safe durable saves yet). No currency, rewards or unlocks exist.
 */
import { createRng, randRange, type Rng } from './rng.ts';
import {
  ALTAR,
  ARENA_HALF_SIZE,
  BOSS_PHASE_SPAWN_MUL,
  BOSS_SLAM,
  CHALLENGE,
  ENEMIES,
  LEGENDARY_SLAM,
  NORMAL_RULES,
  ORB,
  PLAYER_BASE,
  PORTAL,
  PULSE,
  SPAWN,
  STRIKE_GRACE,
  UNOWN,
  blessingIsEvidenced,
  spawnInterval,
  xpToNext,
  type BlessingRarity,
  type BlessingStat,
  type EnemyKind,
  type Obstacle,
  type RunRules,
  type ZoneDef,
} from './config.ts';
import { UPGRADES, UPGRADE_ORDER, type UpgradeId } from './upgrades.ts';
import { rollBlessingOffer, type BlessingOption } from './blessings.ts';

export interface Vec2 {
  x: number;
  z: number;
}

export type Phase = 'playing' | 'levelup' | 'blessing' | 'defeated' | 'quit' | 'victory';
export type Outcome = 'defeat' | 'quit' | 'victory';

/** A picked Unown blessing. `applied` is true only when the option carried an evidenced effect. */
export interface BlessingRecord {
  rarity: BlessingRarity;
  stat: BlessingStat | null;
  amount: number | null;
  applied: boolean;
  rarityEvidenced: boolean;
}

export interface PlayerState {
  pos: Vec2;
  facing: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  invulnTimer: number;
  level: number;
  xp: number;
  damage: number;
  attackCooldown: number;
  attackTimer: number;
  attackRange: number;
  projectileCount: number;
  projectileSpeed: number;
  magnetRadius: number;
  pulseLevel: number;
  pulseTimer: number;
  /** Luck stat (owner: influences blessing rarity). No sources of Luck and no formula are known yet: stays 0 and unused. */
  luck: number;
  upgradesTaken: UpgradeId[];
}

export type EnemyAiState = 'chase' | 'windup' | 'recover' | 'slam';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
  ai: EnemyAiState;
  aiTimer: number;
  hitFlash: number;
  /** guardian/legendary only: time until the next ground slam may start */
  slamTimer: number;
  /** multiplier on this enemy's attack damage (Final Swarm) */
  damageMul: number;
  /** spawned by a Challenge altar wave */
  challenge: boolean;
}

export interface Projectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  ttl: number;
  radius: number;
}

export interface XpOrb {
  id: number;
  pos: Vec2;
  value: number;
}

export type MapKind = 'zone' | 'shrine';
export type AltarState = 'dormant' | 'awakened' | 'spent';
export type UnownState = 'idle' | 'charging' | 'choosing' | 'spent';
export type ChallengeState = 'idle' | 'active' | 'won' | 'failed';

export interface UnownAltar {
  pos: Vec2;
  state: UnownState;
  /** 0..1 fill of the circle */
  charge: number;
}

export interface ChallengeAltar {
  pos: Vec2;
  species: 'chaser' | 'brute';
  state: ChallengeState;
  total: number;
  remaining: number;
}
/** zone: explore -> guardian -> portal; shrine: intro -> legendary -> cleared */
export type MapState = 'explore' | 'guardian' | 'portal' | 'intro' | 'legendary' | 'cleared';

export interface MapProgress {
  kind: MapKind;
  /** 0..zones-1 for zones; zones.length for the shrine */
  index: number;
  zoneCount: number;
  name: string;
  state: MapState;
  /** active seconds spent in this zone (frozen while paused / choosing a level-up) */
  zoneTime: number;
  zoneSeconds: number;
  finalSwarm: boolean;
  altar: { pos: Vec2; state: AltarState } | null;
  unown: UnownAltar | null;
  challenge: ChallengeAltar | null;
  bossId: number | null;
  portal: Vec2 | null;
  obstacles: readonly Obstacle[];
  ground: number;
  /** shrine only: seconds until the Legendary appears */
  introTimer: number;
}

export type ActionKind = 'wake-guardian' | 'start-challenge' | 'enter-portal' | 'exit-stage';

export type GameEvent =
  | { type: 'shot'; count: number }
  | { type: 'enemyHit'; id: number; damage: number }
  | { type: 'enemyKilled'; id: number; kind: EnemyKind; pos: Vec2 }
  | { type: 'enemyWindup'; id: number }
  | { type: 'playerHit'; damage: number; hp: number }
  | { type: 'xpCollected'; value: number }
  | { type: 'levelUp'; level: number; choices: UpgradeId[] }
  | { type: 'upgradeChosen'; id: UpgradeId }
  | { type: 'pulse'; radius: number; hits: number }
  | { type: 'finalSwarm'; zone: number }
  | { type: 'unownCharged'; zone: number }
  | { type: 'blessingChosen'; rarity: BlessingRarity; applied: boolean }
  | { type: 'challengeStarted'; zone: number; species: string; total: number }
  | { type: 'challengeWon'; zone: number }
  | { type: 'challengeFailed'; zone: number; reason: 'defeat' | 'left-zone' }
  | { type: 'guardianAwakened'; id: number; zone: number }
  | { type: 'bossSlamWindup'; id: number; radius: number }
  | { type: 'bossSlam'; id: number; radius: number; hit: boolean }
  | { type: 'guardianDefeated'; id: number; zone: number }
  | { type: 'portalOpened'; zone: number; pos: Vec2; toShrine: boolean }
  | { type: 'zoneTransition'; from: number; to: number }
  | { type: 'shrineEntered' }
  | { type: 'legendaryAppeared'; id: number }
  | { type: 'legendaryDefeated'; id: number }
  | { type: 'defeated'; time: number; kills: number; level: number }
  | { type: 'quit'; time: number }
  | { type: 'runVictory'; time: number }
  | { type: 'exitPortalOpened'; pos: Vec2 }
  | { type: 'stageExited'; time: number };

export interface RunStats {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  xpCollected: number;
  guardiansDefeated: number;
  zonesCleared: number;
  legendaryDefeated: boolean;
  finalSwarmsReached: number;
  challengesWon: number;
  challengesFailed: number;
}

export interface RunResult {
  outcome: Outcome;
  time: number;
  /** e.g. "Zone 2 · Dunes" or "Shrine" */
  reached: string;
  zonesCleared: number;
  guardiansDefeated: number;
  legendaryDefeated: boolean;
  finalSwarmsReached: number;
  challengesWon: number;
  challengesFailed: number;
  /** run-only blessings picked (effects only where evidenced) */
  blessings: BlessingRecord[];
  /** run time at which the Legendary was defeated (the single victory moment); null if not won */
  victoryTime: number | null;
  /** true when the player left through the post-victory exit portal */
  exitedViaPortal: boolean;
  kills: number;
  level: number;
}

export interface World {
  seed: number;
  rng: Rng;
  rules: RunRules;
  /** total active run time */
  time: number;
  phase: Phase;
  player: PlayerState;
  enemies: Enemy[];
  projectiles: Projectile[];
  orbs: XpOrb[];
  nextId: number;
  spawnTimer: number;
  pendingLevelUps: number;
  choices: UpgradeId[] | null;
  /** Unown blessing offer (phase 'blessing'): three randomized options */
  blessingChoices: BlessingOption[] | null;
  /** run-only blessings picked */
  blessings: BlessingRecord[];
  /** set ONCE when the final Legendary is defeated */
  victory: { time: number } | null;
  stats: RunStats;
  map: MapProgress;
  result: RunResult | null;
  /** events emitted during the most recent step/action (renderer/audio consume them) */
  events: GameEvent[];
}

export interface MoveInput {
  x: number;
  z: number;
}

export interface WorldOptions {
  rules?: RunRules;
}

function zoneMap(rules: RunRules, index: number): MapProgress {
  const def = rules.zones[index]!;
  return {
    kind: 'zone',
    index,
    zoneCount: rules.zones.length,
    name: def.name,
    state: 'explore',
    zoneTime: 0,
    zoneSeconds: rules.zoneSeconds,
    finalSwarm: false,
    altar: { pos: { ...def.altar }, state: 'dormant' },
    unown: { pos: { x: def.unown.x, z: def.unown.z }, state: 'idle', charge: 0 },
    challenge: { pos: { x: def.challenge.x, z: def.challenge.z }, species: def.challenge.species, state: 'idle', total: 0, remaining: 0 },
    bossId: null,
    portal: null,
    obstacles: def.obstacles,
    ground: def.ground,
    introTimer: 0,
  };
}

function shrineMap(rules: RunRules): MapProgress {
  return {
    kind: 'shrine',
    index: rules.zones.length,
    zoneCount: rules.zones.length,
    name: rules.shrine.name,
    state: 'intro',
    zoneTime: 0,
    zoneSeconds: rules.zoneSeconds,
    finalSwarm: false,
    altar: null,
    unown: null,
    challenge: null,
    bossId: null,
    portal: null,
    obstacles: rules.shrine.obstacles,
    ground: rules.shrine.ground,
    introTimer: rules.shrine.introDelay,
  };
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  const rules = options.rules ?? NORMAL_RULES;
  return {
    seed,
    rng: createRng(seed),
    rules,
    time: 0,
    phase: 'playing',
    player: {
      pos: { x: 0, z: 0 },
      facing: { x: 0, z: -1 },
      radius: PLAYER_BASE.radius,
      hp: PLAYER_BASE.maxHp,
      maxHp: PLAYER_BASE.maxHp,
      speed: PLAYER_BASE.speed,
      invulnTimer: 0,
      level: 1,
      xp: 0,
      damage: PLAYER_BASE.damage,
      attackCooldown: PLAYER_BASE.attackCooldown,
      attackTimer: 0.3,
      attackRange: PLAYER_BASE.attackRange,
      projectileCount: PLAYER_BASE.projectileCount,
      projectileSpeed: PLAYER_BASE.projectileSpeed,
      magnetRadius: PLAYER_BASE.magnetRadius,
      pulseLevel: 0,
      pulseTimer: 0,
      luck: 0,
      upgradesTaken: [],
    },
    enemies: [],
    projectiles: [],
    orbs: [],
    nextId: 1,
    spawnTimer: SPAWN.initialDelay,
    pendingLevelUps: 0,
    choices: null,
    blessingChoices: null,
    blessings: [],
    victory: null,
    stats: { kills: 0, damageDealt: 0, damageTaken: 0, xpCollected: 0, guardiansDefeated: 0, zonesCleared: 0, legendaryDefeated: false, finalSwarmsReached: 0, challengesWon: 0, challengesFailed: 0 },
    map: zoneMap(rules, 0),
    result: null,
    events: [],
  };
}

export function currentZoneDef(world: World): ZoneDef | null {
  return world.map.kind === 'zone' ? world.rules.zones[world.map.index]! : null;
}

export function mapLabel(map: MapProgress): string {
  return map.kind === 'shrine' ? map.name : `Zone ${map.index + 1} · ${map.name}`;
}

export function isRunOver(world: World): boolean {
  return world.phase === 'defeated' || world.phase === 'quit' || world.phase === 'victory';
}

function endRun(world: World, outcome: Outcome, exitedViaPortal = false): void {
  world.phase = outcome === 'defeat' ? 'defeated' : outcome;
  world.choices = null;
  world.blessingChoices = null;
  world.pendingLevelUps = 0;
  world.result = {
    outcome,
    time: world.time,
    reached: mapLabel(world.map),
    zonesCleared: world.stats.zonesCleared,
    guardiansDefeated: world.stats.guardiansDefeated,
    legendaryDefeated: world.stats.legendaryDefeated,
    finalSwarmsReached: world.stats.finalSwarmsReached,
    challengesWon: world.stats.challengesWon,
    challengesFailed: world.stats.challengesFailed,
    blessings: world.blessings.map((b) => ({ ...b })),
    victoryTime: world.victory ? world.victory.time : null,
    exitedViaPortal,
    kills: world.stats.kills,
    level: world.player.level,
  };
}

// ---------- small vector helpers ----------
function dist2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function clampToArena(p: Vec2, radius: number): void {
  const lim = ARENA_HALF_SIZE - radius;
  if (p.x < -lim) p.x = -lim;
  if (p.x > lim) p.x = lim;
  if (p.z < -lim) p.z = -lim;
  if (p.z > lim) p.z = lim;
}

function pushOutOfObstacles(obstacles: readonly Obstacle[], p: Vec2, radius: number): void {
  for (const o of obstacles) {
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const min = o.radius + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 0.0001;
      p.x = o.x + (dx / d) * min;
      p.z = o.z + (dz / d) * min;
    }
  }
}

/** Normalises raw stick/keyboard input to length <= 1. */
export function normalizeMove(input: MoveInput): MoveInput {
  const len = Math.hypot(input.x, input.z);
  if (!Number.isFinite(len) || len < 1e-6) return { x: 0, z: 0 };
  if (len <= 1) return { x: input.x, z: input.z };
  return { x: input.x / len, z: input.z / len };
}

// ---------- step ----------
export const MAX_STEP = 1 / 20;

export function step(world: World, rawInput: MoveInput, dt: number): void {
  world.events = [];
  if (world.phase !== 'playing') return; // paused for level-up choice or run over: clocks do not move
  if (!(dt > 0)) return;
  dt = Math.min(dt, MAX_STEP);
  world.time += dt;
  updateMapClock(world, dt);

  updatePlayer(world, rawInput, dt);
  updateSpawning(world, dt);
  updateEnemies(world, dt);
  if (world.phase !== 'playing') return;
  updatePlayerAttack(world, dt);
  updatePulse(world, dt);
  updateProjectiles(world, dt);
  updateOrbs(world, dt);
  if (world.phase === 'playing') updateUnown(world, dt);
}

/** Unown circle fills while the player stands inside it (progress is kept if they step out — placeholder). */
function updateUnown(world: World, dt: number): void {
  const u = world.map.unown;
  if (!u || u.state === 'spent' || u.state === 'choosing') return;
  const inside = dist2(u.pos, world.player.pos) <= UNOWN.radius * UNOWN.radius;
  if (!inside) {
    if (u.state === 'charging') u.state = 'idle';
    return;
  }
  u.state = 'charging';
  u.charge = Math.min(1, u.charge + dt / world.rules.unownChargeSeconds);
  if (u.charge >= 1 - 1e-9) {
    u.charge = 1;
    u.state = 'choosing';
    world.phase = 'blessing';
    // three randomized options (owner rule); rarity odds/Luck/effects are evidence-gated inside the roll
    world.blessingChoices = rollBlessingOffer(world.rng, world.player.luck, world.rules.rarityOdds, world.rules.blessingEffects);
    world.events.push({ type: 'unownCharged', zone: world.map.index + 1 });
  }
}

/** Pick ONE of the offered blessings (one pick per choice). Applies a buff ONLY if the option has an evidenced effect. */
export function chooseBlessing(world: World, index: number): boolean {
  if (world.phase !== 'blessing' || !world.blessingChoices) return false;
  if (!Number.isInteger(index) || index < 0 || index >= world.blessingChoices.length) return false;
  const opt = world.blessingChoices[index]!;
  const applied = blessingIsEvidenced(opt.effect);
  if (applied) applyBlessingStat(world.player, opt.effect!.stat, opt.effect!.amount);
  world.blessings.push({ rarity: opt.rarity, stat: opt.effect?.stat ?? null, amount: opt.effect?.amount ?? null, applied, rarityEvidenced: opt.rarityEvidenced });
  world.blessingChoices = null;
  if (world.map.unown) world.map.unown.state = 'spent';
  world.phase = 'playing';
  world.events = [{ type: 'blessingChosen', rarity: opt.rarity, applied }];
  if (world.pendingLevelUps > 0) openLevelUp(world);
  return true;
}

/** Mechanical application of an evidenced buff (the amounts themselves must come from evidence). */
export function applyBlessingStat(p: PlayerState, stat: BlessingStat, amount: number): void {
  switch (stat) {
    case 'damage':
      p.damage += amount;
      break;
    case 'maxHp':
      p.maxHp += amount;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      break;
    case 'attackSpeed':
      p.attackCooldown = Math.max(0.05, p.attackCooldown / (1 + amount));
      break;
    case 'moveSpeed':
      p.speed *= 1 + amount;
      break;
  }
}

function updateMapClock(world: World, dt: number): void {
  const m = world.map;
  if (m.kind === 'zone') {
    m.zoneTime += dt;
    // tiny epsilon: summing many float steps can land at 599.99999999 after exactly 600 s of play
    if (!m.finalSwarm && m.zoneTime >= m.zoneSeconds - 1e-7) {
      m.finalSwarm = true;
      world.stats.finalSwarmsReached++;
      world.events.push({ type: 'finalSwarm', zone: m.index + 1 });
    }
  } else if (m.state === 'intro') {
    m.introTimer -= dt;
    if (m.introTimer <= 0) {
      const leg = spawnEnemy(world, 'legendary', { x: 0, z: -12 });
      m.bossId = leg.id;
      m.state = 'legendary';
      world.events.push({ type: 'legendaryAppeared', id: leg.id });
    }
  }
}

/** Seconds of Final Swarm so far (0 before the zone clock runs out). */
export function overtimeSeconds(world: World): number {
  const m = world.map;
  return m.kind === 'zone' && m.finalSwarm ? m.zoneTime - m.zoneSeconds : 0;
}

function updatePlayer(world: World, rawInput: MoveInput, dt: number): void {
  const p = world.player;
  const move = normalizeMove(rawInput);
  p.pos.x += move.x * p.speed * dt;
  p.pos.z += move.z * p.speed * dt;
  if (move.x !== 0 || move.z !== 0) {
    const len = Math.hypot(move.x, move.z);
    p.facing = { x: move.x / len, z: move.z / len };
  }
  pushOutOfObstacles(world.map.obstacles, p.pos, p.radius);
  clampToArena(p.pos, p.radius);
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
}

function updateSpawning(world: World, dt: number): void {
  const def = currentZoneDef(world);
  if (!def) return; // PROTOTYPE: the Shrine has no wild spawns (unconfirmed)
  const m = world.map;
  world.spawnTimer -= dt;
  while (world.spawnTimer <= 0) {
    let mul = def.spawnIntervalMul * (m.state === 'explore' ? 1 : BOSS_PHASE_SPAWN_MUL);
    if (m.finalSwarm) mul *= world.rules.finalSwarm.spawnIntervalMul;
    world.spawnTimer += spawnInterval(m.zoneTime) * mul;
    if (world.enemies.length >= SPAWN.maxEnemies) continue;
    const kind: EnemyKind = m.zoneTime >= def.bruteUnlockTime && world.rng.next() < def.bruteChance ? 'brute' : 'chaser';
    spawnEnemy(world, kind);
  }
}

function ringPosition(world: World, radius: number): Vec2 {
  const angle = randRange(world.rng, 0, Math.PI * 2);
  const r = randRange(world.rng, SPAWN.ringMin, SPAWN.ringMax);
  const pos = { x: world.player.pos.x + Math.cos(angle) * r, z: world.player.pos.z + Math.sin(angle) * r };
  clampToArena(pos, radius);
  return pos;
}

/** HP and damage multipliers for a newly spawned normal enemy right now. */
export function normalEnemyScaling(world: World): { hp: number; damage: number } {
  const def = currentZoneDef(world);
  if (!def) return { hp: 1, damage: 1 };
  const m = world.map;
  const minutesIn = Math.min(m.zoneTime, m.zoneSeconds) / 60;
  let hp = def.enemyHpMul * (1 + world.rules.enemyHpGrowthPerMinute * minutesIn);
  let damage = 1;
  if (m.finalSwarm) {
    const fs = world.rules.finalSwarm;
    const otMin = overtimeSeconds(world) / 60;
    hp *= fs.hpMulBase + fs.hpMulPerMinute * otMin;
    damage *= fs.damageMulBase + fs.damageMulPerMinute * otMin;
  }
  return { hp, damage };
}

export function spawnEnemy(world: World, kind: EnemyKind, at?: Vec2): Enemy {
  const arch = ENEMIES[kind];
  const pos = at ? { x: at.x, z: at.z } : ringPosition(world, arch.radius);
  clampToArena(pos, arch.radius);
  let maxHp: number;
  let damageMul = 1;
  if (kind === 'boss') maxHp = currentZoneDef(world)?.guardianHp ?? arch.maxHp;
  else if (kind === 'legendary') maxHp = world.rules.shrine.legendaryHp;
  else {
    const sc = normalEnemyScaling(world);
    maxHp = Math.round(arch.maxHp * sc.hp);
    damageMul = sc.damage;
  }
  const e: Enemy = {
    id: world.nextId++,
    kind,
    pos,
    hp: maxHp,
    maxHp,
    radius: arch.radius,
    ai: 'chase',
    aiTimer: 0,
    hitFlash: 0,
    slamTimer: kind === 'boss' || kind === 'legendary' ? BOSS_SLAM.firstDelay : 0,
    damageMul,
    challenge: false,
  };
  world.enemies.push(e);
  return e;
}

function updateEnemies(world: World, dt: number): void {
  const p = world.player;
  for (const e of world.enemies) {
    const arch = ENEMIES[e.kind];
    const big = e.kind === 'boss' || e.kind === 'legendary';
    const slam = e.kind === 'legendary' ? LEGENDARY_SLAM : BOSS_SLAM;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (big && e.slamTimer > 0) e.slamTimer = Math.max(0, e.slamTimer - dt);
    const dx = p.pos.x - e.pos.x;
    const dz = p.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    const touching = e.radius + p.radius;

    if (e.ai === 'chase') {
      if (big && e.slamTimer <= 0 && d <= slam.triggerRange) {
        e.ai = 'slam';
        e.aiTimer = slam.windup;
        world.events.push({ type: 'bossSlamWindup', id: e.id, radius: slam.radius });
      } else if (d <= touching + arch.reach) {
        e.ai = 'windup';
        e.aiTimer = arch.windup;
        world.events.push({ type: 'enemyWindup', id: e.id });
      } else if (d > 1e-6) {
        e.pos.x += (dx / d) * arch.speed * dt;
        e.pos.z += (dz / d) * arch.speed * dt;
      }
    } else if (e.ai === 'windup') {
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        // Strike resolves now: lands only if the player is still close enough.
        if (d <= touching + arch.reach + STRIKE_GRACE) damagePlayer(world, Math.round(arch.damage * e.damageMul));
        e.ai = 'recover';
        e.aiTimer = arch.recover;
        if (world.phase !== 'playing') return;
      }
    } else if (e.ai === 'slam') {
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        const hit = d <= slam.radius + p.radius;
        world.events.push({ type: 'bossSlam', id: e.id, radius: slam.radius, hit });
        if (hit) damagePlayer(world, slam.damage);
        e.ai = 'recover';
        e.aiTimer = slam.recover;
        e.slamTimer = slam.cooldown;
        if (world.phase !== 'playing') return;
      }
    } else {
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) e.ai = 'chase';
    }
  }
  separateEnemies(world);
  for (const e of world.enemies) {
    pushOutOfObstacles(world.map.obstacles, e.pos, e.radius);
    clampToArena(e.pos, e.radius);
  }
}

function separateEnemies(world: World): void {
  const list = world.enemies;
  const heavy = (e: Enemy) => e.kind === 'boss' || e.kind === 'legendary';
  for (let i = 0; i < list.length; i++) {
    const a = list[i]!;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j]!;
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        // guardians/legendaries are heavy: small enemies get pushed, they barely move
        const wa = heavy(a) && !heavy(b) ? 0.1 : heavy(b) && !heavy(a) ? 0.9 : 0.5;
        const push = min - d;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push * wa;
        a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * (1 - wa);
        b.pos.z += nz * push * (1 - wa);
      }
    }
  }
}

export function damagePlayer(world: World, amount: number): boolean {
  const p = world.player;
  // once the Legendary is defeated the run is won; nothing can turn it into a defeat
  if (world.phase !== 'playing' || world.victory || p.invulnTimer > 0 || amount <= 0) return false;
  p.hp = Math.max(0, p.hp - amount);
  p.invulnTimer = PLAYER_BASE.invulnAfterHit;
  world.stats.damageTaken += amount;
  world.events.push({ type: 'playerHit', damage: amount, hp: p.hp });
  if (p.hp <= 0) {
    failActiveChallenge(world, 'defeat');
    endRun(world, 'defeat');
    world.events.push({ type: 'defeated', time: world.time, kills: world.stats.kills, level: p.level });
  }
  return true;
}

function nearestEnemy(world: World, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = range * range;
  for (const e of world.enemies) {
    const d = dist2(e.pos, world.player.pos);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function updatePlayerAttack(world: World, dt: number): void {
  const p = world.player;
  p.attackTimer -= dt;
  if (p.attackTimer > 0) return;
  const target = nearestEnemy(world, p.attackRange);
  if (!target) {
    p.attackTimer = 0; // ready to fire the moment something is in range
    return;
  }
  p.attackTimer = p.attackCooldown;
  const base = Math.atan2(target.pos.z - p.pos.z, target.pos.x - p.pos.x);
  const spread = 0.18;
  for (let i = 0; i < p.projectileCount; i++) {
    const offset = (i - (p.projectileCount - 1) / 2) * spread;
    const a = base + offset;
    world.projectiles.push({
      id: world.nextId++,
      pos: { x: p.pos.x, z: p.pos.z },
      vel: { x: Math.cos(a) * p.projectileSpeed, z: Math.sin(a) * p.projectileSpeed },
      damage: p.damage,
      ttl: PLAYER_BASE.projectileTtl,
      radius: 0.3,
    });
  }
  p.facing = { x: Math.cos(base), z: Math.sin(base) };
  world.events.push({ type: 'shot', count: p.projectileCount });
}

function updatePulse(world: World, dt: number): void {
  const p = world.player;
  if (p.pulseLevel <= 0) return;
  p.pulseTimer -= dt;
  if (p.pulseTimer > 0) return;
  p.pulseTimer = PULSE.cooldown(p.pulseLevel);
  const radius = PULSE.radius(p.pulseLevel);
  const dmg = Math.round(p.damage * PULSE.damageMultiplier(p.pulseLevel));
  let hits = 0;
  for (const e of [...world.enemies]) {
    const reach = radius + e.radius;
    if (dist2(e.pos, p.pos) <= reach * reach) {
      hits++;
      hitEnemy(world, e, dmg);
    }
  }
  world.events.push({ type: 'pulse', radius, hits });
}

function updateProjectiles(world: World, dt: number): void {
  const survivors: Projectile[] = [];
  for (const pr of world.projectiles) {
    pr.pos.x += pr.vel.x * dt;
    pr.pos.z += pr.vel.z * dt;
    pr.ttl -= dt;
    let consumed = false;
    for (const e of world.enemies) {
      const r = pr.radius + e.radius;
      if (dist2(pr.pos, e.pos) <= r * r) {
        hitEnemy(world, e, pr.damage);
        consumed = true;
        break;
      }
    }
    const out = Math.abs(pr.pos.x) > ARENA_HALF_SIZE || Math.abs(pr.pos.z) > ARENA_HALF_SIZE;
    if (!consumed && pr.ttl > 0 && !out) survivors.push(pr);
  }
  world.projectiles = survivors;
}

export function hitEnemy(world: World, e: Enemy, damage: number): void {
  if (e.hp <= 0 || isRunOver(world)) return;
  const dealt = Math.min(e.hp, damage);
  e.hp -= dealt;
  e.hitFlash = 0.12;
  world.stats.damageDealt += dealt;
  world.events.push({ type: 'enemyHit', id: e.id, damage: dealt });
  if (e.hp <= 0) {
    world.enemies = world.enemies.filter((x) => x !== e);
    world.stats.kills++;
    world.orbs.push({ id: world.nextId++, pos: { x: e.pos.x, z: e.pos.z }, value: ENEMIES[e.kind].xp });
    world.events.push({ type: 'enemyKilled', id: e.id, kind: e.kind, pos: { x: e.pos.x, z: e.pos.z } });
    onEnemyKilled(world, e);
  }
}

/** Map progression reacts only to the real HP-zero defeat of the awakened Guardian / Legendary. */
function onEnemyKilled(world: World, e: Enemy): void {
  const m = world.map;
  if (e.challenge && m.challenge?.state === 'active') {
    m.challenge.remaining = Math.max(0, m.challenge.remaining - 1);
    if (m.challenge.remaining === 0) {
      m.challenge.state = 'won';
      world.stats.challengesWon++;
      // GUIDE #11 says a Great Ball is earned; NOT granted here until run-only items + earned-event provenance exist.
      world.events.push({ type: 'challengeWon', zone: m.index + 1 });
    }
    return;
  }
  if (e.id !== m.bossId) return;
  if (m.kind === 'zone' && e.kind === 'boss' && m.state === 'guardian') {
    world.stats.guardiansDefeated++;
    m.state = 'portal';
    m.bossId = null;
    if (m.altar) m.altar.state = 'spent';
    // PROTOTYPE placement: the portal opens at the guardian's altar.
    m.portal = { ...(m.altar?.pos ?? { x: 0, z: 0 }) };
    world.events.push({ type: 'guardianDefeated', id: e.id, zone: m.index + 1 });
    world.events.push({ type: 'portalOpened', zone: m.index + 1, pos: { ...m.portal }, toShrine: m.index === m.zoneCount - 1 });
  } else if (m.kind === 'shrine' && e.kind === 'legendary' && m.state === 'legendary' && !world.victory) {
    // OWNER RULE: this defeat IS the run victory — recorded exactly once, here.
    world.stats.legendaryDefeated = true;
    world.victory = { time: world.time };
    m.state = 'cleared';
    m.bossId = null;
    m.portal = { ...world.rules.shrine.exitPortal };
    world.events.push({ type: 'legendaryDefeated', id: e.id });
    world.events.push({ type: 'runVictory', time: world.time });
    world.events.push({ type: 'exitPortalOpened', pos: { ...m.portal } });
  }
}

// ---------- explicit player actions (the "action button") ----------

function within(world: World, pos: Vec2 | null | undefined, range: number): boolean {
  return !!pos && dist2(pos, world.player.pos) <= range * range;
}

/** Which action the action button would perform right now (null = nothing in reach). */
export function availableAction(world: World): ActionKind | null {
  if (world.phase !== 'playing') return null;
  const m = world.map;
  if (m.kind === 'shrine') return m.state === 'cleared' && world.victory && within(world, m.portal, PORTAL.activateRange) ? 'exit-stage' : null;
  if (m.state === 'explore' && m.altar?.state === 'dormant' && within(world, m.altar.pos, ALTAR.activateRange)) return 'wake-guardian';
  if (m.challenge?.state === 'idle' && within(world, m.challenge.pos, CHALLENGE.activateRange)) return 'start-challenge';
  if (m.state === 'portal' && within(world, m.portal, PORTAL.activateRange)) return 'enter-portal';
  return null;
}

/** Wake the zone's Guardian at its altar. Only once per zone, only while standing at the altar. */
export function wakeGuardian(world: World): boolean {
  if (availableAction(world) !== 'wake-guardian') return false;
  const m = world.map;
  const altar = m.altar!;
  world.events = [];
  altar.state = 'awakened';
  // spawn a few units beyond the altar, away from the player, so the fight starts at a readable distance
  const dx = altar.pos.x - world.player.pos.x;
  const dz = altar.pos.z - world.player.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const g = spawnEnemy(world, 'boss', { x: altar.pos.x + (dx / d) * 6, z: altar.pos.z + (dz / d) * 6 });
  m.bossId = g.id;
  m.state = 'guardian';
  world.events.push({ type: 'guardianAwakened', id: g.id, zone: m.index + 1 });
  return true;
}

/** Start the zone's Challenge altar: a genuine wave of ONE species that must all be defeated. Once per zone. */
export function startChallenge(world: World): boolean {
  if (availableAction(world) !== 'start-challenge') return false;
  const c = world.map.challenge!;
  world.events = [];
  const n = world.rules.challengeWaveSize;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + randRange(world.rng, -0.2, 0.2);
    const r = randRange(world.rng, CHALLENGE.spawnRingMin, CHALLENGE.spawnRingMax);
    const e = spawnEnemy(world, c.species, { x: c.pos.x + Math.cos(a) * r, z: c.pos.z + Math.sin(a) * r });
    e.challenge = true;
  }
  c.state = 'active';
  c.total = n;
  c.remaining = n;
  world.events.push({ type: 'challengeStarted', zone: world.map.index + 1, species: c.species, total: n });
  return true;
}

function failActiveChallenge(world: World, reason: 'defeat' | 'left-zone'): void {
  const c = world.map.challenge;
  if (c?.state !== 'active') return;
  c.state = 'failed';
  world.stats.challengesFailed++;
  world.events.push({ type: 'challengeFailed', zone: world.map.index + 1, reason });
}

export function canActivatePortal(world: World): boolean {
  return availableAction(world) === 'enter-portal';
}

export function distanceToPortal(world: World): number | null {
  const portal = world.map.portal;
  return portal ? Math.sqrt(dist2(portal, world.player.pos)) : null;
}

/**
 * Enter the open portal (explicit action while standing in it). Zones 1-2 -> next zone's new map;
 * zone 3 -> the Shrine. Never ends the run.
 */
export function activatePortal(world: World): boolean {
  if (!canActivatePortal(world)) return false;
  world.events = [];
  failActiveChallenge(world, 'left-zone');
  const from = world.map.index;
  world.stats.zonesCleared++;
  // Run-only progress is kept (level, upgrades, HP). XP orbs already earned on the ground are collected.
  const earned = world.orbs.reduce((sum, o) => sum + o.value, 0);
  world.enemies = [];
  world.projectiles = [];
  world.orbs = [];
  world.player.pos = { x: 0, z: 0 };
  world.spawnTimer = SPAWN.initialDelay;
  if (from + 1 < world.rules.zones.length) {
    world.map = zoneMap(world.rules, from + 1);
    world.events.push({ type: 'zoneTransition', from: from + 1, to: from + 2 });
  } else {
    world.map = shrineMap(world.rules);
    world.player.pos = { x: 0, z: 10 };
    world.events.push({ type: 'shrineEntered' });
  }
  if (earned > 0) gainXp(world, earned);
  return true;
}

/**
 * Leave the stage through the post-victory exit portal. Only possible after the Legendary's defeat and while
 * standing in the portal. Ends the run with the ALREADY-recorded victory; it never records a second one.
 */
export function exitStage(world: World): boolean {
  if (availableAction(world) !== 'exit-stage') return false;
  world.events = [{ type: 'stageExited', time: world.time }];
  endRun(world, 'victory', true);
  return true;
}

/** Perform whatever the action button currently offers. */
export function performAction(world: World): ActionKind | null {
  const a = availableAction(world);
  if (a === 'wake-guardian') return wakeGuardian(world) ? a : null;
  if (a === 'start-challenge') return startChallenge(world) ? a : null;
  if (a === 'enter-portal') return activatePortal(world) ? a : null;
  if (a === 'exit-stage') return exitStage(world) ? a : null;
  return null;
}

/** Player chooses to abandon the run. Distinct from defeat and from the shrine outcome; grants nothing. */
export function quitRun(world: World): boolean {
  if (isRunOver(world)) return false;
  if (world.victory) {
    // the run was already won at the Legendary's defeat; leaving early keeps that single victory
    endRun(world, 'victory', false);
    world.events = [{ type: 'quit', time: world.time }];
    return true;
  }
  endRun(world, 'quit');
  world.events = [{ type: 'quit', time: world.time }];
  return true;
}

function updateOrbs(world: World, dt: number): void {
  const p = world.player;
  const remaining: XpOrb[] = [];
  for (const o of world.orbs) {
    const dx = p.pos.x - o.pos.x;
    const dz = p.pos.z - o.pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= p.radius + ORB.collectPadding) {
      gainXp(world, o.value);
      continue;
    }
    if (d <= p.magnetRadius) {
      const stepLen = Math.min(d, ORB.pullSpeed * dt);
      o.pos.x += (dx / d) * stepLen;
      o.pos.z += (dz / d) * stepLen;
    }
    remaining.push(o);
  }
  world.orbs = remaining;
}

function gainXp(world: World, value: number): void {
  const p = world.player;
  p.xp += value;
  world.stats.xpCollected += value;
  world.events.push({ type: 'xpCollected', value });
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    world.pendingLevelUps += 1;
  }
  if (world.pendingLevelUps > 0 && world.phase === 'playing') openLevelUp(world);
}

function openLevelUp(world: World): void {
  const p = world.player;
  const pool = UPGRADE_ORDER.filter((id) => UPGRADES[id].eligible(p));
  const choices: UpgradeId[] = [];
  while (choices.length < 3 && pool.length > 0) {
    const idx = Math.floor(world.rng.next() * pool.length);
    choices.push(pool.splice(idx, 1)[0]!);
  }
  if (choices.length === 0) {
    world.pendingLevelUps = 0;
    return;
  }
  world.phase = 'levelup';
  world.choices = choices;
  world.events.push({ type: 'levelUp', level: p.level - world.pendingLevelUps + 1, choices: [...choices] });
}

/** Apply one of the offered upgrades. Returns false (no change) for invalid picks. */
export function chooseUpgrade(world: World, index: number): boolean {
  if (world.phase !== 'levelup' || !world.choices) return false;
  if (!Number.isInteger(index) || index < 0 || index >= world.choices.length) return false;
  const id = world.choices[index]!;
  UPGRADES[id].apply(world.player);
  world.player.upgradesTaken.push(id);
  world.pendingLevelUps -= 1;
  world.choices = null;
  world.phase = 'playing';
  world.events = [{ type: 'upgradeChosen', id }];
  if (world.pendingLevelUps > 0) openLevelUp(world);
  return true;
}
