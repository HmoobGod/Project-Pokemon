/**
 * Advisory, read-only preview for StandardProgression.recoverCorruptPrimary().
 * It never repairs, exports, clears or overwrites progress. A positive preview
 * is NOT authorization to skip the live mutator's validation/race protections.
 */
import {
  ProgressionError, parseSave, validateCatalog, validateStateAgainstCatalog,
  type Catalog, type StorageLike,
} from './progression.ts';
import {exportRawRecoveryBundle, parseRawRecoveryBundle} from './recovery-bundle.ts';

export type CorruptPrimaryHealth =
  | 'missing' | 'valid' | 'unreadable' | 'incompatible-schema' | 'incompatible-version';
export type RecoveryBackupHealth = 'missing' | 'valid' | 'unreadable';
export type RecoveryQuarantineHealth = 'empty' | 'matches-primary' | 'occupied-other';
export type CorruptPrimaryRecoveryStatus =
  | 'ready-missing-primary'
  | 'ready-preserve-primary'
  | 'ready-matching-quarantine'
  | 'blocked-primary-valid'
  | 'blocked-incompatible-schema'
  | 'blocked-incompatible-version'
  | 'blocked-backup-missing'
  | 'blocked-backup-unreadable'
  | 'blocked-quarantine-conflict';

export interface CorruptPrimaryReadiness {
  primary: CorruptPrimaryHealth;
  backup: RecoveryBackupHealth;
  quarantine: RecoveryQuarantineHealth;
  recovery: CorruptPrimaryRecoveryStatus;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Takes two reads of all six Standard slots and fails on OBSERVED changes.
 * Like localStorage itself this is not an atomic multi-tab transaction.
 * The caller must handle generic storage read errors and a live refusal.
 */
export function assessCorruptPrimaryReadiness(
  storage: Pick<StorageLike, 'getItem'>,
  catalog: Catalog,
): CorruptPrimaryReadiness {
  validateCatalog(catalog);
  const raw = parseRawRecoveryBundle(exportRawRecoveryBundle(storage)).slots;

  let primary: CorruptPrimaryHealth = 'missing';
  if (raw.primary !== null) {
    let value: unknown;
    try { value = JSON.parse(raw.primary); }
    catch { value = null; }

    // Mirror the live recoverCorruptPrimary() refusal order. A future
    // schema/version MUST NOT be treated as merely corrupt/discardable.
    if (isRecord(value) && value.schema !== 1)
      primary = 'incompatible-schema';
    else if (isRecord(value) &&
             typeof value.sourceVersion === 'string' &&
             value.sourceVersion !== catalog.sourceVersion)
      primary = 'incompatible-version';
    else {
      try {
        validateStateAgainstCatalog(parseSave(raw.primary,catalog.sourceVersion),catalog);
        primary = 'valid';
      } catch (error) {
        if (!(error instanceof ProgressionError)) throw error;
        primary = 'unreadable';
      }
    }
  }

  let backup: RecoveryBackupHealth = 'missing';
  if (raw.backup !== null) {
    try {
      validateStateAgainstCatalog(parseSave(raw.backup,catalog.sourceVersion),catalog);
      backup = 'valid';
    } catch (error) {
      if (!(error instanceof ProgressionError)) throw error;
      backup = 'unreadable';
    }
  }

  const quarantine: RecoveryQuarantineHealth =
    raw.quarantine === null ? 'empty' :
    raw.primary !== null && raw.quarantine === raw.primary ?
      'matches-primary' : 'occupied-other';

  let recovery: CorruptPrimaryRecoveryStatus;
  if (primary === 'incompatible-schema') recovery = 'blocked-incompatible-schema';
  else if (primary === 'incompatible-version') recovery = 'blocked-incompatible-version';
  else if (primary === 'valid') recovery = 'blocked-primary-valid';
  else if (backup === 'missing') recovery = 'blocked-backup-missing';
  else if (backup === 'unreadable') recovery = 'blocked-backup-unreadable';
  else if (primary === 'missing') recovery = 'ready-missing-primary';
  else if (quarantine === 'occupied-other') recovery = 'blocked-quarantine-conflict';
  else if (quarantine === 'matches-primary') recovery = 'ready-matching-quarantine';
  else recovery = 'ready-preserve-primary';

  return {primary,backup,quarantine,recovery};
}
