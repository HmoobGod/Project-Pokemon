import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,parseSave,type Catalog,type StorageLike,type RewardPolicy}
 from '../src/progression.ts';

class Store implements StorageLike {
  data=new Map<string,string>();
  writes=0;
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){this.writes++;this.data.set(k,v);}
  removeItem(k:string){this.writes++;this.data.delete(k);}
}
const catalog:Catalog={sourceVersion:'import-run-mode-fixture',starters:[1],pokemon:[1],
 lab:[{id:'speed',costByLevel:[5]}],shop:[{key:'berry',price:3}],
 achievements:[],counterKeys:['kills'],maps:[{id:'forest'}]};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?12:0};
function open(s:Store,seed:string='seed'){
 return new StandardProgression(s,catalog,policy,()=>seed);
}
function legacy(seed='legacy'){
 const s=new Store(),p=open(s,seed);
 p.chooseStarter(1);
 const ticket=p.beginRun('forest');p.finishRun(ticket.id,{victory:true,counters:{kills:1}});
 return {s,p};
}
function monotonic(seed='mode'){
 const s=new Store(),p=open(s,seed);
 p.chooseStarter(1);
 p.enableMonotonicRunIds({backupConfirmed:true});
 return {s,p};
}

test('import legacy into monotonic profile refuses silently retaining opt-in; explicit import replaces all fields',async()=>{
 const source=legacy('legacy-id'),target=monotonic('mode-seed');
 const exportText=await source.p.exportSave(),oldRaw=target.s.getItem(target.p.key);
 const old=target.p.snapshot(),beforeWrites=target.s.writes;
 await assert.rejects(target.p.importSave(exportText,{replace:true}),/Run-ID mode or sequence change/);
 assert.equal(target.s.writes,beforeWrites);
 assert.equal(target.s.getItem(target.p.key),oldRaw);
 assert.equal(target.s.getItem(target.p.preImportKey),null);
 assert.deepEqual(target.p.snapshot(),old);
 await assert.rejects(target.p.importSave(exportText,{replace:true,confirmRunIdModeChange:'true' as unknown as boolean}),/explicit confirmation/);
 const imported=await target.p.importSave(exportText,{replace:true,confirmRunIdModeChange:true});
 assert.deepEqual(imported,source.p.snapshot());
 assert.equal(Object.hasOwn(imported,'runSequence'),false,'legacy mode must NOT retain stale optional field');
 assert.equal(target.s.getItem(target.p.preImportKey),oldRaw,'pre-import raw opted-in profile must survive');
 assert.deepEqual(open(target.s).snapshot(),source.p.snapshot());
 const next=target.p.beginRun('forest');
 assert.equal(next.id,'mode-seed','legacy factory should be used after full-state replacement');
});

test('import monotonic into legacy profile requires explicit mode acknowledgment and retains source counter',async()=>{
 const source=monotonic('new-mode'),target=legacy('legacy-id');
 const first=source.p.beginRun('forest');
 source.p.abandonRun(first.id);
 const before=target.p.snapshot(),raw=target.s.getItem(target.p.key);
 const exported=await source.p.exportSave(),beforeWrites=target.s.writes;
 await assert.rejects(target.p.importSave(exported,{replace:true}),/Run-ID mode or sequence change/);
 assert.equal(target.s.writes,beforeWrites);
 assert.equal(target.s.getItem(target.p.key),raw);
 assert.deepEqual(target.p.snapshot(),before);
 const imported=await target.p.importSave(exported,{replace:true,confirmRunIdModeChange:true});
 assert.deepEqual(imported,source.p.snapshot());
 assert.equal(imported.runSequence?.next,1);
 assert.equal(target.s.getItem(target.p.preImportKey),raw);
 const next=target.p.beginRun('forest');
 assert.equal(next.id,'r2:new-mode:1');
});

test('import between monotonic profiles or to an earlier counter is also explicitly guarded',async()=>{
 const source=monotonic('source'),target=monotonic('target');
 const exported=await source.p.exportSave();
 await assert.rejects(target.p.importSave(exported,{replace:true}),/Run-ID mode or sequence change/);
 const rollback=monotonic('rollback');
 const early=await rollback.p.exportSave();
 const ticket=rollback.p.beginRun('forest');
 rollback.p.abandonRun(ticket.id);
 const raw=rollback.s.getItem(rollback.p.key);
 await assert.rejects(rollback.p.importSave(early,{replace:true}),/Run-ID mode or sequence change/);
 assert.equal(rollback.s.getItem(rollback.p.key),raw);
 // Explicit rollback is allowed only with separate confirmation, and is NOT replay-proof.
 const snapshot=await rollback.p.importSave(early,{replace:true,confirmRunIdModeChange:true});
 assert.equal(snapshot.runSequence?.next,0);
 assert.equal(rollback.s.getItem(rollback.p.preImportKey),raw);
 assert.deepEqual(parseSave(rollback.s.getItem(rollback.p.key)!,catalog.sourceVersion),snapshot);
});

test('backup acknowledgment requires actual true, not truthy strings or numbers',()=>{
 const s=new Store(),p=open(s,'truth');
 p.chooseStarter(1);
 const before=s.getItem(p.key),writes=s.writes;
 for(const value of ['false','true',1,{},[]]){
  assert.throws(()=>p.enableMonotonicRunIds({backupConfirmed:value as unknown as boolean}),/Export and confirm a backup/);
 }
 assert.equal(s.writes,writes);
 assert.equal(s.getItem(p.key),before);
 assert.equal(p.snapshot().runSequence,undefined);
 p.enableMonotonicRunIds({backupConfirmed:true});
 assert.equal(p.snapshot().runSequence?.namespace,'r2:truth:');
});

test('parseSave forbids noncanonical suffixes, extra namespace colon and legacy pending ticket',()=>{
 const {s,p}=monotonic('seed');
 const raw=JSON.parse(s.getItem(p.key)!) as Record<string,unknown>;
 const pending=(id:string)=>[{id,map:'forest',mode:'classic'}];
 const cases=[
  {...raw,runSequence:{namespace:'r2:seed:',next:3},pendingRuns:pending('r2:seed:01')},
  {...raw,runSequence:{namespace:'r2:seed:',next:3},pendingRuns:pending('r2:seed:1e0')},
  {...raw,runSequence:{namespace:'r2:seed:other:',next:3},pendingRuns:pending('r2:seed:other:0')},
  {...raw,runSequence:{namespace:'r2:seed:',next:3},pendingRuns:pending('oldid-0')},
 ];
 for(const value of cases)assert.throws(()=>parseSave(JSON.stringify(value),catalog.sourceVersion),ProgressionError);
 assert.equal(p.snapshot().runSequence?.next,0);
});
