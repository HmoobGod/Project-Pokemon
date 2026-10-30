import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StandardProgression, ProgressionError, parseSave, freshState, validateCatalog,
  validateStateAgainstCatalog, MAX_PENDING_RUNS,
  type Catalog, type RewardPolicy, type StorageLike, type RunTicket
} from '../src/progression.ts';

class MemoryStore implements StorageLike {
  readonly data = new Map<string,string>();
  getItem(key:string) { return this.data.get(key) ?? null; }
  setItem(key:string, value:string) { this.data.set(key,value); }
  removeItem(key:string) { this.data.delete(key); }
}
const catalog: Catalog = {
  sourceVersion:'guard-fixture-v1',starters:[1,4,7],pokemon:[1,4,7],
  lab:[{id:'hp',costByLevel:[10]}],shop:[],achievements:[],counterKeys:['kills'],
  maps:[{id:'forest'},{id:'cave',requiresWinOf:'forest'},{id:'deep',requiresWinOf:'cave'}]
};
const policy:RewardPolicy = {calculateRunStardust:()=>0};
let id=0;
function start(store=new MemoryStore(), rules=catalog, reward=policy){
  return new StandardProgression(store,rules,reward,()=>`test-run-${++id}`);
}

test('map catalog refuses self-cycles and multi-map cycles',()=>{
  assert.throws(()=>validateCatalog({...catalog,maps:[{id:'forest',requiresWinOf:'forest'}]}),/no unlocked root|Cyclic/);
  assert.throws(()=>validateCatalog({...catalog,maps:[{id:'forest'},{id:'cave',requiresWinOf:'deep'},{id:'deep',requiresWinOf:'cave'}]}),/Cyclic/);
});
test('map catalog requires at least one accessible root and resolvable prerequisites',()=>{
  assert.throws(()=>validateCatalog({...catalog,maps:[{id:'cave',requiresWinOf:'missing'}]}),/Missing map prerequisite/);
  assert.throws(()=>validateCatalog({...catalog,maps:[{id:'forest',requiresWinOf:'cave'},{id:'cave',requiresWinOf:'forest'}]}),/no unlocked root/);
  assert.doesNotThrow(()=>validateCatalog(catalog));
});
test('imported map victories cannot skip required earlier maps',()=>{
  const s=freshState(catalog.sourceVersion);
  s.starter=4;s.pokemonUnlocked=[4];s.mapsWon=['deep'];
  assert.throws(()=>validateStateAgainstCatalog(s,catalog),/without prerequisite/);
  s.mapsWon=['forest','deep'];
  assert.throws(()=>validateStateAgainstCatalog(s,catalog),/without prerequisite/);
  s.mapsWon=['forest','cave','deep'];
  assert.doesNotThrow(()=>validateStateAgainstCatalog(s,catalog));
});
test('ticket parsing refuses extra fields and missing required fields',()=>{
  const s=freshState(catalog.sourceVersion);
  s.starter=4;s.pokemonUnlocked=[4];
  const extra = JSON.parse(JSON.stringify(s));
  extra.pendingRuns=[{id:'r1',map:'forest',mode:'classic',extra:'unverified'}];
  assert.throws(()=>parseSave(JSON.stringify(extra),catalog.sourceVersion),/Unexpected pending run ticket fields/);
  const missing=JSON.parse(JSON.stringify(s));
  missing.pendingRuns=[{id:'r1',map:'forest'}];
  assert.throws(()=>parseSave(JSON.stringify(missing),catalog.sourceVersion),/Unexpected pending run ticket fields/);
});
test('pending ticket cap rejects oversized imported save before mutation',()=>{
  const s=freshState(catalog.sourceVersion);
  s.starter=4;s.pokemonUnlocked=[4];
  s.pendingRuns=Array.from({length:MAX_PENDING_RUNS+1},(_,i)=>({id:`run-${i}`,map:'forest',mode:'classic'}));
  assert.throws(()=>parseSave(JSON.stringify(s),catalog.sourceVersion),/Too many pending run tickets/);
});
test('beginRun stops exactly at the cap without extra writes',()=>{
  const store=new MemoryStore(), p=start(store);p.chooseStarter(4);
  for(let i=0;i<MAX_PENDING_RUNS;i++)p.beginRun('forest');
  const raw=store.getItem(p.key);
  assert.equal(p.snapshot().pendingRuns.length,MAX_PENDING_RUNS);
  assert.throws(()=>p.beginRun('forest'),/Too many pending run tickets/);
  assert.equal(store.getItem(p.key),raw);
});
test('reward policy receives original classic/other mode from one-use ticket',()=>{
  const calls:RunTicket['mode'][]=[];
  const guardedReward:RewardPolicy = {calculateRunStardust:(_r,_map,mode)=>{calls.push(mode);return mode==='classic'?20:3;}};
  const p=start(new MemoryStore(),catalog,guardedReward);p.chooseStarter(4);
  const classic=p.beginRun('forest','classic');
  assert.equal(p.finishRun(classic.id,{victory:false,counters:{kills:1}}).earned,20);
  const other=p.beginRun('forest','other');
  assert.equal(p.finishRun(other.id,{victory:false,counters:{kills:1}}).earned,3);
  assert.deepEqual(calls,['classic','other']);
  assert.equal(p.snapshot().stardust,23);
});
