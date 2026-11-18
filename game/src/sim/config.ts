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
  /** Unown altar (GUIDE #11: stay in its circle until it fills up, then pick a blessing) */
  unown: { x: number; z: number };
  /** Challenge altar (GUIDE #11: a wave of one species) */
  challenge: { x: number; z: number; species: 'chaser' | 'brute' };
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
  /** where the stage-exit portal opens after the Legendary's defeat (PROTOTYPE placement) */
  exitPortal: { x: number; z: number };
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
  /** PLACEHOLDER: seconds of standing in the Unown circle to fill it (guide gives no number) */
  unownChargeSeconds: number;
  /** PLACEHOLDER: size of the Challenge altar's one-species wave (guide gives no number) */
  challengeWaveSize: number;
  /** Unown blessing effect table (empty until evidence) and rarity odds (unknown until evidence) */
  blessingEffects: readonly BlessingEffectEvidence[];
  rarityOdds: RarityOddsEvidence;
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
    unown: { x: -20, z: 4 },
    challenge: { x: 20, z: 4, species: 'chaser' },
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
    unown: { x: -8, z: -22 },
    challenge: { x: -20, z: 20, species: 'brute' },
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
    unown: { x: 22, z: -20 },
    challenge: { x: 8, z: -8, species: 'chaser' },
    enemyHpMul: 2.4,
    spawnIntervalMul: 0.75,
    bruteUnlockTime: 0,
    bruteChance: 0.25,
    guardianHp: 2400,
  },
];

export const SHRINE: ShrineDef = { name: 'Shrine', ground: 0x6b5fa8, obstacles: ring(8, 20, 1.2), legendaryHp: 4000, introDelay: 3, exitPortal: { x: 0, z: 0 } };

/**
 * Unown blessings. Evidence: guide #11 ("pick a blessing") + OWNER CORRECTION 2026-11-18 (tracker):
 * blessings are selectable STAT BUFFS with FOUR RARITIES — Common (grey), Rare (blue), Epic (purple),
 * Legendary (gold) — and a choice shows THREE randomized options whose rarity is influenced by LUCK.
 * NOT established: rarity probabilities, the Luck formula, which buffs exist, amounts, stacking, rerolls.
 * Rarity (how rare an option is) and effect (what it does) are kept separate on purpose.
 */
export const BLESSING_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type BlessingRarity = (typeof BLESSING_RARITIES)[number];

export const RARITY_STYLE: Record<BlessingRarity, { label: string; color: string }> = {
  common: { label: 'Common', color: '#9aa0a6' },
  rare: { label: 'Rare', color: '#3d8bff' },
  epic: { label: 'Epic', color: '#a259ff' },
  legendary: { label: 'Legendary', color: '#ffc928' },
};

/** Owner rule: a blessing choice presents three options. */
export const BLESSING_OPTION_COUNT = 3;

/**
 * Rarity odds. Authentic weights and the Luck formula are UNKNOWN, so `weights` is null.
 * While null, the game uses the explicitly-labelled PLACEHOLDER equal draw below and records
 * `rarityEvidenced: false` on every option; Luck is passed in but NOT applied. Replace with evidence only.
 */
export interface RarityOddsEvidence {
  /** relative weight per rarity at Luck 0; null = unknown */
  weights: Record<BlessingRarity, number> | null;
  /** how Luck shifts the weights; null = unknown (Luck ignored) */
  luckFormula: ((weights: Record<BlessingRarity, number>, luck: number) => Record<BlessingRarity, number>) | null;
  source: string | null;
}
export const RARITY_ODDS_EVIDENCE: RarityOddsEvidence = { weights: null, luckFormula: null, source: null };

/** Stats the simulation knows how to buff. This is an implementation capability, NOT evidence of which stats blessings use. */
export type BlessingStat = 'damage' | 'attackSpeed' | 'moveSpeed' | 'maxHp';

/** One known blessing effect. Applied only when stat + positive amount + cited source are all present. */
export interface BlessingEffectEvidence {
  rarity: BlessingRarity;
  stat: BlessingStat;
  /** damage / maxHp: flat add; attackSpeed / moveSpeed: fractional bonus (0.1 = +10%) */
  amount: number;
  source: string;
}

/** No effects are documented yet: empty, so every option shows "effect pending evidence" and does nothing. */
export const BLESSING_EFFECT_EVIDENCE: readonly BlessingEffectEvidence[] = [];

export function blessingIsEvidenced(e: BlessingEffectEvidence | null | undefined): e is BlessingEffectEvidence {
  return !!e && (BLESSING_RARITIES as readonly string[]).includes(e.rarity) && !!e.stat && Number.isFinite(e.amount) && e.amount > 0 && !!e.source;
}

export const FINAL_SWARM_PLACEHOLDER: FinalSwarmRules = { hpMulBase: 2, hpMulPerMinute: 0.5, damageMulBase: 1.5, damageMulPerMinute: 0.25, spawnIntervalMul: 0.6 };

export const NORMAL_RULES: RunRules = {
  label: 'normal',
  zones: ZONES,
  zoneSeconds: 600,
  shrine: SHRINE,
  finalSwarm: FINAL_SWARM_PLACEHOLDER,
  enemyHpGrowthPerMinute: 0.15,
  unownChargeSeconds: 6,
  challengeWaveSize: 15,
  blessingEffects: BLESSING_EFFECT_EVIDENCE,
  rarityOdds: RARITY_ODDS_EVIDENCE,
};

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
  unownChargeSeconds: 3,
  challengeWaveSize: 6,
  blessingEffects: BLESSING_EFFECT_EVIDENCE,
  rarityOdds: RARITY_ODDS_EVIDENCE,
};

/** While a guardian/legendary is awake or a portal is up, normal spawns slow down by this factor. */
export const BOSS_PHASE_SPAWN_MUL = 1.8;

export const ALTAR = { activateRange: 2.6 };
/** Unown circle radius (placeholder) */
export const UNOWN = { radius: 3.2 };
/** Challenge wave spawns on a ring around its altar (placeholder geometry) */
export const CHALLENGE = { activateRange: 2.6, spawnRingMin: 9, spawnRingMax: 13 };

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
