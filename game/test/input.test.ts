import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineMoves, joystickToMove, keysToMove } from '../src/input/vectors.ts';

test('keyboard: WASD and arrows map to world axes, diagonals normalised', () => {
  assert.deepEqual(keysToMove(new Set(['KeyW'])), { x: 0, z: -1 });
  assert.deepEqual(keysToMove(new Set(['ArrowRight'])), { x: 1, z: 0 });
  assert.deepEqual(keysToMove(new Set(['KeyA', 'KeyD'])), { x: 0, z: 0 });
  const d = keysToMove(new Set(['KeyS', 'KeyD']));
  assert.ok(Math.abs(Math.hypot(d.x, d.z) - 1) < 1e-9);
  assert.ok(d.x > 0 && d.z > 0);
});

test('joystick: dead zone, direction and full-tilt clamp', () => {
  assert.deepEqual(joystickToMove({ x: 100, y: 100 }, { x: 104, y: 100 }, 60), { x: 0, z: 0 });
  const right = joystickToMove({ x: 0, y: 0 }, { x: 200, y: 0 }, 60);
  assert.ok(Math.abs(right.x - 1) < 1e-9 && right.z === 0);
  const down = joystickToMove({ x: 0, y: 0 }, { x: 0, y: 30 }, 60);
  assert.ok(down.z > 0 && down.z < 1, 'half tilt gives partial speed');
});

test('combined keyboard + touch never exceeds unit length', () => {
  const c = combineMoves({ x: 1, z: 0 }, { x: 0, z: 1 });
  assert.ok(Math.hypot(c.x, c.z) <= 1 + 1e-9);
});
