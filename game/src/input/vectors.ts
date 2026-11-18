/** Pure input math (no DOM) so it can be unit tested. World axes: -z is "up" on screen. */
import type { MoveInput } from '../sim/world.ts';

const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

export function keysToMove(pressed: ReadonlySet<string>): MoveInput {
  const has = (codes: string[]) => codes.some((c) => pressed.has(c));
  let x = 0;
  let z = 0;
  if (has(LEFT)) x -= 1;
  if (has(RIGHT)) x += 1;
  if (has(UP)) z -= 1;
  if (has(DOWN)) z += 1;
  const len = Math.hypot(x, z);
  return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
}

/**
 * Virtual joystick: drag from `origin` to `current` (screen pixels).
 * Returns a vector of length 0..1 with a dead zone, screen-down mapped to +z.
 */
export function joystickToMove(
  origin: { x: number; y: number },
  current: { x: number; y: number },
  maxRadius: number,
  deadZone = 0.15,
): MoveInput {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (maxRadius <= 0 || len === 0) return { x: 0, z: 0 };
  const mag = Math.min(1, len / maxRadius);
  if (mag < deadZone) return { x: 0, z: 0 };
  const scaled = (mag - deadZone) / (1 - deadZone);
  return { x: (dx / len) * scaled, z: (dy / len) * scaled };
}

export function combineMoves(a: MoveInput, b: MoveInput): MoveInput {
  const x = a.x + b.x;
  const z = a.z + b.z;
  const len = Math.hypot(x, z);
  return len > 1 ? { x: x / len, z: z / len } : { x, z };
}
