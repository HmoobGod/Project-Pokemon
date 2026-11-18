/**
 * Original placeholder tuning for the vertical slice.
 * These numbers are NOT taken from PokéBonk and are not authoritative game rules.
 */
export const ARENA_HALF_SIZE = 30;

export const OBSTACLES: ReadonlyArray<{ x: number; z: number; radius: number }> = [
  { x: -12, z: -12, radius: 1.6 },
  { x: 12, z: -12, radius: 1.6 },
  { x: -12, z: 12, radius: 1.6 },
  { x: 12, z: 12, radius: 1.6 },
];

export const PLAYER_BASE = {
  radius: 0.6,
  maxHp: 100,
  speed: 7,
  damage: 10,
  attackCooldown: 0.7,
  attackRange: 14,
  projectileCount: 1,
  projectileSpeed: 22,
  projectileTtl: 0.9,
  magnetRadius: 3,
  invulnAfterHit: 0.6,
} as const;

export type EnemyKind = 'chaser' | 'brute' | 'boss';

export interface EnemyArchetype {
  maxHp: number;
  speed: number;
  radius: number;
  damage: number;
  /** distance (beyond touching) at which the enemy starts its attack wind-up */
  reach: number;
  windup: number;
  recover: number;
  xp: number;
}

export const ENEMIES: Record<EnemyKind, EnemyArchetype> = {
  chaser: { maxHp: 20, speed: 3.6, radius: 0.55, damage: 8, reach: 0.5, windup: 0.45, recover: 0.6, xp: 1 },
  brute: { maxHp: 90, speed: 2.4, radius: 1.0, damage: 18, reach: 0.7, windup: 0.7, recover: 0.9, xp: 5 },
  /** maxHp is replaced by the stage's bossHp when the boss spawns */
  boss: { maxHp: 600, speed: 2.7, radius: 1.6, damage: 22, reach: 0.8, windup: 0.8, recover: 0.9, xp: 15 },
};

/** Boss-only telegraphed ground slam: a ring that hits everything nearby after a visible wind-up. */
export const BOSS_SLAM = { cooldown: 5.5, triggerRange: 6.5, windup: 1.1, radius: 4.5, damage: 18, recover: 0.8, firstDelay: 3 };

export interface StageDef {
  name: string;
  /** normal-enemy KOs needed in this stage before its boss appears */
  killQuota: number;
  spawnIntervalMul: number;
  enemyHpMul: number;
  bruteUnlockTime: number;
  bruteChance: number;
  bossHp: number;
}

/** Normal rules: two stages, each cleared by KOs -> boss -> portal; the last portal is the victory exit. */
export const STAGES: readonly StageDef[] = [
  { name: 'Meadow', killQuota: 30, spawnIntervalMul: 1, enemyHpMul: 1, bruteUnlockTime: 45, bruteChance: 0.12, bossHp: 600 },
  { name: 'Dusk Field', killQuota: 40, spawnIntervalMul: 0.85, enemyHpMul: 1.4, bruteUnlockTime: 0, bruteChance: 0.18, bossHp: 1000 },
];

/**
 * SHORT test preset (URL ?preset=short): same mechanics, smaller quotas/boss HP so an automated
 * browser test can play the whole loop in real time. Shown on-screen as a test preset. Grants nothing.
 */
export const SHORT_STAGES: readonly StageDef[] = [
  { name: 'Meadow (short)', killQuota: 6, spawnIntervalMul: 1, enemyHpMul: 1, bruteUnlockTime: 999, bruteChance: 0, bossHp: 120 },
  { name: 'Dusk Field (short)', killQuota: 8, spawnIntervalMul: 1, enemyHpMul: 1, bruteUnlockTime: 999, bruteChance: 0, bossHp: 160 },
];

/** While a boss or portal is up, normal spawns slow down by this factor. */
export const BOSS_PHASE_SPAWN_MUL = 1.8;

export const PORTAL = { activateRange: 2.2, minDistanceFromPlayer: 12 };

/** Extra distance a strike still lands at, so stepping away during the wind-up dodges it. */
export const STRIKE_GRACE = 0.4;

export const SPAWN = {
  maxEnemies: 120,
  initialDelay: 1.0,
  bruteUnlockTime: 45,
  bruteChance: 0.12,
  ringMin: 16,
  ringMax: 22,
};

export function spawnInterval(timeSeconds: number): number {
  return Math.max(0.3, 1.5 - timeSeconds * 0.012);
}

export function xpToNext(level: number): number {
  return 5 + (level - 1) * 4;
}

export const ORB = { pullSpeed: 14, collectPadding: 0.3 };

export const PULSE = {
  cooldown: (level: number) => Math.max(1.5, 3.6 - 0.4 * level),
  radius: (level: number) => 3 + 0.6 * level,
  damageMultiplier: (level: number) => 0.8 + 0.2 * level,
};
