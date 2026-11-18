import type { PlayerState } from './world.ts';

export type UpgradeId = 'power' | 'haste' | 'swift' | 'vitality' | 'multishot' | 'magnet' | 'pulse';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  describe(p: PlayerState): string;
  eligible(p: PlayerState): boolean;
  apply(p: PlayerState): void;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  power: {
    id: 'power',
    name: 'Power Up',
    describe: (p) => `Shot damage ${p.damage} → ${p.damage + 4}`,
    eligible: () => true,
    apply: (p) => {
      p.damage += 4;
    },
  },
  haste: {
    id: 'haste',
    name: 'Quick Fire',
    describe: (p) => `Attack every ${p.attackCooldown.toFixed(2)}s → ${Math.max(0.15, p.attackCooldown * 0.85).toFixed(2)}s`,
    eligible: (p) => p.attackCooldown > 0.15,
    apply: (p) => {
      p.attackCooldown = Math.max(0.15, p.attackCooldown * 0.85);
    },
  },
  swift: {
    id: 'swift',
    name: 'Swift Feet',
    describe: (p) => `Move speed ${p.speed.toFixed(1)} → ${(p.speed + 0.8).toFixed(1)}`,
    eligible: (p) => p.speed < 12,
    apply: (p) => {
      p.speed += 0.8;
    },
  },
  vitality: {
    id: 'vitality',
    name: 'Vitality',
    describe: (p) => `Max HP ${p.maxHp} → ${p.maxHp + 20} and heal 20`,
    eligible: () => true,
    apply: (p) => {
      p.maxHp += 20;
      p.hp = Math.min(p.maxHp, p.hp + 20);
    },
  },
  multishot: {
    id: 'multishot',
    name: 'Multi Shot',
    describe: (p) => `Projectiles ${p.projectileCount} → ${p.projectileCount + 1}`,
    eligible: (p) => p.projectileCount < 5,
    apply: (p) => {
      p.projectileCount += 1;
    },
  },
  magnet: {
    id: 'magnet',
    name: 'Magnet',
    describe: (p) => `XP pickup radius ${p.magnetRadius.toFixed(1)} → ${(p.magnetRadius + 1.5).toFixed(1)}`,
    eligible: (p) => p.magnetRadius < 12,
    apply: (p) => {
      p.magnetRadius += 1.5;
    },
  },
  pulse: {
    id: 'pulse',
    name: 'Shock Pulse',
    describe: (p) => (p.pulseLevel === 0 ? 'New ability: periodic shock ring around you' : `Shock Pulse level ${p.pulseLevel} → ${p.pulseLevel + 1}`),
    eligible: (p) => p.pulseLevel < 5,
    apply: (p) => {
      p.pulseLevel += 1;
      if (p.pulseLevel === 1) p.pulseTimer = 0.5;
    },
  },
};

export const UPGRADE_ORDER: readonly UpgradeId[] = ['power', 'haste', 'swift', 'vitality', 'multishot', 'magnet', 'pulse'];
