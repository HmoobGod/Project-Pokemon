/**
 * Original placeholder tuning for the vertical slice.
 * These numbers are NOT taken from PokéBonk and are not authoritative game rules.
 */
export const ARENA_HALF_SIZE = 30;

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

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

export type EnemyKind = 'chaser' | 'brute' | 'boss' | 'legendary';

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
  /** zone Guardian; maxHp comes from the zone definition */
  boss: { maxHp: 700, speed: 2.7, radius: 1.6, damage: 22, reach: 0.8, windup: 0.8, recover: 0.9, xp: 15 },
  /** shrine Legendary; maxHp comes from the shrine definition */
  legendary: { maxHp: 4000, speed: 2.5, radius: 2.2, damage: 30, reach: 1.0, windup: 0.9, recover: 1.0, xp: 40 },
};

/** Guardian/Legendary telegraphed ground slam: a ring that hits everything nearby after a visible wind-up. */
export const BOSS_SLAM = { cooldown: 5.5, triggerRange: 6.5, windup: 1.1, radius: 4.5, damage: 18, recover: 0.8, firstDelay: 3 };
export const LEGENDARY_SLAM = { ...BOSS_SLAM, cooldown: 4.5, triggerRange: 8, radius: 5.5, damage: 24 };

/**
 * One zone = one map context. GUIDE (#01): a classic run is 3 zones of 10 minutes, each on a new map;
 * the guardian is woken at its altar; its defeat opens the portal to the next zone.
 * Layout, colours, HP numbers and scaling below are ORIGINAL PROTOTYPE values, not authentic PokéBonk data.
 */
export interface ZoneDef {
  name: string;
  ground: number;
  obstacles: readonly Obstacle[];
  altar: { x: number; z: number };
  enemyHpMul: number;
  spawnIntervalMul: number;
  bruteUnlockTime: number;
  bruteChance: number;
  guardianHp: number;
}

export interface ShrineDef {
  name: string;
  ground: number;
  obstacles: readonly Obstacle[];
  legendaryHp: number;
  /** seconds between arriving and the Legendary appearing */
  introDelay: number;
}

/**
 * Final Swarm (GUIDE #01: "When time runs out the Final Swarm comes: the wild Pokémon become brutally tough").
 * The guide gives no numbers: every coefficient here is a DESIGN PLACEHOLDER (UNVERIFIED), to be re-tuned
 * from owner gameplay evidence. Applies to normal enemies spawned during overtime only.
 */
export interface FinalSwarmRules {
  hpMulBase: number;
  hpMulPerMinute: number;
  damageMulBase: number;
  damageMulPerMinute: number;
  spawnIntervalMul: number;
}

export interface RunRules {
  label: 'normal' | 'short-test';
  zones: readonly ZoneDef[];
  /** active (unpaused) seconds per zone before the Final Swarm */
  zoneSeconds: number;
  shrine: ShrineDef;
  finalSwarm: FinalSwarmRules;
  /** PROTOTYPE: gradual in-zone toughening of normal enemies (owner: enemies get stronger over time). */
  enemyHpGrowthPerMinute: number;
}

const ring = (n: number, r: number, radius: number, phase = 0): Obstacle[] =>
  Array.from({ length: n }, (_, i) => ({ x: Math.cos(phase + (i / n) * Math.PI * 2) * r, z: Math.sin(phase + (i / n) * Math.PI * 2) * r, radius }));

export const ZONES: readonly ZoneDef[] = [
  {
    name: 'Grove',
    ground: 0x7cc35a,
    obstacles: [
      { x: -12, z: -12, radius: 1.6 },
      { x: 12, z: -12, radius: 1.6 },
      { x: -12, z: 12, radius: 1.6 },
      { x: 12, z: 12, radius: 1.6 },
    ],
    altar: { x: 0, z: -20 },
    enemyHpMul: 1,
    spawnIntervalMul: 1,
    bruteUnlockTime: 45,
    bruteChance: 0.12,
    guardianHp: 700,
  },
  {
    name: 'Dunes',
    ground: 0xd8b66a,
    obstacles: [
      { x: -18, z: 4, radius: 2.4 },
      { x: 6, z: -16, radius: 1.8 },
      { x: 15, z: 16, radius: 2.0 },
      { x: -6, z: 18, radius: 1.4 },
      { x: 20, z: -4, radius: 1.4 },
    ],
    altar: { x: 18, z: 6 },
    enemyHpMul: 1.6,
    spawnIntervalMul: 0.85,
    bruteUnlockTime: 0,
    bruteChance: 0.18,
    guardianHp: 1400,
  },
  {
    name: 'Frost',
    ground: 0xc4e4ef,
    obstacles: ring(6, 15, 1.5, 0.3),
    altar: { x: -18, z: 16 },
    enemyHpMul: 2.4,
    spawnIntervalMul: 0.75,
    bruteUnlockTime: 0,
    bruteChance: 0.25,
    guardianHp: 2400,
  },
];

export const SHRINE: ShrineDef = { name: 'Shrine', ground: 0x6b5fa8, obstacles: ring(8, 20, 1.2), legendaryHp: 4000, introDelay: 3 };

export const FINAL_SWARM_PLACEHOLDER: FinalSwarmRules = { hpMulBase: 2, hpMulPerMinute: 0.5, damageMulBase: 1.5, damageMulPerMinute: 0.25, spawnIntervalMul: 0.6 };

export const NORMAL_RULES: RunRules = { label: 'normal', zones: ZONES, zoneSeconds: 600, shrine: SHRINE, finalSwarm: FINAL_SWARM_PLACEHOLDER, enemyHpGrowthPerMinute: 0.15 };

/**
 * SHORT TEST preset (URL ?preset=short): same mechanics, 30-second zone clocks and small guardian/legendary HP,
 * so an automated browser test can reach the Final Swarm, every altar, portal and the shrine in real time.
 * Shown on-screen as SHORT TEST PRESET. Grants nothing.
 */
export const SHORT_RULES: RunRules = {
  label: 'short-test',
  zones: ZONES.map((z) => ({ ...z, enemyHpMul: 1, spawnIntervalMul: 1, bruteUnlockTime: 999, bruteChance: 0, guardianHp: 120 })),
  zoneSeconds: 30,
  shrine: { ...SHRINE, legendaryHp: 200, introDelay: 2 },
  // milder than normal so a scripted browser bot reliably survives; still exercises the same overtime scaling
  finalSwarm: { hpMulBase: 1.3, hpMulPerMinute: 0.5, damageMulBase: 1.0, damageMulPerMinute: 0.25, spawnIntervalMul: 1 },
  enemyHpGrowthPerMinute: 0,
};

/** While a guardian/legendary is awake or a portal is up, normal spawns slow down by this factor. */
export const BOSS_PHASE_SPAWN_MUL = 1.8;

export const ALTAR = { activateRange: 2.6 };
export const PORTAL = { activateRange: 2.2 };

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
