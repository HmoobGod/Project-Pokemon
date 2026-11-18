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

export type EnemyKind = 'chaser' | 'brute';

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
};

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
