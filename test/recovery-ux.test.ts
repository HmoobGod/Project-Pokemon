import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,type Catalog,type RewardPolicy,type StorageLike} from '../src/progression.ts';

class Store implements StorageLike {
  values = new Map<string,string>();
  writes: string[] = [];
  failKey: string | null = null;
  getItem(k:string){return this.values.get(k) ?? null;}
  setItem(k:string,v:string){
    if(k===this.failKey) throw new Error('simulated quota failure');
    this.writes.push(k); this.values.set(k,v);
  }
  removeItem(k:string){this.writes.push('remove:'+k);this.values.delete(k);}
}
const catalog:Catalog={
  sourceVersion:'fixture-v0.7',starters:[1],pokemon:[1,4],
  lab:[{id:'speed',costByLevel:[5]}],shop:[{key:'potion',price:3}],
  achievements:[{id:'wins1',counter:'wins',goal:1,reward:2}],
  counterKeys:['kills'],maps:[{id:'forest'}],
};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?30:10};
let nextId=0;
const open=(store:Store)=>new StandardProgression(store,catalog,policy,()=>`run-${++nextId}`);
function win(p:StandardProgression) {
  const ticket=p.beginRun('forest');
  p.finishRun(ticket.id,{victory:true,counters:{kills:1}});
}
function lose(p:StandardProgression) {
  const ticket=p.beginRun('forest');
  p.finishRun(ticket.id,{victory:false,counters:{kills:0}});
}
function setup() {
  const store=new Store(),p=open(store);
  p.chooseStarter(1);
  win(p);win(p);
  return {store,p};
}
test('undo after gameplay preserves both older restore target and newer post-restore progress',()=>{
  const {p,store}=setup();
  const newer=p.snapshot();
  p.restoreBackup();
  lose(p);
  const postRestore=p.snapshot();
  assert.notDeepEqual(postRestore,newer);
  p.restorePreRestore();
  assert.deepEqual(p.snapshot(),newer);
  assert.deepEqual(JSON.parse(store.getItem(p.preUndoKey)!),postRestore);
  p.restorePreUndo();
  assert.deepEqual(p.snapshot(),postRestore);
  assert.deepEqual(JSON.parse(store.getItem(p.preRestoreKey)!),newer);
});
test('duplicate undo is a no-op with zero storage writes, keeping pre-undo intact',()=>{
  const {p,store}=setup();
  p.restoreBackup();
  lose(p);
  p.restorePreRestore();
  const old=store.getItem(p.preUndoKey),writes=store.writes.length;
  p.restorePreRestore();
  assert.equal(store.writes.length,writes);
  assert.equal(store.getItem(p.preUndoKey),old);
});
test('new progress after undo cannot overwrite an existing different pre-undo recovery',()=>{
  const {p,store}=setup();
  p.restoreBackup();
  lose(p);
  p.restorePreRestore();
  const saved=store.getItem(p.preUndoKey);
  lose(p);
  const primary=store.getItem(p.key),count=store.writes.length;
  assert.throws(()=>p.restorePreRestore(),/Pre-undo snapshot exists/);
  assert.equal(store.getItem(p.key),primary);
  assert.equal(store.getItem(p.preUndoKey),saved);
  assert.equal(store.writes.length,count);
});
test('clearing pre-undo backup requires fresh writer and is explicit',()=>{
  const {p,store}=setup();
  p.restoreBackup();
  lose(p);
  p.restorePreRestore();
  const stale=open(store);
  p.clearPreUndoBackup();
  assert.equal(store.getItem(p.preUndoKey),null);
  lose(p);
  assert.throws(()=>stale.clearPreUndoBackup(),/another session/);
});
test('pre-undo stash quota failure leaves primary and existing restore snapshots intact',()=>{
  const {p,store}=setup();
  p.restoreBackup();
  lose(p);
  const before=store.getItem(p.key),restore=store.getItem(p.preRestoreKey);
  store.failKey=p.preUndoKey;
  assert.throws(()=>p.restorePreRestore(),/simulated quota failure/);
  assert.equal(store.getItem(p.key),before);
  assert.equal(store.getItem(p.preRestoreKey),restore);
  assert.equal(store.getItem(p.preUndoKey),null);
});
test('quarantine cannot be cleared without matching raw snapshot and fresh writer',()=>{
  const {p,store}=setup();
  const backup=store.getItem(p.backupKey);
  store.setItem(p.key,'{broken-v0.7');
  StandardProgression.recoverCorruptPrimary(store,catalog);
  const active=open(store);
  assert.equal(store.getItem(p.key),backup);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{broken-v0.7');
  assert.throws(()=>active.clearQuarantine('wrong'),/differs from expected/);
  const stale=open(store);
  active.clearQuarantine('{broken-v0.7');
  assert.equal(store.getItem(active.recoveryQuarantineKey),null);
  win(active);
  assert.throws(()=>stale.clearQuarantine('{broken-v0.7'),/another session/);
});
test('clearing quarantine does not touch other-game storage',()=>{
  const {p,store}=setup();
  store.setItem('pokebonk.local.profile.v1','unlocked-edition');
  store.setItem(p.key,'corrupt!');
  StandardProgression.recoverCorruptPrimary(store,catalog);
  const active=open(store),snapshot=StandardProgression.exportQuarantinedPrimary(store);
  assert.equal(snapshot,'corrupt!');
  active.clearQuarantine(snapshot!);
  assert.equal(store.getItem('pokebonk.local.profile.v1'),'unlocked-edition');
});
test('recovery refuses a foreign update before writing quarantine',()=>{
  const {p,store}=setup();
  const prior=store.getItem(p.backupKey)!;
  store.setItem(p.key,'{broken-v0.7');
  let reads=0;
  const switching:StorageLike={
    getItem(k) {
      if(k===p.key && ++reads===2) store.setItem(p.key,prior);
      return store.getItem(k);
    },
    setItem(k,v){store.setItem(k,v);},
    removeItem(k){store.removeItem(k);},
  };
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(switching,catalog),/another session/);
  // Another writer arrived BEFORE any quarantine was created.
  assert.equal(store.getItem(p.recoveryQuarantineKey),null);
  assert.equal(store.getItem(p.key),prior);
});
test('recovery preserves quarantined bytes when another session changes the primary',()=>{
  const {p,store}=setup();
  const prior=store.getItem(p.backupKey)!;
  store.setItem(p.key,'{broken-v0.7');
  let reads=0;
  const switching:StorageLike={
    getItem(k) {
      if(k===p.key && ++reads===3) store.setItem(p.key,prior);
      return store.getItem(k);
    },
    setItem(k,v){store.setItem(k,v);},
    removeItem(k){store.removeItem(k);},
  };
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(switching,catalog),/another session/);
  // A recovery that stashed the raw bytes must never delete them on a race.
  assert.equal(store.getItem(p.recoveryQuarantineKey),'{broken-v0.7');
  assert.equal(store.getItem(p.key),prior);
});
