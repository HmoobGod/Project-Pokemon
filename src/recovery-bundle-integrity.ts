/**
 * Integrity envelope for a read-only, lossless Standard emergency save export.
 * SHA-256 detects accidental edits; it is NOT a signature or authentication.
 * This module does not import, clear, restore, grant or overwrite anything.
 */
import {ProgressionError, type StorageLike} from './progression.ts';
import {
  STANDARD_RECOVERY_SLOTS, exportRawRecoveryBundle, parseRawRecoveryBundle,
  type RawRecoveryBundle,
} from './recovery-bundle.ts';

export interface ChecksummedRecoveryBundle {
  kind: 'project-pokemon.standard.raw-recovery.sha256';
  schema: 1;
  sha256: string;
  payload: string;
}

const sha256Hex = async (payload: string): Promise<string> => {
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
};

/**
 * Export all Standard recovery slots exactly as before, inside a checksummed
 * envelope. The third pass detects observed storage changes while hashing.
 * Non-atomic across browser tabs; do not interpret this as a lock.
 */
export async function exportChecksummedRecoveryBundle(
  storage: Pick<StorageLike, 'getItem'>,
): Promise<string> {
  const payload=exportRawRecoveryBundle(storage); // two passes, no mutation
  const original=parseRawRecoveryBundle(payload);
  const sha256=await sha256Hex(payload);
  for(const [name,key] of Object.entries(STANDARD_RECOVERY_SLOTS) as
    [keyof typeof STANDARD_RECOVERY_SLOTS,string][]) {
    if(storage.getItem(key)!==original.slots[name])
      throw new ProgressionError('Recovery storage changed during checksum export; retry');
  }
  const bundle:ChecksummedRecoveryBundle={
    kind:'project-pokemon.standard.raw-recovery.sha256',
    schema:1,sha256,payload,
  };
  return JSON.stringify(bundle);
}

/**
 * Read-only verifier. Do NOT pass unchecked raw bundles to a future import UI.
 * Hashing only detects unauthorized-by-this-format edits, not deliberate
 * malicious rehashes. Actual import still requires safe export and consent UX.
 */
export async function parseChecksummedRecoveryBundle(
  input:string,
):Promise<RawRecoveryBundle> {
  let parsed:unknown;
  try{parsed=JSON.parse(input);}catch{throw new ProgressionError('Malformed checksummed recovery bundle');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    throw new ProgressionError('Invalid checksummed recovery bundle');
  const b=parsed as Record<string,unknown>;
  if(Object.keys(b).sort().join(',')!=='kind,payload,schema,sha256'||
     b.kind!=='project-pokemon.standard.raw-recovery.sha256'||b.schema!==1||
     typeof b.payload!=='string'||typeof b.sha256!=='string'||
     !/^[0-9a-f]{64}$/.test(b.sha256))
    throw new ProgressionError('Unsupported checksummed recovery bundle');
  const actual=await sha256Hex(b.payload);
  if(actual!==b.sha256)throw new ProgressionError('Recovery bundle integrity check failed');
  return parseRawRecoveryBundle(b.payload);
}
