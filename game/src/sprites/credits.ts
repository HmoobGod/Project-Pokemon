/** Credits shown in-game. Third-party entries come ONLY from sprites that actually loaded. */
import type { SpriteRole } from './manifest.ts';
import type { LoadedSprite, SpriteLoadResult } from './loader.ts';

export interface CreditLine {
  heading: string;
  lines: string[];
}

const ROLE_LABEL: Record<SpriteRole, string> = { player: 'Player sprite', chaser: 'Chaser enemy sprite', brute: 'Brute enemy sprite', boss: 'Guardian sprite', legendary: 'Legendary sprite' };

export const BASE_CREDITS: readonly CreditLine[] = [
  {
    heading: 'Arena Slice prototype',
    lines: ['Original game code, placeholder shapes and synthesized sounds — Project-Pokemon (HmoobGod).', 'Unofficial, non-commercial fan prototype. Not affiliated with PokéBonk, Nintendo, Creatures or GAME FREAK.'],
  },
  {
    heading: 'three.js',
    lines: ['3D engine by the three.js authors — MIT License.'],
  },
];

export function buildCredits(result: Pick<SpriteLoadResult, 'sprites'>): CreditLine[] {
  const out: CreditLine[] = BASE_CREDITS.map((c) => ({ heading: c.heading, lines: [...c.lines] }));
  const loaded: LoadedSprite[] = [...result.sprites.values()];
  if (loaded.length === 0) return out;
  for (const s of loaded) {
    const c = s.spec.credit;
    const lines = [`“${c.title}” by ${c.authors.join(', ')}`, `Source: ${c.source}`, `License: ${c.license}${c.licenseUrl ? ` (${c.licenseUrl})` : ''}`];
    out.push({ heading: ROLE_LABEL[s.spec.role], lines });
  }
  out.push({
    heading: 'About these sprites',
    lines: ['Loaded from this device’s private sprites folder. They are not part of, or distributed with, this game’s source code.', 'Use them only as their licences allow (for CC BY-NC: with credit, non-commercially).'],
  });
  return out;
}

export function spriteStatusText(result: SpriteLoadResult | null): string {
  if (!result) return 'Sprites: checking…';
  const n = result.sprites.size;
  switch (result.status) {
    case 'none':
      return 'Sprites: none found — using placeholder shapes.';
    case 'loaded':
      return `Sprites: ${n} loaded.`;
    case 'partial':
      return `Sprites: ${n} loaded, some fell back to placeholders.`;
    default:
      return 'Sprites: could not be used — using placeholder shapes.';
  }
}
