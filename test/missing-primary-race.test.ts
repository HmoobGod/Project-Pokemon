import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,type Catalog,type RewardPolicy,type StorageLike} from '../src/progression.ts';

class Store implements StorageLike {
  data=new Map<string,string>();
  writes: string[]=[];
  getItem(key:string){return this.data.get(key)??null;}
  setItem(key:string,value:string){this.writes.push('set:'+key);this.data.set(key,value);}
  removeItem(key:string){this.writes.push('remove:'+key);this.data.delete(key);}
}
const catalog:Catalog={
  sourceVersion:'v0.7.2-fixture',starters:[1],pokemon:[1],
  lab:[{id:'speed',costByLevel:[5]}],shop:[{key:'berry',price:3}],
  achievements:[],counterKeys:['kills'],maps:[{id:'forest'}],
};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?30:10};
let ticketSeq=0;
function fixture(){
  const store=new Store(),p=new StandardProgression(store,catalog,policy,()=>String(++ticketSeq));
  p.chooseStarter(1);
  const ticket=p.beginRun('forest');
  p.finishRun(ticket.id,{victory:true,counters:{kills:1}});
  return {store,p};
}
test('N1: missing primary restores validated backup when no other tab writes',()=>{
  const {store,p}=fixture();
  const backup=store.getItem(p.backupKey)!;
  store.removeItem(p.key);
  const restored=StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.deepEqual(restored,JSON.parse(backup));
  assert.equal(store.getItem(p.key),backup);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
});
test('N1: recovery refuses a primary created by another tab during backup read',()=>{
  const {store,p}=fixture();
  const newer=store.getItem(p.key)!;
  store.removeItem(p.key);
  let injected=false;
  const racing:StorageLike={
    getItem(key){
      if(key===p.backupKey && !injected){injected=true;store.setItem(p.key,newer);}
      return store.getItem(key);
    },
    setItem(key,value){store.setItem(key,value);},
    removeItem(key){store.removeItem(key);},
  };
  const count=store.writes.length;
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(racing,catalog),/another session/);
  assert.equal(injected,true);
  assert.equal(store.getItem(p.key),newer);
  assert.equal(store.writes.length,count+1); // only injected foreign writer
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
});
test('N1: recovery refuses a primary written exactly at its final recheck',()=>{
  const {store,p}=fixture();
  const newer=store.getItem(p.key)!;
  store.removeItem(p.key);
  let primaryReads=0;
  const racing:StorageLike={
    getItem(key){
      if(key===p.key && ++primaryReads===2)store.setItem(p.key,newer);
      return store.getItem(key);
    },
    setItem(key,value){store.setItem(key,value);},
    removeItem(key){store.removeItem(key);},
  };
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(racing,catalog),/another session/);
  assert.equal(primaryReads,2);
  assert.equal(store.getItem(p.key),newer);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
});
test('N1: invalid backup cannot replace a missing primary or create quarantine',()=>{
  const {store,p}=fixture();
  store.removeItem(p.key);
  store.setItem(p.backupKey,'not-json');
  const writes=store.writes.length;
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),ProgressionError);
  assert.equal(store.writes.length,writes);
  assert.equal(store.getItem(p.key),null);
  assert.equal(StandardProgression.exportQuarantinedPrimary(store),null);
});
