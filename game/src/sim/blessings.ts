/**
 * Unown blessing offers (pure, seeded). Rarity and effect are separate:
 *  - rarity: drawn per option; uses evidenced odds (+ Luck formula) when supplied, otherwise an explicitly
 *    flagged PLACEHOLDER equal draw that ignores Luck (rarityEvidenced=false, luckApplied=false).
 *  - effect: only an evidenced effect row of that rarity; otherwise null ("effect pending evidence").
 */
import type { Rng } from './rng.ts';
import {
  BLESSING_OPTION_COUNT,
  BLESSING_RARITIES,
  blessingIsEvidenced,
  type BlessingEffectEvidence,
  type BlessingRarity,
  type RarityOddsEvidence,
} from './config.ts';

export interface BlessingOption {
  rarity: BlessingRarity;
  effect: BlessingEffectEvidence | null;
  /** true only when the rarity came from evidenced odds */
  rarityEvidenced: boolean;
  /** true only when an evidenced Luck formula shaped the odds */
  luckApplied: boolean;
}

export function oddsAreEvidenced(odds: RarityOddsEvidence): boolean {
  if (!odds.weights || !odds.source) return false;
  return BLESSING_RARITIES.every((r) => Number.isFinite(odds.weights![r]) && odds.weights![r] >= 0) && BLESSING_RARITIES.some((r) => odds.weights![r] > 0);
}

export function rollRarity(rng: Rng, luck: number, odds: RarityOddsEvidence): { rarity: BlessingRarity; rarityEvidenced: boolean; luckApplied: boolean } {
  if (!oddsAreEvidenced(odds)) {
    // PLACEHOLDER (not authentic odds): equal chance per rarity, Luck not applied.
    const idx = Math.min(BLESSING_RARITIES.length - 1, Math.floor(rng.next() * BLESSING_RARITIES.length));
    return { rarity: BLESSING_RARITIES[idx]!, rarityEvidenced: false, luckApplied: false };
  }
  const base = odds.weights!;
  const w = odds.luckFormula ? odds.luckFormula({ ...base }, luck) : base;
  const total = BLESSING_RARITIES.reduce((s, r) => s + Math.max(0, w[r] ?? 0), 0);
  let roll = rng.next() * total;
  for (const r of BLESSING_RARITIES) {
    roll -= Math.max(0, w[r] ?? 0);
    if (roll < 0) return { rarity: r, rarityEvidenced: true, luckApplied: !!odds.luckFormula };
  }
  return { rarity: BLESSING_RARITIES[BLESSING_RARITIES.length - 1]!, rarityEvidenced: true, luckApplied: !!odds.luckFormula };
}

export function rollBlessingOffer(rng: Rng, luck: number, odds: RarityOddsEvidence, effects: readonly BlessingEffectEvidence[]): BlessingOption[] {
  const offer: BlessingOption[] = [];
  for (let i = 0; i < BLESSING_OPTION_COUNT; i++) {
    const r = rollRarity(rng, luck, odds);
    const pool = effects.filter((e) => e.rarity === r.rarity && blessingIsEvidenced(e));
    const effect = pool.length ? pool[Math.floor(rng.next() * pool.length)]! : null;
    offer.push({ ...r, effect });
  }
  return offer;
}
