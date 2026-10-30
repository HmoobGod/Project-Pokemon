import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,type Catalog,type RewardPolicy,type StorageLike} from '../src/progression.ts';

class Store implements StorageLike {
  values = new Map<string,string>();
  writes: string[] = [];
  getItem(k:string){return this.values.get(k)??null;}
  setItem(k:string,v:string){this.writes.push('set:'+k);this.values.set(k,v);}
  removeItem(k:string){this.writes.push('remove:'+k);this.values.delete(k);}
}
const catalog:Catalog={
  sourceVersion:'v0.7.1-fixture',starters:[1],pokemon:[1],
  lab:[{id:'move',costByLevel:[5]}],shop:[{key:'berry',price:3}],
  achievements:[{id:'first',counter:'wins',goal:1,reward:2}],
  counterKeys:['kills'],maps:[{id:'forest'}],
};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?30:10};
let sequence=0;
function setup(){
  const store=new Store();
  const p=new StandardProgression(store,catalog,policy,()=>`run-${++sequence}`);
  p.chooseStarter(1);
  const run=p.beginRun('forest');
  p.finishRun(run.id,{victory:true,counters:{kills:1}});
  return {store,p};
}
function corruptAndRecover(store:Store,p:StandardProgression,corrupt:string){
  const good=store.getItem(p.backupKey)!;
  store.setItem(p.key,corrupt);
  StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.equal(store.getItem(p.key),good);
}
test('F1: static quarantine clear recovers a second corruption even though no instance can load',()=>{
  const {store,p}=setup();
  corruptAndRecover(store,p,'{corrupt-first');
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{corrupt-first');
  store.setItem(p.key,'{corrupt-second');
  assert.throws(()=>new StandardProgression(store,catalog,policy),ProgressionError);
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/Quarantined recovery snapshot exists/);
  const exported=StandardProgression.exportQuarantinedPrimary(store);
  const rawPrimary=store.getItem(p.key);
  const oldWriteCount=store.writes.length;
  assert.throws(()=>StandardProgression.clearQuarantine(store,'wrong',rawPrimary),/differs from expected/);
  assert.equal(store.writes.length,oldWriteCount);
  StandardProgression.clearQuarantine(store,exported!,rawPrimary);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
  assert.equal(store.getItem(p.key),'{corrupt-second');
  StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{corrupt-second');
});
test('F1: clearing requires matching primary snapshot, including during invalid-primary recovery',()=>{
  const {store,p}=setup();
  corruptAndRecover(store,p,'{original-corruption');
  store.setItem(p.key,'{new-primary-corruption');
  const before=store.writes.length;
  assert.throws(()=>StandardProgression.clearQuarantine(store,'{original-corruption','{wrong-primary'),/another session/);
  assert.equal(store.writes.length,before);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{original-corruption');
  assert.equal(store.getItem(p.key),'{new-primary-corruption');
});
test('F2: competing recoveries can never delete their only raw quarantine snapshot',()=>{
  const {store,p}=setup();
  const validBackup=store.getItem(p.backupKey)!;
  store.setItem(p.key,'{shared-corruption');
  let reads=0,secondCompleted=false;
  const racing:StorageLike={
    getItem(key){
      if(key===p.key && ++reads===3) {
        StandardProgression.recoverCorruptPrimary(store,catalog);
        secondCompleted=true;
      }
      return store.getItem(key);
    },
    setItem(key,value){store.setItem(key,value);},
    removeItem(key){store.removeItem(key);},
  };
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(racing,catalog),/another session/);
  assert.equal(secondCompleted,true);
  assert.equal(store.getItem(p.key),validBackup);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{shared-corruption');
  assert.equal(store.writes.filter(x=>x==='remove:'+p.recoveryQuarantineKey).length,0);
});
test('F2: unilateral failed recovery keeps its new quarantine on an interrupted primary write',()=>{
  const {store,p}=setup();
  store.setItem(p.key,'{raw-corruption');
  let reads=0;
  const conflict:StorageLike={
    getItem(k) {
      if(k===p.key && ++reads===3) store.setItem(p.key,'different-foreign-data');
      return store.getItem(k);
    },
    setItem(k,v){store.setItem(k,v);},
    removeItem(k){store.removeItem(k);},
  };
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(conflict,catalog),/another session/);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),'{raw-corruption');
  assert.equal(store.getItem(p.key),'different-foreign-data');
});
test('static quarantine clear does not mutate other edition storage',()=>{
  const {store,p}=setup();
  store.setItem('pokebonk.local.profile.v1','unlocked-edition');
  corruptAndRecover(store,p,'broken');
  StandardProgression.clearQuarantine(store,'broken',store.getItem(p.key));
  assert.equal(store.getItem('pokebonk.local.profile.v1'),'unlocked-edition');
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
});
