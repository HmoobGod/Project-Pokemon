import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressionError, type StorageLike} from '../src/progression.ts';
import {
  STANDARD_RECOVERY_SLOTS, exportRawRecoveryBundle, parseRawRecoveryBundle,
} from '../src/recovery-bundle.ts';

class Store implements StorageLike {
  data = new Map<string, string>();
  writes = 0;
  reads: string[] = [];
  getItem(key: string) { this.reads.push(key); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.data.set(key, value); }
  removeItem(key: string) { this.writes++; this.data.delete(key); }
}

test('raw bundle preserves corrupt primary, old-schema snapshots and exact raw strings', () => {
  const s = new Store();
  s.setItem(STANDARD_RECOVERY_SLOTS.primary, '{"broken');
  s.setItem(STANDARD_RECOVERY_SLOTS.backup, '{"schema":999,"unicode":"Pokémon\\n"}');
  s.setItem(STANDARD_RECOVERY_SLOTS.quarantine, 'raw \\r\\n Ω \\u0000');
  s.setItem('pokebonk.local.profile.v1', 'unrelated-edition');
  const before = new Map(s.data), writes = s.writes;
  const bundle = parseRawRecoveryBundle(exportRawRecoveryBundle(s));
  assert.equal(bundle.kind, 'project-pokemon.standard.raw-recovery');
  assert.equal(bundle.schema, 1);
  assert.equal(bundle.slots.primary, '{"broken');
  assert.equal(bundle.slots.backup, before.get(STANDARD_RECOVERY_SLOTS.backup));
  assert.equal(bundle.slots.quarantine, before.get(STANDARD_RECOVERY_SLOTS.quarantine));
  assert.equal(bundle.slots.preUndo, null);
  assert.deepEqual(s.data, before);
  assert.equal(s.writes, writes);
  assert.equal(s.reads.length, 12);
  assert.ok(s.reads.every(k => Object.values(STANDARD_RECOVERY_SLOTS).includes(k as never)));
});
test('bundle distinguishes absent slots from present empty raw strings', () => {
  const s = new Store();
  s.setItem(STANDARD_RECOVERY_SLOTS.preImport, '');
  const parsed = parseRawRecoveryBundle(exportRawRecoveryBundle(s));
  assert.equal(parsed.slots.preImport, '');
  assert.equal(parsed.slots.primary, null);
});
test('bundle refuses a detected concurrent change rather than exporting stale data', () => {
  const s = new Store();
  s.setItem(STANDARD_RECOVERY_SLOTS.primary, 'old-profile');
  let primaryReads = 0;
  const concurrent: Pick<StorageLike, 'getItem'> = {
    getItem(k) {
      if (k === STANDARD_RECOVERY_SLOTS.primary && ++primaryReads === 2)
        s.setItem(k, 'new-profile');
      return s.getItem(k);
    },
  };
  assert.throws(() => exportRawRecoveryBundle(concurrent), /changed during export/);
  assert.equal(s.getItem(STANDARD_RECOVERY_SLOTS.primary), 'new-profile');
});
test('reject malformed, incomplete, extra-slot and wrong-type bundles without any writes', () => {
  const s = new Store();
  const good = JSON.parse(exportRawRecoveryBundle(s));
  const invalid = [
    'broken-json',
    JSON.stringify({...good, kind: 'unknown'}),
    JSON.stringify({...good, slots: {...good.slots, injected: 'unexpected'}}),
    JSON.stringify({...good, slots: {primary: null}}),
    JSON.stringify({...good, slots: {...good.slots, backup: 5}}),
    JSON.stringify({...good, schema: 2}),
  ];
  const writes = s.writes;
  for (const item of invalid)
    assert.throws(() => parseRawRecoveryBundle(item), ProgressionError);
  assert.equal(s.writes, writes);
});
