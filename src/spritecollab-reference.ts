/**
 * Read-only reference to PMDCollab/SpriteCollab provenance metadata.
 * This module contains NO Pokémon images, binary sprites, third-party code,
 * network fetches or automatic license grants. No runtime assets are loaded.
 */
export const SPRITECOLLAB_REPOSITORY = 'PMDCollab/SpriteCollab';
export const SPRITECOLLAB_REVISION = '2ce13010294c78baf438f2cef0808a5ea2ef8b6a';
export const SPRITECOLLAB_COMMUNITY_LICENSE = 'CC BY-NC 4.0';
export const SPRITECOLLAB_COMMUNITY_LICENSE_URL =
  'https://creativecommons.org/licenses/by-nc/4.0/';

export type SpriteCollabKind = 'sprite' | 'portrait';
export type SpriteCollabCreditStatus = 'CUR' | 'OLD';
export type SpriteCollabRightsFinding =
  | 'official-restricted'
  | 'community-noncommercial-candidate'
  | 'license-unverified'
  | 'missing-current-credit';

export interface SpriteCollabReference {
  kind: SpriteCollabKind;
  numericFolder: string;
  sourcePath: string;
  creditsPath: string;
  sourceTreeUrl: string;
  creditsUrl: string;
  /** Always false: the reference is NOT a grant to package an image. */
  allowedToBundle: false;
}

export interface SpriteCollabCredit {
  timestamp: string;
  contributor: string;
  status: SpriteCollabCreditStatus;
  declaredLicense: string;
  actions: readonly string[];
}

export interface SpriteCollabRightsAssessment {
  finding: SpriteCollabRightsFinding;
  currentContributors: readonly string[];
  /** Even a CC candidate still needs per-file provenance and rights review. */
  allowedToBundle: false;
}

const base = `https://github.com/${SPRITECOLLAB_REPOSITORY}`;
const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

/** Provenance links only; cannot produce an image download URL. */
export function spriteCollabReference(
  kind: SpriteCollabKind, folderNumber: number,
): SpriteCollabReference {
  if (kind !== 'sprite' && kind !== 'portrait')
    throw new Error('Invalid SpriteCollab asset kind');
  if (!Number.isSafeInteger(folderNumber) || folderNumber < 0 || folderNumber > 9999)
    throw new Error('Invalid SpriteCollab numeric folder');
  const numericFolder = String(folderNumber).padStart(4, '0');
  const sourcePath = `${kind}/${numericFolder}`;
  const creditsPath = `${sourcePath}/credits.txt`;
  return {
    kind, numericFolder, sourcePath, creditsPath,
    sourceTreeUrl: `${base}/tree/${SPRITECOLLAB_REVISION}/${sourcePath}`,
    creditsUrl: `${base}/blob/${SPRITECOLLAB_REVISION}/${creditsPath}`,
    allowedToBundle: false,
  };
}

/**
 * Parse per-folder credits.txt (metadata only). Each entry is
 * timestamp TAB contributor TAB CUR|OLD TAB license TAB comma-separated actions.
 * Never interpret historical OLD entries as the current asset's permission.
 */
export function parseSpriteCollabCredits(input: string): readonly SpriteCollabCredit[] {
  if (typeof input !== 'string' || input.length > 2_000_000)
    throw new Error('Invalid SpriteCollab credits payload');
  const output: SpriteCollabCredit[] = [];
  for (const line of input.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const fields = line.split('\t');
    if (fields.length !== 5) throw new Error('Malformed SpriteCollab credits row');
    const [timestamp, contributor, status, declaredLicense, actionList] = fields;
    if (!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(timestamp) ||
        !contributor || !declaredLicense || !actionList ||
        (status !== 'CUR' && status !== 'OLD'))
      throw new Error('Invalid SpriteCollab credits metadata');
    const actions = actionList.split(',').map(s=>s.trim());
    if (actions.some(action=>!/^[A-Za-z][A-Za-z0-9 ^_-]{0,79}$/.test(action)) ||
        actions.some(action=>!action.length))
      throw new Error('Invalid SpriteCollab action label');
    output.push({ timestamp, contributor, status, declaredLicense, actions });
  }
  return output;
}

/** Conservatively classify one CURRENT action. Never grants distribution rights. */
export function assessSpriteCollabRights(
  entries: readonly SpriteCollabCredit[], action: string,
): SpriteCollabRightsAssessment {
  if (typeof action !== 'string' || !/^[A-Za-z][A-Za-z0-9 ^_-]{0,79}$/.test(action))
    throw new Error('Invalid SpriteCollab action');
  const current = entries.filter(e=>e.status==='CUR' && e.actions.includes(action));
  const currentContributors = [...new Set(current.map(e=>e.contributor))];
  let finding: SpriteCollabRightsFinding = 'missing-current-credit';
  if (current.length) {
    if (current.some(e=>e.contributor.toUpperCase()==='CHUNSOFT'))
      finding='official-restricted';
    else if (current.some(e=>e.declaredLicense!=='CC_BY-NC_4'))
      finding='license-unverified';
    else finding='community-noncommercial-candidate';
  }
  return {finding,currentContributors,allowedToBundle:false};
}

/** Verified numeric-folder directory examples, NOT verified redistributable art. */
export const SPRITECOLLAB_REFERENCE_EXAMPLES = Object.freeze([
  {kind:'sprite' as const,folder:1},
  {kind:'portrait' as const,folder:1},
  {kind:'sprite' as const,folder:4},
  {kind:'portrait' as const,folder:4},
  {kind:'sprite' as const,folder:150},
  {kind:'portrait' as const,folder:150},
]);
