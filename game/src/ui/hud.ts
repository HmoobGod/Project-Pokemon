/** Pure HUD model (no DOM) so the layout's data is unit tested. Original styling; layout inspired by the owner's reference screenshot. */
import { RARITY_STYLE, type BlessingRarity } from '../sim/config.ts';
import { UPGRADES, UPGRADE_ORDER, type UpgradeId } from '../sim/upgrades.ts';
import { mapLabel, overtimeSeconds, type GameEvent, type World } from '../sim/world.ts';

/** "m:ss.t" run clock, e.g. 21:31.2 */
export function formatRunClock(t: number): string {
  const tenths = Math.floor(Math.max(0, t) * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}

/** "m:ss" countdown */
export function formatClock(t: number): string {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type MedalState = 'cleared' | 'current' | 'locked';

/** One medal per zone plus one for the Shrine. */
export function zoneMedals(world: World): MedalState[] {
  const m = world.map;
  const total = m.zoneCount + 1;
  const cur = m.kind === 'shrine' ? m.zoneCount : m.index;
  return Array.from({ length: total }, (_, i) => {
    if (i < cur) return 'cleared';
    if (i === cur) return world.victory && i === m.zoneCount ? 'cleared' : 'current';
    return 'locked';
  });
}

export interface TimerPill {
  text: string;
  swarm: boolean;
}

export function timerPill(world: World): TimerPill {
  const m = world.map;
  if (m.kind === 'shrine') return { text: world.victory ? 'Shrine · cleared' : 'Shrine', swarm: false };
  if (m.finalSwarm) return { text: `Zone ${m.index + 1}/${m.zoneCount} · FINAL SWARM +${formatClock(overtimeSeconds(world))}`, swarm: true };
  return { text: `Zone ${m.index + 1}/${m.zoneCount} · ${m.name} · ${formatClock(m.zoneSeconds - m.zoneTime)}`, swarm: false };
}

export interface UpgradeSlot {
  id: UpgradeId;
  name: string;
  short: string;
  level: number;
  max: boolean;
}

const SHORT: Record<UpgradeId, string> = { power: 'PWR', haste: 'SPD', swift: 'MOV', vitality: 'HP', multishot: 'MLT', magnet: 'MAG', pulse: 'PLS' };

/** Taken upgrades in first-taken order with their level; MAX when the upgrade can no longer be offered. */
export function upgradeSlots(world: World): UpgradeSlot[] {
  const counts = new Map<UpgradeId, number>();
  for (const id of world.player.upgradesTaken) counts.set(id, (counts.get(id) ?? 0) + 1);
  const order = [...new Set(world.player.upgradesTaken)];
  return order
    .filter((id) => UPGRADE_ORDER.includes(id))
    .map((id) => ({ id, name: UPGRADES[id].name, short: SHORT[id], level: counts.get(id) ?? 0, max: !UPGRADES[id].eligible(world.player) }));
}

/** Up to three blessing dots (one per zone's Unown), coloured by rarity; null = not yet picked. */
export function blessingDots(world: World): Array<{ rarity: BlessingRarity; color: string } | null> {
  const dots: Array<{ rarity: BlessingRarity; color: string } | null> = world.blessings.slice(0, 3).map((b) => ({ rarity: b.rarity, color: RARITY_STYLE[b.rarity].color }));
  while (dots.length < 3) dots.push(null);
  return dots;
}

export type ToastTone = 'info' | 'good' | 'danger' | 'gold';

/** Short banner text for notable events (null = no banner). */
export function toastFor(ev: GameEvent, world: World): { text: string; tone: ToastTone } | null {
  switch (ev.type) {
    case 'guardianAwakened':
      return { text: 'The Guardian awakens!', tone: 'danger' };
    case 'guardianDefeated':
      return { text: 'Guardian defeated! The portal is open', tone: 'good' };
    case 'finalSwarm':
      return { text: 'FINAL SWARM! Enemies are much tougher', tone: 'danger' };
    case 'challengeStarted':
      return { text: `Challenge! Defeat ${ev.total} ${ev.species}s`, tone: 'info' };
    case 'challengeWon':
      return { text: 'Challenge complete!', tone: 'good' };
    case 'challengeFailed':
      return { text: 'Challenge failed', tone: 'danger' };
    case 'unownCharged':
      return { text: 'The Unown altar is full: choose a blessing', tone: 'info' };
    case 'blessingChosen':
      return { text: `${RARITY_STYLE[ev.rarity].label} blessing chosen${ev.applied ? '' : ' (effect pending)'}`, tone: 'info' };
    case 'zoneTransition':
      return { text: mapLabel(world.map), tone: 'info' };
    case 'shrineEntered':
      return { text: 'The Shrine', tone: 'gold' };
    case 'legendaryAppeared':
      return { text: 'The Legendary appears!', tone: 'danger' };
    case 'runVictory':
      return { text: 'VICTORY! Exit through the portal', tone: 'gold' };
    default:
      return null;
  }
}
