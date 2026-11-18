/** Keyboard + touch (virtual joystick) controls. Works in desktop browsers and Android WebView. */
import type { MoveInput } from '../sim/world.ts';
import { combineMoves, joystickToMove, keysToMove } from './vectors.ts';

export interface Controls {
  getMove(): MoveInput;
  onKey(handler: (code: string) => void): void;
  dispose(): void;
}

export function createControls(root: HTMLElement, joystickBase: HTMLElement, joystickKnob: HTMLElement): Controls {
  const pressed = new Set<string>();
  const keyHandlers: Array<(code: string) => void> = [];
  const maxRadius = 60;
  let touchId: number | null = null;
  let origin = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (!pressed.has(ev.code)) keyHandlers.forEach((h) => h(ev.code));
    pressed.add(ev.code);
    if (ev.code.startsWith('Arrow') || ev.code === 'Space') ev.preventDefault();
  };
  const onKeyUp = (ev: KeyboardEvent) => pressed.delete(ev.code);
  const onBlur = () => pressed.clear();

  const showStick = (visible: boolean) => {
    joystickBase.style.display = visible ? 'block' : 'none';
  };
  const placeStick = () => {
    joystickBase.style.left = `${origin.x}px`;
    joystickBase.style.top = `${origin.y}px`;
    const dx = current.x - origin.x;
    const dy = current.y - origin.y;
    const len = Math.hypot(dx, dy);
    const k = len > maxRadius ? maxRadius / len : 1;
    joystickKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.pointerType === 'mouse' || touchId !== null) return;
    if ((ev.target as HTMLElement).closest('button')) return;
    touchId = ev.pointerId;
    origin = { x: ev.clientX, y: ev.clientY };
    current = { ...origin };
    showStick(true);
    placeStick();
    ev.preventDefault();
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (ev.pointerId !== touchId) return;
    current = { x: ev.clientX, y: ev.clientY };
    placeStick();
    ev.preventDefault();
  };
  const onPointerUp = (ev: PointerEvent) => {
    if (ev.pointerId !== touchId) return;
    touchId = null;
    showStick(false);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  root.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  showStick(false);

  return {
    getMove() {
      const touch = touchId === null ? { x: 0, z: 0 } : joystickToMove(origin, current, maxRadius);
      return combineMoves(keysToMove(pressed), touch);
    },
    onKey(handler) {
      keyHandlers.push(handler);
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      root.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
