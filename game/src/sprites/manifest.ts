/**
 * Validation for the OPTIONAL private sprite manifest the owner supplies locally
 * (game/public/private-sprites/sprites.js, git-ignored). Pure: no DOM, no network.
 * Any invalid entry is dropped (that role falls back to placeholder shapes); a sprite
 * without complete credit information is never used.
 */
export const SPRITE_ROLES = ['player', 'chaser', 'brute', 'boss'] as const;
export type SpriteRole = (typeof SPRITE_ROLES)[number];

export interface SpriteCredit {
  title: string;
  authors: string[];
  source: string;
  license: string;
  licenseUrl?: string;
}

export interface SpriteSpec {
  role: SpriteRole;
  /** path relative to the private-sprites folder */
  image: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  /** 1 = same image for every facing; 8 = PMD-style rows Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft */
  directions: 1 | 8;
  fps: number;
  /** on-screen height in world units */
  height: number;
  credit: SpriteCredit;
}

export interface ManifestResult {
  specs: SpriteSpec[];
  problems: string[];
}

export const MANIFEST_GLOBAL = 'ARENA_PRIVATE_SPRITES';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

function int(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function num(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

/** Only plain relative paths inside the private folder: no schemes, no absolute paths, no "..". */
export function isSafeRelativeImagePath(p: string): boolean {
  if (p.length > 200) return false;
  if (!/^[A-Za-z0-9_\-. /]+\.(png|webp)$/i.test(p)) return false;
  if (p.startsWith('/') || p.includes('//') || p.includes('\\')) return false;
  return !p.split('/').some((seg) => seg === '..' || seg === '.' || seg.trim() === '');
}

function parseCredit(v: unknown, role: string, problems: string[]): SpriteCredit | null {
  if (!isRec(v)) {
    problems.push(`${role}: missing credit (sprites without credits are not used)`);
    return null;
  }
  const title = str(v.title, 120);
  const source = str(v.source, 300);
  const license = str(v.license, 80);
  const authors = Array.isArray(v.authors) ? v.authors.map((a) => str(a, 80)) : [];
  const bad: string[] = [];
  if (!title) bad.push('title');
  if (!source) bad.push('source');
  if (!license) bad.push('license');
  if (authors.length === 0 || authors.length > 20 || authors.some((a) => a === null)) bad.push('authors');
  let licenseUrl: string | undefined;
  if (v.licenseUrl !== undefined) {
    const u = str(v.licenseUrl, 300);
    if (!u || !/^https:\/\/[^\s]+$/.test(u)) bad.push('licenseUrl');
    else licenseUrl = u;
  }
  if (bad.length) {
    problems.push(`${role}: incomplete credit (${bad.join(', ')}) — sprite not used`);
    return null;
  }
  return { title: title!, source: source!, license: license!, authors: authors as string[], ...(licenseUrl ? { licenseUrl } : {}) };
}

export function parseSpriteManifest(raw: unknown): ManifestResult {
  const problems: string[] = [];
  const specs: SpriteSpec[] = [];
  if (!isRec(raw)) return { specs, problems: ['manifest is not an object'] };
  if (raw.version !== 1) return { specs, problems: ['manifest version must be 1'] };
  if (!isRec(raw.sprites)) return { specs, problems: ['manifest.sprites must be an object'] };

  for (const [role, entry] of Object.entries(raw.sprites)) {
    if (!(SPRITE_ROLES as readonly string[]).includes(role)) {
      problems.push(`${role}: unknown role ignored (expected ${SPRITE_ROLES.join(', ')})`);
      continue;
    }
    if (!isRec(entry)) {
      problems.push(`${role}: entry must be an object`);
      continue;
    }
    const image = str(entry.image, 200);
    const frameWidth = int(entry.frameWidth, 1, 1024);
    const frameHeight = int(entry.frameHeight, 1, 1024);
    const frames = int(entry.frames, 1, 64);
    const directions = entry.directions === 1 || entry.directions === 8 ? entry.directions : null;
    const fps = num(entry.fps ?? 8, 0, 60);
    const height = num(entry.height ?? 1.8, 0.3, 8);
    const bad: string[] = [];
    if (!image || !isSafeRelativeImagePath(image)) bad.push('image');
    if (frameWidth === null) bad.push('frameWidth');
    if (frameHeight === null) bad.push('frameHeight');
    if (frames === null) bad.push('frames');
    if (directions === null) bad.push('directions');
    if (fps === null) bad.push('fps');
    if (height === null) bad.push('height');
    if (bad.length) {
      problems.push(`${role}: invalid ${bad.join(', ')} — using placeholder`);
      continue;
    }
    const credit = parseCredit(entry.credit, role, problems);
    if (!credit) continue;
    specs.push({ role: role as SpriteRole, image: image!, frameWidth: frameWidth!, frameHeight: frameHeight!, frames: frames!, directions: directions!, fps: fps!, height: height!, credit });
  }
  return { specs, problems };
}
