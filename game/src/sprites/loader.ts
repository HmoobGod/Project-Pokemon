/**
 * Optional local sprite loading. Reads ./private-sprites/sprites.js (a classic script that sets
 * window.ARENA_PRIVATE_SPRITES) and the images it lists. No fetch/XHR, so it also works from
 * file:// and inside an offline WebView. Every failure path returns placeholders, never throws.
 */
import { MANIFEST_GLOBAL, parseSpriteManifest, type SpriteRole, type SpriteSpec } from './manifest.ts';
import { sheetFits } from './spriteMath.ts';

export interface LoadedImage {
  width: number;
  height: number;
  image: unknown;
}

export interface LoadedSprite {
  spec: SpriteSpec;
  width: number;
  height: number;
  image: unknown;
}

export type SpriteStatus = 'none' | 'loaded' | 'partial' | 'failed';

export interface SpriteLoadResult {
  status: SpriteStatus;
  sprites: Map<SpriteRole, LoadedSprite>;
  problems: string[];
}

export interface LoaderDeps {
  /** resolves true if the script loaded, false if it is absent/failed */
  loadScript(url: string): Promise<boolean>;
  readManifest(): unknown;
  loadImage(url: string): Promise<LoadedImage>;
}

export const PRIVATE_SPRITE_DIR = './private-sprites/';
export const LOAD_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export async function loadPrivateSprites(deps: LoaderDeps, dir = PRIVATE_SPRITE_DIR, timeoutMs = LOAD_TIMEOUT_MS): Promise<SpriteLoadResult> {
  const sprites = new Map<SpriteRole, LoadedSprite>();
  const problems: string[] = [];
  let found: boolean;
  try {
    found = await withTimeout(deps.loadScript(`${dir}sprites.js`), timeoutMs, 'sprites.js');
  } catch (e) {
    return { status: 'none', sprites, problems: [`sprites.js not loaded: ${(e as Error).message}`] };
  }
  if (!found) return { status: 'none', sprites, problems: [] };

  let raw: unknown;
  try {
    raw = deps.readManifest();
  } catch (e) {
    return { status: 'failed', sprites, problems: [`could not read manifest: ${(e as Error).message}`] };
  }
  if (raw === undefined) return { status: 'failed', sprites, problems: [`sprites.js did not define window.${MANIFEST_GLOBAL}`] };

  const parsed = parseSpriteManifest(raw);
  problems.push(...parsed.problems);
  await Promise.all(
    parsed.specs.map(async (spec) => {
      try {
        const img = await withTimeout(deps.loadImage(dir + spec.image), timeoutMs, spec.image);
        if (!(img.width > 0 && img.height > 0)) throw new Error('image has no size');
        if (!sheetFits(img.width, img.height, spec.frameWidth, spec.frameHeight, spec.frames, spec.directions)) {
          throw new Error(`image ${img.width}x${img.height} too small for ${spec.frames}x${spec.directions} frames of ${spec.frameWidth}x${spec.frameHeight}`);
        }
        sprites.set(spec.role, { spec, width: img.width, height: img.height, image: img.image });
      } catch (e) {
        problems.push(`${spec.role}: ${(e as Error).message} — using placeholder`);
      }
    }),
  );
  const status: SpriteStatus = sprites.size === 0 ? 'failed' : problems.length ? 'partial' : 'loaded';
  return { status, sprites, problems };
}

/** Real browser implementation (only touches the DOM when called). */
export function browserLoaderDeps(): LoaderDeps {
  return {
    loadScript(url) {
      return new Promise<boolean>((resolve) => {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = () => resolve(true);
        s.onerror = () => {
          s.remove();
          resolve(false);
        };
        document.head.appendChild(s);
      });
    },
    readManifest() {
      return (window as unknown as Record<string, unknown>)[MANIFEST_GLOBAL];
    },
    loadImage(url) {
      return new Promise<LoadedImage>((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, image: img });
        img.onerror = () => reject(new Error(`image not found or unreadable (${url})`));
        img.src = url;
      });
    },
  };
}
