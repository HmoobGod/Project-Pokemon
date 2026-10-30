import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StandardProgression, ProgressionError,
  type Catalog, type RewardPolicy, type StorageLike,
} from '../src/progression.ts';
import {assessRecoveryReadiness} from '../src/recovery-readiness.ts';

class Store implements StorageLike {
  values = new Map<string,string>();
  writes = 0;
  failPrimary = false;
  getItem(key:string) { return this.values.get(key) ?? null; }
  setItem(key:string,value:string) {
    if (this.failPrimary && key === 'pokebonk.standard.profile.v1')
      throw new Error('simulated primary quota failure');
    this.values.set(key,value);
    this.writes++;
  }
  removeItem(key:string) { this.values.delete(key); this.writes++; }
}
const catalog:Catalog={
  sourceVersion:'v0.7.4-synthetic-fixture',
  starters:[1], pokemon:[1],
  lab:[{id:'speed',costByLevel:[5]}],
  shop:[{key:'berry',price:3}],
  achievements:[],
  counterKeys:['kills'],
  maps:[{id:'forest'}],
};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?30:10};
let seq = 0;
function open(s:Store){return new StandardProgression(s,catalog,policy,()=>`run-${++seq}`);}
function win(p:StandardProgression) {
  const t=p.beginRun('forest');
  p.finishRun(t.id,{victory:true,counters:{kills:1}});
}
function fixture() {
  const s=new Store(), p=open(s);
  p.chooseStarter(1);win(p);win(p);
  return {s,p};
}
test('preflight is read-only, does not expose raw profile and ignores other-edition data',()=>{
  const {s,p}=fixture();
  s.setItem('pokebonk.local.profile.v1','unlocked-edition');
  const before=new Map(s.values),writes=s.writes;
  const result=assessRecoveryReadiness(s,catalog);
  assert.equal(result.slots.primary,'valid');
  assert.equal(result.slots.backup,'valid');
  assert.equal(result.slots.preUndo,'missing');
  assert.equal(result.restores.backup,'ready');
  const serialized = JSON.stringify(result);
  assert.deepEqual(Object.keys(result).sort(), ['restores','slots']);
  for (const raw of s.values.values()) {
    assert.ok(!serialized.includes(raw), 'preflight leaked raw saved-game content');
  }
  assert.ok(!serialized.includes('stardust') && !serialized.includes('schema'));
  assert.deepEqual(s.values,before);
  assert.equal(s.writes,writes);
  assert.equal(s.getItem('pokebonk.local.profile.v1'),'unlocked-edition');
  assert.ok(p.snapshot().stardust > 0);
});
test('F3: failed undo primary write keeps durable stash and preflight offers a safe retry',()=>{
  const {s,p}=fixture();
  p.restoreBackup();
  win(p);
  const before=s.getItem(p.key), preservedRestore=s.getItem(p.preRestoreKey);
  s.failPrimary=true;
  assert.throws(()=>p.restorePreRestore(),/simulated primary quota failure/);
  assert.equal(s.getItem(p.key),before);
  assert.equal(s.getItem(p.preUndoKey),before);
  assert.equal(s.getItem(p.preRestoreKey),preservedRestore);
  const writes=s.writes, preview=assessRecoveryReadiness(s,catalog);
  assert.equal(preview.restores.preRestore,'retry-with-preserved-pre-undo');
  assert.equal(s.writes,writes);
  s.failPrimary=false;
  p.restorePreRestore();
  assert.equal(s.getItem(p.key),preservedRestore);
  assert.equal(s.getItem(p.preUndoKey),before);
});
test('F4: pre-restore conflict after additional gameplay blocks redo without deleting newer progress',()=>{
  const {s,p}=fixture();
  p.restoreBackup();
  win(p);
  p.restorePreRestore();
  win(p);
  const before=s.getItem(p.key), preUndo=s.getItem(p.preUndoKey);
  const assessment=assessRecoveryReadiness(s,catalog);
  assert.equal(assessment.restores.preUndo,'protected-slot-conflict');
  const writes=s.writes;
  assert.throws(()=>p.restorePreUndo(),/Pre-restore snapshot exists/);
  assert.equal(s.getItem(p.key),before);
  assert.equal(s.getItem(p.preUndoKey),preUndo);
  assert.equal(s.writes,writes);
});
test('no-op preview takes precedence even when a protected slot is occupied',()=>{
  const {s,p}=fixture();
  const raw=s.getItem(p.key)!;
  s.setItem(p.preRestoreKey,raw);
  s.setItem(p.preUndoKey,'another-protected-snapshot');
  const preview=assessRecoveryReadiness(s,catalog);
  assert.equal(preview.restores.preRestore,'no-op');
});
test('unreadable, missing and future-schema target data are reported without restoring',()=>{
  const {s,p}=fixture();
  s.setItem(p.backupKey,'{broken');
  s.setItem(p.preImportKey,'{"schema":999}');
  const writes=s.writes,before=new Map(s.values);
  const status=assessRecoveryReadiness(s,catalog);
  assert.equal(status.slots.backup,'unreadable');
  assert.equal(status.slots.preImport,'unreadable');
  assert.equal(status.restores.backup,'unreadable-target');
  assert.equal(status.restores.preImport,'unreadable-target');
  assert.equal(status.restores.preUndo,'missing-target');
  assert.equal(s.writes,writes);
  assert.deepEqual(s.values,before);
});
test('invalid primary does not get silently recovered by preview',()=>{
  const {s,p}=fixture();
  s.setItem(p.key,'corrupted');
  const before=new Map(s.values),writes=s.writes;
  const result=assessRecoveryReadiness(s,catalog);
  assert.equal(result.slots.primary,'unreadable');
  assert.equal(result.restores.backup,'unavailable-primary');
  assert.equal(result.restores.preRestore,'unavailable-primary');
  assert.deepEqual(s.values,before);
  assert.equal(s.writes,writes);
  assert.throws(()=>open(s),ProgressionError);
});
test('observed concurrent write fails closed and never alters storage by itself',()=>{
  const {s,p}=fixture();
  let primaryReads=0;
  const racing:Pick<StorageLike,'getItem'>={
    getItem(key) {
      if(key===p.key && ++primaryReads===2) s.setItem(key,'newer-unrelated-bytes');
      return s.getItem(key);
    },
  };
  assert.throws(()=>assessRecoveryReadiness(racing,catalog),/changed during export/);
  assert.equal(s.getItem(p.key),'newer-unrelated-bytes');
});
