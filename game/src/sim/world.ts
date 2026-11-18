/**
 * Pure gameplay simulation for the vertical slice. No rendering, DOM or network here,
 * so the rules can be unit tested and later run inside an offline Android WebView.
 *
 * Run structure: each stage = defeat its KO quota of normal enemies -> its boss spawns ->
 * defeat the boss -> a portal opens -> the player walks into it and explicitly activates it.
 * Activating a non-final portal moves to the next stage; activating the final portal is the
 * (only) way to achieve a completed victory. Defeat, quit and victory are distinct outcomes.
 * No currency, rewards or unlocks exist in this prototype.
 */
import { createRng, randRange, type Rng } from './rng.ts';
import {
  ARENA_HALF_SIZE,
  BOSS_PHASE_SPAWN_MUL,
  BOSS_SLAM,
  ENEMIES,
  OBSTACLES,
  ORB,
  PLAYER_BASE,
  PORTAL,
  PULSE,
  SPAWN,
  STAGES,
  STRIKE_GRACE,
  spawnInterval,
  xpToNext,
  type EnemyKind,
  type StageDef,
} from './config.ts';
import { UPGRADES, UPGRADE_ORDER, type UpgradeId } from './upgrades.ts';

export interface Vec2 {
  x: number;
  z: number;
}

export type Phase = 'playing' | 'levelup' | 'defeated' | 'victory' | 'quit';
export type Outcome = 'defeat' | 'victory' | 'quit';

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
  /** boss only: time until the next ground slam may start */
  slamTimer: number;
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

/** objective -> boss -> portal, per stage */
export type StageState = 'objective' | 'boss' | 'portal';

export interface StageProgress {
  index: number;
  count: number;
  name: string;
  state: StageState;
  stageTime: number;
  killQuota: number;
  /** normal-enemy KOs made during this stage's objective */
  kills: number;
  bossId: number | null;
  portal: Vec2 | null;
  isFinal: boolean;
}

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
  | { type: 'objectiveComplete'; stage: number }
  | { type: 'bossSpawned'; id: number; stage: number }
  | { type: 'bossSlamWindup'; id: number; radius: number }
  | { type: 'bossSlam'; id: number; radius: number; hit: boolean }
  | { type: 'bossDefeated'; id: number; stage: number }
  | { type: 'portalOpened'; stage: number; pos: Vec2; final: boolean }
  | { type: 'stageAdvanced'; stage: number }
  | { type: 'defeated'; time: number; kills: number; level: number }
  | { type: 'victory'; time: number }
  | { type: 'quit'; time: number };

export interface RunStats {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  xpCollected: number;
  bossesDefeated: number;
  stagesCleared: number;
}

export interface RunResult {
  outcome: Outcome;
  time: number;
  stageReached: number;
  stagesCleared: number;
  bossesDefeated: number;
  kills: number;
  level: number;
}

export interface World {
  seed: number;
  rng: Rng;
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
  stats: RunStats;
  stages: readonly StageDef[];
  stage: StageProgress;
  result: RunResult | null;
  /** events emitted during the most recent step/action (renderer/audio consume them) */
  events: GameEvent[];
}

export interface MoveInput {
  x: number;
  z: number;
}

export interface WorldOptions {
  stages?: readonly StageDef[];
}

function stageProgress(stages: readonly StageDef[], index: number): StageProgress {
  const def = stages[index]!;
  return {
    index,
    count: stages.length,
    name: def.name,
    state: 'objective',
    stageTime: 0,
    killQuota: def.killQuota,
    kills: 0,
    bossId: null,
    portal: null,
    isFinal: index === stages.length - 1,
  };
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  const stages = options.stages && options.stages.length > 0 ? options.stages : STAGES;
  return {
    seed,
    rng: createRng(seed),
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
      upgradesTaken: [],
    },
    enemies: [],
    projectiles: [],
    orbs: [],
    nextId: 1,
    spawnTimer: SPAWN.initialDelay,
    pendingLevelUps: 0,
    choices: null,
    stats: { kills: 0, damageDealt: 0, damageTaken: 0, xpCollected: 0, bossesDefeated: 0, stagesCleared: 0 },
    stages,
    stage: stageProgress(stages, 0),
    result: null,
    events: [],
  };
}

export function currentStageDef(world: World): StageDef {
  return world.stages[world.stage.index]!;
}

export function isRunOver(world: World): boolean {
  return world.phase === 'defeated' || world.phase === 'victory' || world.phase === 'quit';
}

function endRun(world: World, outcome: Outcome): void {
  world.phase = outcome === 'defeat' ? 'defeated' : outcome;
  world.choices = null;
  world.pendingLevelUps = 0;
  world.result = {
    outcome,
    time: world.time,
    stageReached: world.stage.index + 1,
    stagesCleared: world.stats.stagesCleared,
    bossesDefeated: world.stats.bossesDefeated,
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

function pushOutOfObstacles(p: Vec2, radius: number): void {
  for (const o of OBSTACLES) {
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
  if (world.phase !== 'playing') return; // paused for level-up choice or run over
  if (!(dt > 0)) return;
  dt = Math.min(dt, MAX_STEP);
  world.time += dt;
  world.stage.stageTime += dt;

  updatePlayer(world, rawInput, dt);
  updateSpawning(world, dt);
  updateEnemies(world, dt);
  if (world.phase !== 'playing') return;
  updatePlayerAttack(world, dt);
  updatePulse(world, dt);
  updateProjectiles(world, dt);
  updateOrbs(world, dt);
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
  pushOutOfObstacles(p.pos, p.radius);
  clampToArena(p.pos, p.radius);
  if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
}

function updateSpawning(world: World, dt: number): void {
  const def = currentStageDef(world);
  world.spawnTimer -= dt;
  while (world.spawnTimer <= 0) {
    const mul = def.spawnIntervalMul * (world.stage.state === 'objective' ? 1 : BOSS_PHASE_SPAWN_MUL);
    world.spawnTimer += spawnInterval(world.stage.stageTime) * mul;
    if (world.enemies.length >= SPAWN.maxEnemies) continue;
    const kind: EnemyKind = world.stage.stageTime >= def.bruteUnlockTime && world.rng.next() < def.bruteChance ? 'brute' : 'chaser';
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

export function spawnEnemy(world: World, kind: EnemyKind, at?: Vec2): Enemy {
  const arch = ENEMIES[kind];
  const pos = at ? { x: at.x, z: at.z } : ringPosition(world, arch.radius);
  const def = currentStageDef(world);
  const maxHp = kind === 'boss' ? def.bossHp : Math.round(arch.maxHp * def.enemyHpMul);
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
    slamTimer: kind === 'boss' ? BOSS_SLAM.firstDelay : 0,
  };
  world.enemies.push(e);
  return e;
}

function updateEnemies(world: World, dt: number): void {
  const p = world.player;
  for (const e of world.enemies) {
    const arch = ENEMIES[e.kind];
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    if (e.kind === 'boss' && e.slamTimer > 0) e.slamTimer = Math.max(0, e.slamTimer - dt);
    const dx = p.pos.x - e.pos.x;
    const dz = p.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    const touching = e.radius + p.radius;

    if (e.ai === 'chase') {
      if (e.kind === 'boss' && e.slamTimer <= 0 && d <= BOSS_SLAM.triggerRange) {
        e.ai = 'slam';
        e.aiTimer = BOSS_SLAM.windup;
        world.events.push({ type: 'bossSlamWindup', id: e.id, radius: BOSS_SLAM.radius });
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
        if (d <= touching + arch.reach + STRIKE_GRACE) damagePlayer(world, arch.damage);
        e.ai = 'recover';
        e.aiTimer = arch.recover;
        if (world.phase !== 'playing') return;
      }
    } else if (e.ai === 'slam') {
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) {
        const hit = d <= BOSS_SLAM.radius + p.radius;
        world.events.push({ type: 'bossSlam', id: e.id, radius: BOSS_SLAM.radius, hit });
        if (hit) damagePlayer(world, BOSS_SLAM.damage);
        e.ai = 'recover';
        e.aiTimer = BOSS_SLAM.recover;
        e.slamTimer = BOSS_SLAM.cooldown;
        if (world.phase !== 'playing') return;
      }
    } else {
      e.aiTimer -= dt;
      if (e.aiTimer <= 0) e.ai = 'chase';
    }
  }
  separateEnemies(world);
  for (const e of world.enemies) {
    pushOutOfObstacles(e.pos, e.radius);
    clampToArena(e.pos, e.radius);
  }
}

function separateEnemies(world: World): void {
  const list = world.enemies;
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
        // the boss is heavy: small enemies get pushed, it barely moves
        const wa = a.kind === 'boss' ? 0.1 : b.kind === 'boss' ? 0.9 : 0.5;
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
  if (world.phase !== 'playing' || p.invulnTimer > 0 || amount <= 0) return false;
  p.hp = Math.max(0, p.hp - amount);
  p.invulnTimer = PLAYER_BASE.invulnAfterHit;
  world.stats.damageTaken += amount;
  world.events.push({ type: 'playerHit', damage: amount, hp: p.hp });
  if (p.hp <= 0) {
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

/** Stage progression is driven only by actual KOs. */
function onEnemyKilled(world: World, e: Enemy): void {
  const st = world.stage;
  if (e.kind === 'boss') {
    if (st.state !== 'boss' || e.id !== st.bossId) return;
    world.stats.bossesDefeated++;
    world.events.push({ type: 'bossDefeated', id: e.id, stage: st.index + 1 });
    st.state = 'portal';
    st.bossId = null;
    st.portal = choosePortalPosition(world);
    world.events.push({ type: 'portalOpened', stage: st.index + 1, pos: { ...st.portal }, final: st.isFinal });
    return;
  }
  if (st.state !== 'objective') return;
  st.kills++;
  if (st.kills >= st.killQuota) {
    world.events.push({ type: 'objectiveComplete', stage: st.index + 1 });
    st.state = 'boss';
    const boss = spawnEnemy(world, 'boss', ringPosition(world, ENEMIES.boss.radius));
    st.bossId = boss.id;
    world.events.push({ type: 'bossSpawned', id: boss.id, stage: st.index + 1 });
  }
}

/** Portal appears at a fixed-candidate spot far enough from the player that reaching it is a real move. */
function choosePortalPosition(world: World): Vec2 {
  const lim = ARENA_HALF_SIZE - 4;
  const candidates: Vec2[] = [
    { x: 0, z: 0 },
    { x: 0, z: -lim },
    { x: 0, z: lim },
    { x: -lim, z: 0 },
    { x: lim, z: 0 },
  ];
  const p = world.player.pos;
  let best = candidates[0]!;
  let bestD = -1;
  for (const c of candidates) {
    const d = dist2(c, p);
    if (d >= PORTAL.minDistanceFromPlayer ** 2) return { ...c };
    if (d > bestD) {
      bestD = d;
      best = c;
    }
  }
  return { ...best };
}

export function distanceToPortal(world: World): number | null {
  const portal = world.stage.portal;
  if (!portal) return null;
  return Math.sqrt(dist2(portal, world.player.pos));
}

export function canActivatePortal(world: World): boolean {
  if (world.phase !== 'playing' || world.stage.state !== 'portal') return false;
  const d = distanceToPortal(world);
  return d !== null && d <= PORTAL.activateRange;
}

/**
 * Explicit player action. Returns false (and changes nothing) unless the portal is open and the
 * player is standing in it. Final portal -> completed victory; otherwise -> next stage.
 */
export function activatePortal(world: World): boolean {
  if (!canActivatePortal(world)) return false;
  world.events = [];
  const st = world.stage;
  world.stats.stagesCleared++;
  if (st.isFinal) {
    endRun(world, 'victory');
    world.events.push({ type: 'victory', time: world.time });
    return true;
  }
  // Next stage: XP orbs already earned on the ground are collected, everything else is cleared.
  const earned = world.orbs.reduce((sum, o) => sum + o.value, 0);
  world.enemies = [];
  world.projectiles = [];
  world.orbs = [];
  world.stage = stageProgress(world.stages, st.index + 1);
  world.player.pos = { x: 0, z: 0 };
  world.spawnTimer = SPAWN.initialDelay;
  world.events.push({ type: 'stageAdvanced', stage: world.stage.index + 1 });
  if (earned > 0) gainXp(world, earned);
  return true;
}

/** Player chooses to abandon the run. Distinct from defeat and victory; grants nothing. */
export function quitRun(world: World): boolean {
  if (isRunOver(world)) return false;
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
