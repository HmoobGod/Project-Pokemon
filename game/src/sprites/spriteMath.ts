/** Pure sprite-sheet math (tested without a browser). */

/**
 * Row for an 8-direction sheet in PMD order: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft.
 * World facing (x, z) where +x = screen right and +z = screen down.
 */
export function directionRow(fx: number, fz: number, directions: 1 | 8): number {
  if (directions === 1 || (!fx && !fz) || !Number.isFinite(fx) || !Number.isFinite(fz)) return 0;
  const deg = (Math.atan2(fz, fx) * 180) / Math.PI; // right=0, down=90, up=-90
  const idx = Math.round((90 - deg) / 45);
  return ((idx % 8) + 8) % 8;
}

export function frameIndex(timeSeconds: number, fps: number, frames: number): number {
  if (frames <= 1 || fps <= 0 || !Number.isFinite(timeSeconds) || timeSeconds < 0) return 0;
  return Math.floor(timeSeconds * fps) % frames;
}

export interface FrameUv {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

/** UV window for a frame, for a texture with flipY = true (three.js default). */
export function frameUv(frameWidth: number, frameHeight: number, imageWidth: number, imageHeight: number, col: number, row: number): FrameUv {
  const repeatX = frameWidth / imageWidth;
  const repeatY = frameHeight / imageHeight;
  return { repeatX, repeatY, offsetX: col * repeatX, offsetY: 1 - (row + 1) * repeatY };
}

export function sheetFits(imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number, frames: number, directions: number): boolean {
  return imageWidth >= frameWidth * frames && imageHeight >= frameHeight * directions;
}
