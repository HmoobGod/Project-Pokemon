import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StandardProgression, ProgressionError, MAX_PENDING_RUNS, freshState,
  validateStateAgainstCatalog, type Catalog, type StorageLike, type RewardPolicy,
} from '../src/progression.ts';

class Store implements StorageLike {
  readonly data = new Map<string,string>();
  failKey: string|null = null;
  writes: string[] = [];
  getItem(key:string){return this.data.get(key) ?? null;}
  setItem(key:string,value:string){if(key===this.failKey)throw new Error('simulated quota failure');this.writes.push(key);this.data.set(key,value);}
  removeItem(key:string){this.data.delete(key);}
}
const catalog:Catalog = {
  sourceVersion:'fixture-v0.6',starters:[1,4],pokemon:[1,4],lab:[],shop:[],achievements:[],
  counterKeys:['kills'],maps:[{id:'forest'},{id:'cave',requiresWinOf:'forest'}],
};
let id=0;
const start=(store=new Store(),policy:RewardPolicy={calculateRunStardust:()=>0})=>
  new StandardProgression(store,catalog,policy,()=>`v06-${++id}`);
function withBackup(){
  const store=new Store();const p=start(store);p.chooseStarter(4);p.beginRun('forest');
  return {store,p};
}
const corruptBy=(store:Store,p:StandardProgression,transform:(v:any)=>void)=>{
  const value=JSON.parse(store.getItem(p.key)!);transform(value);const raw=JSON.stringify(value);store.setItem(p.key,raw);return raw;
};

test('abandon consumes exactly one ticket with zero reward, counters or unlocks',()=>{
  let called=0;
  const store=new Store(),p=start(store,{calculateRunStardust:()=>{called++;return 99;}});
  p.chooseStarter(4);const t=p.beginRun('forest');const before=p.snapshot();
  const state=p.abandonRun(t.id);
  assert.deepEqual(state.pendingRuns,[]);
  assert.deepEqual(state.processedRuns,[t.id]);
  assert.equal(state.counters.runs,undefined);assert.equal(state.counters.wins,undefined);
  assert.equal(state.stardust,before.stardust);assert.equal(state.totalStardust,before.totalStardust);
  assert.equal(state.mapsWon.length,0);assert.equal(called,0);
  assert.throws(()=>p.finishRun(t.id,{victory:true,counters:{kills:1}}),/Unknown or already credited/);
  assert.throws(()=>p.abandonRun(t.id),/Unknown or already processed/);
  assert.deepEqual(start(store).snapshot(),state);
});

test('abandoning one pending run frees a slot even at the cap',()=>{
  const store=new Store(),p=start(store);p.chooseStarter(1);
  const tickets=Array.from({length:MAX_PENDING_RUNS},()=>p.beginRun('forest'));
  assert.throws(()=>p.beginRun('forest'),/Too many pending/);
  p.abandonRun(tickets[0].id);
  const next=p.beginRun('forest');
  assert.equal(p.snapshot().pendingRuns.length,MAX_PENDING_RUNS);
  assert.equal(p.snapshot().processedRuns.includes(tickets[0].id),true);
  assert.equal(p.snapshot().pendingRuns.includes(next),false); // snapshot is a deep copy
  assert.equal(p.snapshot().pendingRuns.some(x=>x.id===next.id),true);
});

test('unknown abandonment does not touch storage and cannot credit a reward',()=>{
  const store=new Store(),p=start(store);p.chooseStarter(4);
  const before=store.getItem(p.key);const writes=store.writes.length;
  assert.throws(()=>p.abandonRun('missing'),/Unknown or already processed/);
  assert.equal(store.getItem(p.key),before);assert.equal(store.writes.length,writes);
});

test('pending ticket for a locked map is rejected during save validation',()=>{
  const state=freshState(catalog.sourceVersion);
  state.starter=4;state.pokemonUnlocked=[4];state.pendingRuns=[{id:'r1',map:'cave',mode:'classic'}];
  assert.throws(()=>validateStateAgainstCatalog(state,catalog),/Pending run map is locked/);
  state.mapsWon=['forest'];
  assert.doesNotThrow(()=>validateStateAgainstCatalog(state,catalog));
});

test('save with no starter cannot smuggle prior map victories',()=>{
  const state=freshState(catalog.sourceVersion);state.mapsWon=['forest'];
  assert.throws(()=>validateStateAgainstCatalog(state,catalog),/Progress exists before starter/);
});

test('import refuses locked pending ticket with zero writes after integrity check',async()=>{
  const source=start();source.chooseStarter(4);
  const envelope=JSON.parse(await source.exportSave());const payload=JSON.parse(envelope.payload);
  payload.pendingRuns=[{id:'locked',map:'cave',mode:'classic'}];
  envelope.payload=JSON.stringify(payload);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(envelope.payload)));
  envelope.sha256=[...hash].map(x=>x.toString(16).padStart(2,'0')).join('');
  const targetStore=new Store(),target=start(targetStore),before=target.snapshot();
  const writes=targetStore.writes.length;
  await assert.rejects(target.importSave(JSON.stringify(envelope)),/Pending run map is locked/);
  assert.equal(targetStore.writes.length,writes);assert.deepEqual(target.snapshot(),before);
});

test('v0.5-compatible readable 129-ticket primary is never lost on recovery',()=>{
  const {store,p}=withBackup();
  const rejected=corruptBy(store,p,s=>{s.pendingRuns=Array.from({length:MAX_PENDING_RUNS+1},(_,i)=>({id:`old-${i}`,map:'forest',mode:'classic'}));});
  const validBackup=store.getItem(p.backupKey);
  const result=StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.equal(result.pendingRuns.length,0); // fallback was the prior valid profile
  assert.equal(store.getItem(p.key),validBackup);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),rejected);
  const recovered=start(store);recovered.beginRun('forest');
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),rejected);
});

test('malformed JSON primary is preserved as raw bytes after backup restore',()=>{
  const {store,p}=withBackup();const backup=store.getItem(p.backupKey);
  store.setItem(p.key,'{incomplete-game-progress');
  StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.equal(store.getItem(p.key),backup);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{incomplete-game-progress');
});

test('existing quarantine cannot be replaced by a different rejected primary',()=>{
  const {store,p}=withBackup();
  store.setItem(p.key,'{bad:first');
  StandardProgression.recoverCorruptPrimary(store,catalog);
  store.setItem(p.key,'{bad:second');const primary=store.getItem(p.key);
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/Quarantined recovery snapshot exists/);
  assert.equal(store.getItem(p.key),primary);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{bad:first');
});

test('quarantine quota failure leaves invalid primary and backup unchanged',()=>{
  const {store,p}=withBackup();const backup=store.getItem(p.backupKey);
  store.setItem(p.key,'{broken');store.failKey=p.recoveryQuarantineKey;
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/simulated quota failure/);
  assert.equal(store.getItem(p.key),'{broken');assert.equal(store.getItem(p.backupKey),backup);
});

test('unrecognized future schema still refuses recovery and leaves quarantine empty',()=>{
  const {store,p}=withBackup();
  const future=JSON.stringify({schema:2,sourceVersion:catalog.sourceVersion,meta:'future'});
  store.setItem(p.key,future);
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/incompatible save schema/);
  assert.equal(store.getItem(p.key),future);assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
});

test('invalid recovery backup never creates a quarantine snapshot',()=>{
  const {store,p}=withBackup();store.setItem(p.key,'{broken');store.setItem(p.backupKey,'invalid-json');
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),ProgressionError);
  assert.equal(store.getItem(p.key),'{broken');assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
});
