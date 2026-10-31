import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,parseSave,type Catalog,type RewardPolicy,type StorageLike}
 from '../src/progression.ts';

class Store implements StorageLike {
  data=new Map<string,string>();writes=0;
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){this.writes++;this.data.set(key,value);}
  removeItem(key:string){this.writes++;this.data.delete(key);}
}
const catalog:Catalog={sourceVersion:'monotonic-fixture',starters:[1],pokemon:[1],
 lab:[{id:'speed',costByLevel:[5]}],shop:[{key:'berry',price:3}],
 achievements:[],counterKeys:['kills'],maps:[{id:'forest'}]};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?4:0};
function open(s:Store,seed:()=>string=()=> 'legacy'){
 return new StandardProgression(s,catalog,policy,seed);
}
function finish(p:StandardProgression,run:string){
 return p.finishRun(run,{victory:true,counters:{kills:1}});
}

test('opt-in preserves legacy run history and stops its growth for finished/abandoned/reloaded runs',()=>{
 const s=new Store();let n=0;const id=()=> 'old-'+(++n);
 const p=open(s,id);p.chooseStarter(1);
 finish(p,p.beginRun('forest').id);finish(p,p.beginRun('forest').id);
 const prior=p.snapshot(),raw=s.getItem(p.key);
 assert.throws(()=>p.enableMonotonicRunIds(),/Export and confirm a backup/);
 assert.equal(prior.processedRuns.length,2);
 const opted=p.enableMonotonicRunIds({backupConfirmed:true});
 assert.deepEqual(opted.processedRuns,prior.processedRuns);
 assert.deepEqual(prior.processedRuns,['old-1','old-2']);
 assert.equal(opted.runSequence?.next,0);
 assert.equal(opted.runSequence?.namespace,'r2:old-3:');
 assert.notEqual(s.getItem(p.key),raw);
 const first=p.beginRun('forest');assert.equal(first.id,'r2:old-3:0');
 const firstOutcome=finish(p,first.id);
 assert.equal(firstOutcome.earned,4);
 assert.equal(p.snapshot().processedRuns.length,2);
 const second=p.beginRun('forest');assert.equal(second.id,'r2:old-3:1');
 p.abandonRun(second.id);
 assert.deepEqual(p.snapshot().processedRuns,prior.processedRuns);
 assert.throws(()=>finish(p,first.id),/Unknown or already credited run/);
 assert.throws(()=>p.abandonRun(second.id),/Unknown or already processed/);
 const reopened=open(s,()=> 'old-1');
 const third=reopened.beginRun('forest');assert.equal(third.id,'r2:old-3:2');
 finish(reopened,third.id);
 const state=reopened.snapshot();
 assert.deepEqual(state.processedRuns,prior.processedRuns);
 assert.equal(state.runSequence?.next,3);
 assert.equal(state.counters.runs,4);
 assert.equal(state.stardust,16);
 assert.deepEqual(parseSave(s.getItem(reopened.key)!,catalog.sourceVersion),state);
});

test('enable is explicit, disallows old pending tickets and cannot be enabled twice',()=>{
 const s=new Store(),p=open(s,()=> 'seed');
 assert.throws(()=>p.enableMonotonicRunIds({backupConfirmed:true}),/Choose a starter/);
 p.chooseStarter(1);
 const pending=p.beginRun('forest');
 const before=s.getItem(p.key),writes=s.writes;
 assert.throws(()=>p.enableMonotonicRunIds({backupConfirmed:true}),/pending runs/);
 assert.equal(s.getItem(p.key),before);assert.equal(s.writes,writes);
 p.abandonRun(pending.id);
 p.enableMonotonicRunIds({backupConfirmed:true});
 assert.throws(()=>p.enableMonotonicRunIds({backupConfirmed:true}),/already enabled/);
 assert.deepEqual(p.snapshot().processedRuns,['seed']);
});

test('namespace collisions fail closed and never erase historical replay protection',()=>{
 const s=new Store(),p=open(s,()=> 'r2:collision:0');p.chooseStarter(1);
 finish(p,p.beginRun('forest').id);
 const reopened=open(s,()=> 'collision'),before=s.getItem(p.key),writes=s.writes;
 assert.throws(()=>reopened.enableMonotonicRunIds({backupConfirmed:true}),/collides with old run IDs/);
 assert.equal(s.getItem(p.key),before);assert.equal(s.writes,writes);
 const minted=open(s,()=> 'r2:collision:0');
 assert.throws(()=>minted.beginRun('forest'),/Repeated run ID/);
});

test('corrupted monotonic metadata, counterfeit pending IDs and namespace collisions are rejected',()=>{
 const s=new Store(),p=open(s,()=> 'seed');p.chooseStarter(1);
 p.enableMonotonicRunIds({backupConfirmed:true});
 const raw=JSON.parse(s.getItem(p.key)!);
 const mutated=[
  {...raw,runSequence:{namespace:'r2:seed:',next:-1}},
  {...raw,runSequence:{namespace:'r2:seed:',next:'0'}},
  {...raw,runSequence:{namespace:'r2:seed:',next:1,extra:3}},
  {...raw,runSequence:{namespace:'r2:seed:',next:1.5}},
  {...raw,runSequence:{namespace:'unsafe',next:0}},
  {...raw,runSequence:{namespace:'r2:seed:',next:1},pendingRuns:[{id:'r2:seed:1',map:'forest',mode:'classic'}]},
  {...raw,runSequence:{namespace:'r2:seed:',next:1},pendingRuns:[{id:'foreign-ticket',map:'forest',mode:'classic'}]},
  {...raw,runSequence:{namespace:'r2:seed:',next:1},processedRuns:['r2:seed:0']},
 ];
 for(const bad of mutated) {
   assert.throws(()=>parseSave(JSON.stringify(bad),catalog.sourceVersion),ProgressionError);
 }
 assert.equal(p.snapshot().runSequence?.next,0);
});

test('monotonic counter exhaustion and stale-writer fail without issuing duplicate tickets',()=>{
 const s=new Store(),p=open(s,()=> 'epoch');p.chooseStarter(1);
 p.enableMonotonicRunIds({backupConfirmed:true});
 const stale=open(s);
 const first=p.beginRun('forest');
 assert.throws(()=>stale.beginRun('forest'),/another session/);
 finish(p,first.id);
 const advanced=JSON.parse(s.getItem(p.key)!);
 advanced.runSequence.next=Number.MAX_SAFE_INTEGER;
 s.setItem(p.key,JSON.stringify(advanced));
 const capped=open(s,()=> 'epoch'),before=s.getItem(p.key);
 assert.throws(()=>capped.beginRun('forest'),/counter exhausted/);
 assert.equal(s.getItem(p.key),before);
});
