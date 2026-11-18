/**
 * Pure minimap / full-map model: which markers exist and where they project. No DOM, so it is unit tested.
 * World axes: +x = screen right, +z = screen down (same as the 3D camera, which never rotates).
 */
import { ARENA_HALF_SIZE } from '../sim/config.ts';
import type { World } from '../sim/world.ts';

export type MarkerKind = 'player' | 'guardian-altar' | 'portal' | 'unown' | 'challenge' | 'boss' | 'enemy';

export interface MapMarker {
  kind: MarkerKind;
  x: number;
  z: number;
  /** interactable state, e.g. dormant/awakened/spent, idle/charging/spent, idle/active/won/failed */
  state?: string;
  /** important markers stay pinned to the minimap edge when out of range */
  pin: boolean;
}

export function mapMarkers(world: World, includeEnemies = true): MapMarker[] {
  const m = world.map;
  const out: MapMarker[] = [];
  if (includeEnemies) {
    for (const e of world.enemies) {
      if (e.id === m.bossId) continue;
      out.push({ kind: 'enemy', x: e.pos.x, z: e.pos.z, pin: false });
    }
  }
  if (m.unown) out.push({ kind: 'unown', x: m.unown.pos.x, z: m.unown.pos.z, state: m.unown.state, pin: m.unown.state !== 'spent' });
  if (m.challenge) out.push({ kind: 'challenge', x: m.challenge.pos.x, z: m.challenge.pos.z, state: m.challenge.state, pin: m.challenge.state === 'idle' });
  if (m.altar) out.push({ kind: 'guardian-altar', x: m.altar.pos.x, z: m.altar.pos.z, state: m.altar.state, pin: m.altar.state === 'dormant' });
  if (m.portal) out.push({ kind: 'portal', x: m.portal.x, z: m.portal.z, state: m.kind === 'shrine' ? 'exit' : m.index === m.zoneCount - 1 ? 'to-shrine' : 'to-zone', pin: true });
  const boss = world.enemies.find((e) => e.id === m.bossId);
  if (boss) out.push({ kind: 'boss', x: boss.pos.x, z: boss.pos.z, state: boss.kind, pin: true });
  out.push({ kind: 'player', x: world.player.pos.x, z: world.player.pos.z, pin: true });
  return out;
}

export interface Projected {
  px: number;
  py: number;
  /** true if it was outside the view and clamped to the edge */
  edge: boolean;
}

/**
 * Player-centred minimap: `viewRadius` world units from the player map to `size/2` pixels.
 * Returns null for unpinned markers outside the view.
 */
export function projectMinimap(px0: number, pz0: number, x: number, z: number, viewRadius: number, size: number, pin: boolean): Projected | null {
  let dx = (x - px0) / viewRadius;
  let dz = (z - pz0) / viewRadius;
  const d = Math.hypot(dx, dz);
  let edge = false;
  if (d > 1) {
    if (!pin) return null;
    dx /= d;
    dz /= d;
    edge = true;
  }
  const half = size / 2;
  const inset = edge ? 0.9 : 1;
  return { px: half + dx * half * inset, py: half + dz * half * inset, edge };
}

/** Whole-arena map: the full play area maps to a `size` x `size` square. */
export function projectFullMap(x: number, z: number, size: number): { px: number; py: number } {
  return { px: ((x + ARENA_HALF_SIZE) / (2 * ARENA_HALF_SIZE)) * size, py: ((z + ARENA_HALF_SIZE) / (2 * ARENA_HALF_SIZE)) * size };
}

export const MARKER_STYLE: Record<MarkerKind, { color: string; r: number }> = {
  player: { color: '#ffffff', r: 4 },
  'guardian-altar': { color: '#3ddc84', r: 5 },
  portal: { color: '#6ff3ff', r: 6 },
  unown: { color: '#5aa9ff', r: 5 },
  challenge: { color: '#ff9b3d', r: 5 },
  boss: { color: '#ff4040', r: 6 },
  enemy: { color: 'rgba(200,120,255,0.8)', r: 1.6 },
};

export function markerColor(mk: MapMarker): string {
  if (mk.kind === 'guardian-altar') return mk.state === 'dormant' ? '#3ddc84' : mk.state === 'awakened' ? '#ff4040' : '#777777';
  if (mk.kind === 'portal') return mk.state === 'exit' ? '#ffd34d' : mk.state === 'to-shrine' ? '#b48cff' : '#6ff3ff';
  if (mk.kind === 'unown') return mk.state === 'spent' ? '#777777' : '#5aa9ff';
  if (mk.kind === 'challenge') return mk.state === 'active' ? '#ff4040' : mk.state === 'idle' ? '#ff9b3d' : '#777777';
  return MARKER_STYLE[mk.kind].color;
}

/** Draw onto a 2D canvas context (browser only; kept here so main.ts stays small). */
export function drawMap(ctx: CanvasRenderingContext2D, world: World, size: number, mode: 'mini' | 'full', viewRadius = 26): void {
  ctx.clearRect(0, 0, size, size);
  const p = world.player.pos;
  const proj = (x: number, z: number, pin: boolean) =>
    mode === 'full' ? { ...projectFullMap(x, z, size), edge: false } : projectMinimap(p.x, p.z, x, z, viewRadius, size, pin);
  // background + arena bounds
  ctx.fillStyle = 'rgba(10,20,40,0.65)';
  if (mode === 'mini') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
  } else ctx.fillRect(0, 0, size, size);
  const scale = mode === 'full' ? size / (2 * ARENA_HALF_SIZE) : size / 2 / viewRadius;
  const a0 = proj(-ARENA_HALF_SIZE, -ARENA_HALF_SIZE, true);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  if (mode === 'full') ctx.strokeRect(1, 1, size - 2, size - 2);
  else if (a0) {
    const x0 = size / 2 + (-ARENA_HALF_SIZE - p.x) * scale;
    const y0 = size / 2 + (-ARENA_HALF_SIZE - p.z) * scale;
    ctx.strokeRect(x0, y0, 2 * ARENA_HALF_SIZE * scale, 2 * ARENA_HALF_SIZE * scale);
  }
  ctx.fillStyle = 'rgba(200,200,200,0.45)';
  for (const o of world.map.obstacles) {
    const q = mode === 'full' ? projectFullMap(o.x, o.z, size) : { px: size / 2 + (o.x - p.x) * scale, py: size / 2 + (o.z - p.z) * scale };
    ctx.beginPath();
    ctx.arc(q.px, q.py, Math.max(1.5, o.radius * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const mk of mapMarkers(world)) {
    const q = proj(mk.x, mk.z, mk.pin);
    if (!q) continue;
    const st = MARKER_STYLE[mk.kind];
    const r = mode === 'full' ? st.r * 1.6 : st.r;
    ctx.fillStyle = markerColor(mk);
    ctx.beginPath();
    if (mk.kind === 'portal' || mk.kind === 'guardian-altar' || mk.kind === 'challenge') {
      ctx.moveTo(q.px, q.py - r);
      ctx.lineTo(q.px + r, q.py);
      ctx.lineTo(q.px, q.py + r);
      ctx.lineTo(q.px - r, q.py);
      ctx.closePath();
    } else ctx.arc(q.px, q.py, r, 0, Math.PI * 2);
    ctx.fill();
    if (mk.kind === 'player') {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  if (mode === 'mini') ctx.restore();
}
