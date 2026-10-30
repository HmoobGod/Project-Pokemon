import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,type StorageLike,type Catalog,type RewardPolicy} from '../src/progression.ts';

class MemStore implements StorageLike {
  data = new Map<string,string>();
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){this.data.set(k,v);}
  removeItem(k:string){this.data.delete(k);}
}
// Synthetic test fixture: all numbers are illustrative, NOT official game values.
const catalog:Catalog={sourceVersion:'fixture-v1',starters:[1,4],pokemon:[1,2,4],lab:[{id:'move',costByLevel:[10,20]}],shop:[{key:'potion',price:25}],achievements:[{id:'kill5',counter:'kills',goal:5,reward:15}],counterKeys:['kills'],maps:[{id:'forest'},{id:'cave',requiresWinOf:'forest'}]};
const policy:RewardPolicy={calculateRunStardust:report=>report.victory?40:5};
function start(store=new MemStore()){let n=0;return {store,engine:new StandardProgression(store,catalog,policy,()=>`run-${++n}`)}};

test('fresh state has no Stardust, upgrades, or pre-unlocked roster',()=>{const {engine}=start();assert.equal(engine.snapshot().stardust,0);assert.deepEqual(engine.snapshot().pokemonUnlocked,[]);});
test('starter, earned reward, shop, Lab, achievement survive reload',()=>{
  const {engine,store}=start();engine.chooseStarter(4);
  assert.throws(()=>engine.beginRun('cave'),/locked/);
  const ticket=engine.beginRun('forest');
  const finished=engine.finishRun(ticket.id,{victory:true,counters:{kills:7},seen:[2],captures:[2]});
  assert.equal(finished.earned,40);assert.equal(finished.state.stardust,40);
  engine.buyLab('move');engine.buyItem('potion');engine.claimAchievement('kill5');
  const fresh=new StandardProgression(store,catalog,policy);
  const s=fresh.snapshot();assert.equal(s.stardust,20);assert.equal(s.totalStardust,55);
  assert.deepEqual(s.pokemonUnlocked,[4]);assert.equal(s.lab.move,1);assert.deepEqual(s.itemsOwned,['potion']);
  assert.deepEqual(s.questsClaimed,['kill5']);assert.deepEqual(s.mapsWon,['forest']);
  assert.equal(fresh.beginRun('cave').map,'cave');
});
test('a run is rewarded at most once including after reload',()=>{
  const {engine,store}=start();engine.chooseStarter(1);const t=engine.beginRun('forest');engine.finishRun(t.id,{victory:false,counters:{kills:2}});
  assert.throws(()=>engine.finishRun(t.id,{victory:true,counters:{kills:100}}),/already credited/);
  assert.throws(()=>new StandardProgression(store,catalog,policy).finishRun(t.id,{victory:true,counters:{kills:100}}),/already credited/);
});
test('insufficient funds, unearned achievement and duplicate purchases do not change save',()=>{
  const {engine,store}=start();engine.chooseStarter(1);const before=store.getItem(engine.key);
  assert.throws(()=>engine.buyItem('potion'),/Not enough/);
  assert.throws(()=>engine.buyLab('move'),/Not enough/);
  assert.throws(()=>engine.claimAchievement('kill5'),/not earned/);
  assert.equal(store.getItem(engine.key),before);
  const t=engine.beginRun('forest');engine.finishRun(t.id,{victory:true,counters:{kills:5}});
  engine.buyItem('potion');assert.throws(()=>engine.buyItem('potion'),/already owned/);
  engine.claimAchievement('kill5');assert.throws(()=>engine.claimAchievement('kill5'),/already claimed/);
});
test('corrupt primary is not silently replaced; explicit backup recovery works',()=>{
  const {engine,store}=start();engine.chooseStarter(4);const t=engine.beginRun('forest');engine.finishRun(t.id,{victory:true,counters:{kills:1}});
  const previous=store.getItem(engine.backupKey);
  store.setItem(engine.key,'not-json');
  assert.throws(()=>new StandardProgression(store,catalog,policy),ProgressionError);
  assert.equal(store.getItem(engine.key),'not-json');
  const recovered=StandardProgression.recoverCorruptPrimary(store,catalog);
  assert.deepEqual(recovered.pokemonUnlocked,[4]);
  const reopened=new StandardProgression(store,catalog,policy);
  assert.deepEqual(reopened.snapshot().pokemonUnlocked,[4]);
});
test('invalid inputs fail closed and do not grant rewards',()=>{
  const {engine}=start();assert.throws(()=>engine.chooseStarter(999),/ineligible/);engine.chooseStarter(4);
  const t=engine.beginRun('forest');
  assert.throws(()=>engine.finishRun(t.id,{victory:true,counters:{kills:NaN}}),/Invalid/);
  assert.throws(()=>engine.finishRun(t.id,{victory:true,counters:{kills:5},captures:[999]}),/Unknown Pokemon/);
  assert.throws(()=>engine.finishRun(t.id,{victory:true,counters:{wins:100}}),/reserved run counter/);
  assert.equal(engine.snapshot().stardust,0);assert.equal(engine.snapshot().pendingRuns.length,1);
});
test('saves cannot be mistaken for official-game saves or unlock-all edition',()=>{
  const {engine,store}=start();engine.chooseStarter(1);
  assert.ok(store.getItem('pokebonk.standard.profile.v1'));
  assert.equal(store.getItem('pokebonk.local.profile.v1'),null);
});

test('non-Classic wins do not unlock Classic map progression',()=>{
  const {engine}=start();engine.chooseStarter(4);
  const t=engine.beginRun('forest','other');
  engine.finishRun(t.id,{victory:true,counters:{kills:1}});
  assert.equal(engine.snapshot().mapsWon.length,0);
  assert.throws(()=>engine.beginRun('cave'),/locked/);
});
test('recovery refuses invalid backup and keeps original corrupt primary untouched',()=>{
  const {store,engine}=start();engine.chooseStarter(1);
  store.setItem(engine.backupKey,'broken');store.setItem(engine.key,'also-broken');
  assert.throws(()=>StandardProgression.recoverCorruptPrimary(store,catalog),/corrupt/);
  assert.equal(store.getItem(engine.key),'also-broken');
});


test('encounters and catches do not automatically bypass League unlock challenges',()=>{
  const {engine}=start();engine.chooseStarter(4);
  const ticket=engine.beginRun('forest');
  const result=engine.finishRun(ticket.id,{victory:true,counters:{kills:1},captures:[2],seen:[2]});
  assert.deepEqual(result.state.pokemonSeen,[4,2]);
  assert.deepEqual(result.state.pokemonUnlocked,[4]);
});
