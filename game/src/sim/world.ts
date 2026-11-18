/**
 * Pure gameplay simulation for the vertical slice. No rendering, DOM or network here,
 * so the rules can be unit tested and later run inside an offline Android WebView.
 */
import { createRng, randRange, type Rng } from './rng.ts';
import {
  ARENA_HALF_SIZE,
  ENEMIES,
  OBSTACLES,
  ORB,
  PLAYER_BASE,
  PULSE,
  SPAWN,
  STRIKE_GRACE,
  spawnInterval,
  xpToNext,
  type EnemyKind,
} from './config.ts';
import { UPGRADES, UPGRADE_ORDER, type UpgradeId } from './upgrades.ts';

export interface Vec2 {
  x: number;
  z: number;
}

export type Phase = 'playing' | 'levelup' | 'defeated';

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

export type EnemyAiState = 'chase' | 'windup' | 'recover';

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
  | { type: 'defeated'; time: number; kills: number; level: number };

export interface RunStats {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  xpCollected: number;
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
  /** events emitted during the most recent step (renderer/audio consume them) */
  events: GameEvent[];
}

export interface MoveInput {
  x: number;
  z: number;
}

export function createWorld(seed: number): World {
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
    stats: { kills: 0, damageDealt: 0, damageTaken: 0, xpCollected: 0 },
    events: [],
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
  world.spawnTimer -= dt;
  while (world.spawnTimer <= 0) {
    world.spawnTimer += spawnInterval(world.time);
    if (world.enemies.length >= SPAWN.maxEnemies) continue;
    const kind: EnemyKind = world.time >= SPAWN.bruteUnlockTime && world.rng.next() < SPAWN.bruteChance ? 'brute' : 'chaser';
    spawnEnemy(world, kind);
  }
}

export function spawnEnemy(world: World, kind: EnemyKind, at?: Vec2): Enemy {
  const arch = ENEMIES[kind];
  let pos: Vec2;
  if (at) {
    pos = { x: at.x, z: at.z };
  } else {
    const angle = randRange(world.rng, 0, Math.PI * 2);
    const r = randRange(world.rng, SPAWN.ringMin, SPAWN.ringMax);
    pos = { x: world.player.pos.x + Math.cos(angle) * r, z: world.player.pos.z + Math.sin(angle) * r };
    clampToArena(pos, arch.radius);
  }
  const e: Enemy = {
    id: world.nextId++,
    kind,
    pos,
    hp: arch.maxHp,
    maxHp: arch.maxHp,
    radius: arch.radius,
    ai: 'chase',
    aiTimer: 0,
    hitFlash: 0,
  };
  world.enemies.push(e);
  return e;
}

function updateEnemies(world: World, dt: number): void {
  const p = world.player;
  for (const e of world.enemies) {
    const arch = ENEMIES[e.kind];
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
    const dx = p.pos.x - e.pos.x;
    const dz = p.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    const touching = e.radius + p.radius;

    if (e.ai === 'chase') {
      if (d <= touching + arch.reach) {
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
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
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
    world.phase = 'defeated';
    world.choices = null;
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
  if (e.hp <= 0) return;
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
  }
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
