import test from 'node:test';
import assert from 'node:assert/strict';
import {previewLeagueObjectives,type LeagueChallenge} from '../src/league.ts';
import {StandardProgression,type Catalog,type RewardPolicy,type StorageLike} from '../src/progression.ts';
class MemStore implements StorageLike {
  saved=new Map<string,string>();
  getItem(key:string){return this.saved.get(key)??null;}
  setItem(key:string,value:string){this.saved.set(key,value);}
  removeItem(key:string){this.saved.delete(key);}
}
const base:Catalog={sourceVersion:'synthetic',starters:[1,4,7],pokemon:[1,4,7,10,133,151],
  lab:[],shop:[],achievements:[],counterKeys:['kills','maxLevel','best_healed'],
  counterModes:{maxLevel:'max',best_healed:'max'},maps:[{id:'forest'}]};
const mock:RewardPolicy={calculateRunStardust:()=>0};
const rules:LeagueChallenge[]=[
  {id:10,starter:false,logic:'all',status:'client-objectives-only',conditions:[{counter:'kills',goal:12}]},
  {id:133,starter:false,logic:'all',status:'client-objectives-only',conditions:[{counter:'league',goal:15},{counter:'maxLevel',goal:30}]},
  {id:151,starter:false,logic:'all',status:'client-objectives-only',conditions:[{counter:'best_healed',goal:100}]}
];

test('best-in-run counters preserve max, while cumulative kills add',()=>{
  const store=new MemStore(),progress=new StandardProgression(store,base,mock,(()=>{let n=0;return()=>String(++n)})());
  progress.chooseStarter(1);
  const a=progress.beginRun('forest'); progress.finishRun(a.id,{victory:false,counters:{kills:7,maxLevel:35,best_healed:150}});
  const b=progress.beginRun('forest'); progress.finishRun(b.id,{victory:false,counters:{kills:8,maxLevel:20,best_healed:40}});
  const s=progress.snapshot();
  assert.equal(s.counters.kills,15);assert.equal(s.counters.maxLevel,35);assert.equal(s.counters.best_healed,150);
  assert.equal(new StandardProgression(store,base,mock).snapshot().counters.maxLevel,35);
});
test('client objective preview can be met but never authorizes a character unlock',()=>{
  const p=new StandardProgression(new MemStore(),base,mock);
  const s=p.snapshot();s.counters.kills=15;s.counters.maxLevel=35;s.counters.best_healed=150;
  s.pokemonUnlocked.push(1,4,7,10,133);
  const view=previewLeagueObjectives(rules,s,base);
  assert.equal(view[0]?.clientGoalsMet,true);
  assert.equal(view[0]?.canGrantUnlock,false);
  assert.equal(view[1]?.clientGoalsMet,null); // 'league' is not the same as League character count
  assert.equal(view[1]?.objectives[0]?.reason,'aggregate-ambiguous');
  assert.equal(view[2]?.clientGoalsMet,true);
  assert.ok(view.every(x=>!x.serverVerified&&!x.canGrantUnlock));
});
test('unverified max accumulation cannot be mistaken for an earned achievement',()=>{
  const catalog={...base,counterModes:undefined};
  const view=previewLeagueObjectives(rules,new StandardProgression(new MemStore(),catalog,mock).snapshot(),catalog);
  assert.equal(view[2]?.clientGoalsMet,null);
  assert.equal(view[2]?.objectives[0]?.observed,null);
});
test('malformed or duplicate League rule IDs fail closed',()=>{
  const state=new StandardProgression(new MemStore(),base,mock).snapshot();
  assert.throws(()=>previewLeagueObjectives([rules[0]!,rules[0]!],state,base),/Unsupported/);
  assert.throws(()=>previewLeagueObjectives([{...rules[0]!,conditions:[{counter:'kills',goal:-1}]}],state,base),/Malformed/);
});
test('unsupported counter modes are rejected by source catalog validation',()=>{
  assert.throws(()=>new StandardProgression(new MemStore(),{...base,counterModes:{kills:'gibberish' as 'max'}},mock),/Unsupported counter/);
  assert.throws(()=>new StandardProgression(new MemStore(),{...base,counterModes:{unknown:'max'}},mock),/Unsupported counter/);
});
