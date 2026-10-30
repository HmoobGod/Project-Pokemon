/**
 * Read-only readiness preview for Standard profile recovery actions.
 * It neither imports nor repairs saves. A "ready" result is advisory only:
 * actual mutation methods re-check current storage and can still refuse.
 */
import {
  ProgressionError, parseSave, validateCatalog, validateStateAgainstCatalog,
  type Catalog, type StorageLike,
} from './progression.ts';
import {
  exportRawRecoveryBundle, parseRawRecoveryBundle,
  type RecoverySlotName,
} from './recovery-bundle.ts';

export type RecoverySlotHealth = 'missing' | 'valid' | 'unreadable';
export type RestoreReadiness =
  | 'ready'
  | 'retry-with-preserved-pre-undo'
  | 'no-op'
  | 'missing-target'
  | 'unreadable-target'
  | 'unavailable-primary'
  | 'protected-slot-conflict';

export interface RecoveryReadiness {
  slots: Record<RecoverySlotName, RecoverySlotHealth>;
  restores: {
    backup: RestoreReadiness;
    preImport: RestoreReadiness;
    preRestore: RestoreReadiness;
    preUndo: RestoreReadiness;
  };
}

/**
 * Inspects all six raw Standard-profile slots via a double-read, without
 * changing storage or exposing raw contents in the result. Do not use a
 * positive preview as a transaction or bypass any live mutator safeguards.
 */
export function assessRecoveryReadiness(
  storage: Pick<StorageLike, 'getItem'>,
  catalog: Catalog,
): RecoveryReadiness {
  validateCatalog(catalog);
  // The exporter rejects an observed race between its two read passes.
  // This is not an atomic snapshot across browser tabs.
  const raw = parseRawRecoveryBundle(exportRawRecoveryBundle(storage)).slots;

  const classify = (value: string | null): RecoverySlotHealth => {
    if (value === null) return 'missing';
    try {
      validateStateAgainstCatalog(parseSave(value, catalog.sourceVersion), catalog);
      return 'valid';
    } catch (error) {
      if (error instanceof ProgressionError) return 'unreadable';
      throw error;
    }
  };

  const slots = {} as Record<RecoverySlotName, RecoverySlotHealth>;
  for (const name of Object.keys(raw) as RecoverySlotName[])
    slots[name] = classify(raw[name]);

  const preview = (
    target: 'backup' | 'preImport' | 'preRestore' | 'preUndo',
    protectedSlot: 'preRestore' | 'preUndo',
  ): RestoreReadiness => {
    if (slots.primary !== 'valid') return 'unavailable-primary';
    if (slots[target] === 'missing') return 'missing-target';
    if (slots[target] !== 'valid') return 'unreadable-target';
    if (raw.primary === raw[target]) return 'no-op';
    if (raw[protectedSlot] !== null && raw[protectedSlot] !== raw.primary)
      return 'protected-slot-conflict';
    if (target === 'preRestore' && raw.preUndo !== null)
      return 'retry-with-preserved-pre-undo';
    return 'ready';
  };

  return {
    slots,
    restores: {
      backup: preview('backup','preRestore'),
      preImport: preview('preImport','preRestore'),
      preRestore: preview('preRestore','preUndo'),
      preUndo: preview('preUndo','preRestore'),
    },
  };
}
