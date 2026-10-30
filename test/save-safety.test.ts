import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,parseSave,validateStateAgainstCatalog,type Catalog,type RewardPolicy,type StorageLike} from '../src/progression.ts';

class MemoryStore implements StorageLike {
  data = new Map<string,string>();
  failKey: string|null = null;
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){if(k===this.failKey)throw new Error('Storage write failed');this.data.set(k,v);}
  removeItem(k:string){this.data.delete(k);}
}
const catalog: Catalog = {
  sourceVersion:'synthetic-v0.4',starters:[1,4,7],pokemon:[1,2,4,7],
  lab:[{id:'speed',costByLevel:[5,10]}],shop:[{key:'berry',price:3}],
  achievements:[{id:'first',counter:'kills',goal:2,reward:2}],
  counterKeys:['kills','best_healed'],counterModes:{best_healed:'max'},
  maps:[{id:'forest'}],
};
const rewardPolicy:RewardPolicy = {calculateRunStardust:r=>r.victory?30:10};
const start=(store=new MemoryStore())=>new StandardProgression(store,catalog,rewardPolicy);
function earnedSave(store:MemoryStore){const p=start(store);p.chooseStarter(4);const t=p.beginRun('forest');p.finishRun(t.id,{victory:true,counters:{kills:4,best_healed:8}});p.buyLab('speed');return p;}

test('manual export/import preserves genuine local state and isolate external app keys', async()=>{
  const firstStore=new MemoryStore();const original=earnedSave(firstStore);
  const serialized=await original.exportSave();
  const newStore=new MemoryStore();newStore.setItem('pokebonk.local.profile.v1','foreign-edition');
  const other=start(newStore);
  assert.deepEqual(await other.importSave(serialized),original.snapshot());
  assert.deepEqual(start(newStore).snapshot(),original.snapshot());
  assert.equal(newStore.getItem('pokebonk.local.profile.v1'),'foreign-edition');
});

test('import refuses to replace progress without explicit opt-in',async()=>{
  const source=new MemoryStore(), target=new MemoryStore();
  const original=earnedSave(source);
  const payload=await original.exportSave();
  const current=earnedSave(target), before=current.snapshot();
  await assert.rejects(current.importSave(payload),/explicit replace/);
  assert.deepEqual(current.snapshot(),before);
  const restored=await current.importSave(payload,{replace:true});
  assert.deepEqual(restored,original.snapshot());
  assert.ok(target.getItem(current.backupKey));
});

test('tampered backup payload is rejected without changing current save',async()=>{
  const original=earnedSave(new MemoryStore());const raw=await original.exportSave();
  const envelope=JSON.parse(raw) as {payload:string;sha256:string};
  envelope.payload=envelope.payload.replace('"stardust":25','"stardust":999');
  const targetStore=new MemoryStore(),target=start(targetStore),before=target.snapshot();
  await assert.rejects(target.importSave(JSON.stringify(envelope)),/integrity/);
  assert.deepEqual(target.snapshot(),before);
  assert.equal(targetStore.getItem(target.key),null);
});

test('wrong edition and source version fail closed',async()=>{
  const e=earnedSave(new MemoryStore()),data=JSON.parse(await e.exportSave());
  const target=start();
  for(const bad of [{...data,kind:'unlock-all'},{...data,sourceVersion:'other-game'}, {...data,schema:2}])
    await assert.rejects(target.importSave(JSON.stringify(bad)),/Wrong edition/);
});

test('catalog-incompatible but correctly checksummed import fails',async()=>{
  const e=earnedSave(new MemoryStore());const exported=JSON.parse(await e.exportSave());
  const bad=JSON.parse(exported.payload) as Record<string,unknown>;
  bad.itemsOwned=['fake-shop-entry'];
  exported.payload=JSON.stringify(bad);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(exported.payload));
  exported.sha256=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const target=start();
  await assert.rejects(target.importSave(JSON.stringify(exported)),/Unknown shop item/);
  assert.equal(target.snapshot().starter,null);
});

test('second instance cannot overwrite saved progress with stale snapshot',()=>{
  const store=new MemoryStore();const first=start(store),second=start(store);
  first.chooseStarter(1);
  assert.throws(()=>second.chooseStarter(4),/another session/);
  assert.deepEqual(start(store).snapshot(),first.snapshot());
});

test('stale import after asynchronous hash cannot overwrite newer save',async()=>{
  const source=earnedSave(new MemoryStore()), store=new MemoryStore();
  const old=start(store);const external=start(store);const data=await source.exportSave();
  external.chooseStarter(7);
  await assert.rejects(old.importSave(data,{replace:true}),/another session/);
  assert.deepEqual(start(store).snapshot(),external.snapshot());
});

test('storage write exception preserves in-memory and primary saves',()=>{
  const store=new MemoryStore(), p=start(store);p.chooseStarter(4);
  const prior=p.snapshot(),raw=store.getItem(p.key);
  store.failKey=p.key;
  assert.throws(()=>p.beginRun('forest'),/Storage write failed/);
  assert.deepEqual(p.snapshot(),prior);
  assert.equal(store.getItem(p.key),raw);
});

test('broken species arrays and unsafe record keys reject without credit',()=>{
  const store=new MemoryStore(),p=start(store);p.chooseStarter(4);const t=p.beginRun('forest');
  const before=store.getItem(p.key);
  assert.throws(()=>p.finishRun(t.id,{victory:true,counters:{kills:2},seen:'4' as unknown as number[]}),/Invalid run species list/);
  assert.equal(store.getItem(p.key),before);
});

test('corrupt catalog-controlled save cannot masquerade as valid',()=>{
  const store=new MemoryStore(), p=earnedSave(store);
  const raw=JSON.parse(store.getItem(p.key)!) as Record<string,unknown>;
  raw.lab={speed:3};
  assert.throws(()=>validateStateAgainstCatalog(parseSave(JSON.stringify(raw),catalog.sourceVersion),catalog),/Invalid Lab level/);
  store.setItem(p.key,JSON.stringify(raw));
  assert.throws(()=>start(store),/Invalid Lab level/);
});


test('unknown or prototype-looking top-level save fields fail closed',()=>{
  const store=new MemoryStore(), p=earnedSave(store);
  const bad=JSON.parse(store.getItem(p.key)!) as Record<string,unknown>;
  Object.defineProperty(bad,'__proto__',{value:{isAdmin:true},enumerable:true});
  assert.throws(()=>parseSave(JSON.stringify(bad),catalog.sourceVersion),/Unsupported save field/);
});

test('unrecognized counter keys are rejected from persisted saves',()=>{
  const store=new MemoryStore(),p=earnedSave(store),s=JSON.parse(store.getItem(p.key)!) as Record<string,unknown>;
  s.counters={kills:4,hidden:999};
  store.setItem(p.key,JSON.stringify(s));
  assert.throws(()=>start(store),/Unsupported counter/);
});

test('B1: recovery rejects a healthy primary without overwriting it',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const primary=store.getItem(p.key),backup=store.getItem(p.backupKey);
  assert.notEqual(primary,backup);
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/Primary is valid; refusing recovery/);
  assert.equal(store.getItem(p.key),primary);
  assert.equal(store.getItem(p.backupKey),backup);
});

test('B1: restoreBackup preserves current primary in a durable pre-restore slot',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const current=p.snapshot(),original=store.getItem(p.key);
  const priorBackup=store.getItem(p.backupKey);
  assert.notEqual(original,priorBackup);
  p.restoreBackup();
  assert.equal(store.getItem(p.preRestoreKey),original);
  assert.deepEqual(p.restorePreRestore(),current);
  assert.equal(store.getItem(p.preRestoreKey),original);
});

test('B2: replacing save then taking action preserves original pre-import snapshot',async()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const original=p.snapshot(),oldRaw=store.getItem(p.key);
  const source=start();source.chooseStarter(7);
  await p.importSave(await source.exportSave(),{replace:true});
  assert.equal(store.getItem(p.preImportKey),oldRaw);
  p.beginRun('forest');
  assert.equal(store.getItem(p.preImportKey),oldRaw);
  assert.deepEqual(p.restorePreImport(),original);
  assert.ok(store.getItem(p.preRestoreKey));
});

test('B2: a second replacement cannot silently destroy existing pre-import recovery',async()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const source=start();source.chooseStarter(7);
  const json=await source.exportSave();
  await p.importSave(json,{replace:true});
  const preImport=store.getItem(p.preImportKey);
  p.beginRun('forest');
  const before=store.getItem(p.key);
  await assert.rejects(p.importSave(json,{replace:true}),/Pre-import recovery exists/);
  assert.equal(store.getItem(p.key),before);
  assert.equal(store.getItem(p.preImportKey),preImport);
});

test('B2: clearing preserved import backup is explicit',async()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const source=start();source.chooseStarter(7);
  await p.importSave(await source.exportSave(),{replace:true});
  assert.ok(store.getItem(p.preImportKey));
  p.clearPreImportBackup();
  assert.equal(store.getItem(p.preImportKey),null);
  assert.throws(()=>p.restorePreImport(),/No pre-import/);
});

test('N1: orphaned rotating backup blocks a new profile and stays recoverable',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const oldBackup=store.getItem(p.backupKey);
  store.removeItem(p.key);
  assert.throws(()=>start(store),/Primary missing; backup available/);
  assert.equal(store.getItem(p.backupKey),oldBackup);
  const recovered=StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.deepEqual(recovered,parseSave(oldBackup!,catalog.sourceVersion));
});

test('B1: corrupt primary can still be explicitly recovered while incompatible version is preserved',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const backup=store.getItem(p.backupKey);
  store.setItem(p.key,'not-json');
  StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.equal(store.getItem(p.key),backup);
  store.setItem(p.key,JSON.stringify({...p.snapshot(),sourceVersion:'future-v2'}));
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/another game version/);
  assert.equal(JSON.parse(store.getItem(p.key)!).sourceVersion,'future-v2');
});

test('B1/B2: storage quota failure during pre-restore or pre-import keeps primary intact',async()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const original=store.getItem(p.key),memory=p.snapshot();
  store.failKey=p.preRestoreKey;
  assert.throws(()=>p.restoreBackup(),/Storage write failed/);
  assert.equal(store.getItem(p.key),original);
  assert.deepEqual(p.snapshot(),memory);
  const source=start();source.chooseStarter(7);
  store.failKey=p.preImportKey;
  await assert.rejects(p.importSave(await source.exportSave(),{replace:true}),/Storage write failed/);
  assert.equal(store.getItem(p.key),original);
  assert.deepEqual(p.snapshot(),memory);
});


test('B3: double restoreBackup is a byte-for-byte no-op and retains the newest undo',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const newest=store.getItem(p.key)!;
  const older=store.getItem(p.backupKey)!;
  assert.notEqual(newest,older);
  p.restoreBackup();
  assert.equal(store.getItem(p.key),older);
  assert.equal(store.getItem(p.preRestoreKey),newest);
  // Any storage write is a regression: a no-op should not damage either slot.
  store.setItem=()=>{throw new Error('Unexpected write on no-op restore');};
  assert.deepEqual(p.restoreBackup(),parseSave(older,catalog.sourceVersion));
  assert.equal(store.getItem(p.key),older);
  assert.equal(store.getItem(p.preRestoreKey),newest);
});

test('B3: restore then play then restoreBackup refuses to overwrite pending undo',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const newest=store.getItem(p.key)!;
  p.restoreBackup();
  const t=p.beginRun('forest');
  p.finishRun(t.id,{victory:false,counters:{kills:2,best_healed:10}});
  const before=store.getItem(p.key)!;
  assert.notEqual(before,newest);
  assert.throws(()=>p.restoreBackup(),/Pre-restore snapshot exists/);
  assert.equal(store.getItem(p.key),before);
  assert.equal(store.getItem(p.preRestoreKey),newest);
  assert.deepEqual(p.restorePreRestore(),parseSave(newest,catalog.sourceVersion));
});

test('B3: restoring pre-import cannot rotate away a different pre-restore undo',async()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const original=store.getItem(p.key)!;
  const other=start();other.chooseStarter(7);
  await p.importSave(await other.exportSave(),{replace:true});
  p.beginRun('forest');
  const beforeFirstRestore=store.getItem(p.key)!;
  p.restorePreImport();
  assert.equal(store.getItem(p.key),original);
  assert.equal(store.getItem(p.preRestoreKey),beforeFirstRestore);
  const t=p.beginRun('forest');
  p.finishRun(t.id,{victory:false,counters:{kills:1}});
  const current=store.getItem(p.key)!;
  assert.throws(()=>p.restorePreImport(),/Pre-restore snapshot exists/);
  assert.equal(store.getItem(p.key),current);
  assert.equal(store.getItem(p.preRestoreKey),beforeFirstRestore);
});

test('B3: explicitly clearing pre-restore snapshot permits another distinct restore',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const recent=store.getItem(p.key)!;
  p.restoreBackup();
  const older=store.getItem(p.key)!;
  p.beginRun('forest');
  assert.throws(()=>p.restoreBackup(),/Pre-restore snapshot exists/);
  p.clearPreRestoreBackup();
  assert.equal(store.getItem(p.preRestoreKey),null);
  p.restoreBackup();
  assert.notEqual(store.getItem(p.preRestoreKey),null);
  assert.notEqual(store.getItem(p.preRestoreKey),recent);
  assert.notEqual(store.getItem(p.preRestoreKey),older);
});

test('B3: restorePreRestore followed by restoreBackup safely keeps the newer undo',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const recent=store.getItem(p.key)!;
  p.restoreBackup();
  p.restorePreRestore();
  assert.equal(store.getItem(p.key),recent);
  p.restoreBackup();
  assert.equal(store.getItem(p.preRestoreKey),recent);
});

test('N12: a readable newer-schema primary cannot be downgraded by recovery',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const backup=store.getItem(p.backupKey)!;
  const future=JSON.stringify({...p.snapshot(),schema:2,newField:{important:'future-progress'}});
  store.setItem(p.key,future);
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/incompatible save schema/);
  assert.equal(store.getItem(p.key),future);
  assert.equal(store.getItem(p.backupKey),backup);
  const missingSchema=JSON.stringify({sourceVersion:catalog.sourceVersion,unknown:'possibly-new-profile'});
  store.setItem(p.key,missingSchema);
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/incompatible save schema/);
  assert.equal(store.getItem(p.key),missingSchema);
});

test('B3: a failed first pre-restore stash never changes the current primary',()=>{
  const store=new MemoryStore(),p=earnedSave(store);
  const current=store.getItem(p.key)!;
  store.failKey=p.preRestoreKey;
  assert.throws(()=>p.restoreBackup(),/Storage write failed/);
  assert.equal(store.getItem(p.key),current);
  assert.equal(store.getItem(p.preRestoreKey),null);
});
