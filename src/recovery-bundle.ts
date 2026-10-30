/**
 * Read-only emergency export for all Standard progression and recovery slots.
 * Preserve raw bytes, including malformed JSON and unknown future save schemas.
 * No import, restore, overwrite, deletion or implicit consent is provided.
 */
import {ProgressionError, type StorageLike} from './progression.ts';

export const STANDARD_RECOVERY_SLOTS = {
  primary: 'pokebonk.standard.profile.v1',
  backup: 'pokebonk.standard.profile.backup.v1',
  preImport: 'pokebonk.standard.profile.preimport.v1',
  preRestore: 'pokebonk.standard.profile.prerestore.v1',
  preUndo: 'pokebonk.standard.profile.preundo.v1',
  quarantine: 'pokebonk.standard.profile.quarantine.v1',
} as const;

export type RecoverySlotName = keyof typeof STANDARD_RECOVERY_SLOTS;
export interface RawRecoveryBundle {
  kind: 'project-pokemon.standard.raw-recovery';
  schema: 1;
  slots: Record<RecoverySlotName, string | null>;
}

const names = Object.keys(STANDARD_RECOVERY_SLOTS) as RecoverySlotName[];

/**
 * Take two consecutive reads of every slot; refuse an observed concurrent
 * change instead of presenting a knowingly inconsistent backup. localStorage
 * has no atomic multi-key snapshot, so unobserved races remain possible.
 */
export function exportRawRecoveryBundle(storage: Pick<StorageLike, 'getItem'>): string {
  const slots = {} as Record<RecoverySlotName, string | null>;
  for (const name of names) slots[name] = storage.getItem(STANDARD_RECOVERY_SLOTS[name]);
  for (const name of names) {
    if (storage.getItem(STANDARD_RECOVERY_SLOTS[name]) !== slots[name])
      throw new ProgressionError('Recovery storage changed during export; retry');
  }
  const bundle: RawRecoveryBundle = {
    kind: 'project-pokemon.standard.raw-recovery',
    schema: 1,
    slots,
  };
  return JSON.stringify(bundle);
}

/** Structure-only check. This does not validate upstream gameplay or saves. */
export function parseRawRecoveryBundle(input: string): RawRecoveryBundle {
  let value: unknown;
  try { value = JSON.parse(input); }
  catch { throw new ProgressionError('Malformed recovery bundle'); }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProgressionError('Invalid recovery bundle');
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'project-pokemon.standard.raw-recovery' ||
      candidate.schema !== 1 ||
      Object.keys(candidate).sort().join(',') !== 'kind,schema,slots' ||
      !candidate.slots || typeof candidate.slots !== 'object' || Array.isArray(candidate.slots))
    throw new ProgressionError('Unsupported recovery bundle');
  const slots = candidate.slots as Record<string, unknown>;
  if (Object.keys(slots).sort().join(',') !== [...names].sort().join(','))
    throw new ProgressionError('Recovery bundle has missing or unknown slots');
  for (const name of names)
    if (slots[name] !== null && typeof slots[name] !== 'string')
      throw new ProgressionError('Recovery bundle slot must be raw text or null');
  return candidate as unknown as RawRecoveryBundle;
}
