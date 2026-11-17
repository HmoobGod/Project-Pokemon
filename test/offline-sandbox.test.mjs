import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import '../offline-sandbox/engine.js';

const G=globalThis.PokeBonkOfflineDemo;
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../offline-sandbox');

test('game starts offline, with original placeholder geometry and ZERO progression rewards',()=>{
 const s=G.createGame(42);
 assert.equal(s.phase,'ready');
 assert.equal(s.rewards,0);
 G.start(s);
 assert.equal(s.phase,'running');
 assert.equal(s.player.hp,100);
 assert.equal(s.kills,0);
 assert.deepEqual(s.enemies,[]);
});
test('movement is bounded and diagonal speed is normalized',()=>{
 const s=G.start(G.createGame(4));
 G.step(s,{x:1,y:0},1/60);
 assert.ok(s.player.x>G.WIDTH/2);
 const initialY=s.player.y;
 G.step(s,{x:0,y:-1},1/60);
 assert.ok(s.player.y<initialY);
 for(let i=0;i<2500;i++)G.step(s,{x:1,y:-1},1/60);
 assert.ok(s.player.x<=G.WIDTH-14);
 assert.ok(s.player.y>=14);
});
test('same seed and controls produce identical offline progression within a demo run',()=>{
 const a=G.start(G.createGame(1234)),b=G.start(G.createGame(1234));
 for(let i=0;i<1300;i++){
   const input=i<200?{x:1,y:.4}:{x:-.25,y:0};
   G.step(a,input,1/60);G.step(b,input,1/60);
 }
 assert.deepEqual(a,b);
 assert.ok(a.nextEnemyId>1,'sandbox spawned opponents');
 assert.equal(a.rewards,0,'sandbox cannot earn currency or unlocks');
});
test('pause stops time, encounters and run events; resume does not reset state',()=>{
 const s=G.start(G.createGame(2));
 G.step(s,{},.05);
 G.pause(s);
 const before=structuredClone(s);
 for(let i=0;i<300;i++)G.step(s,{x:1,y:1},.05);
 assert.deepEqual(s,before);
 G.start(s);assert.equal(s.phase,'running');
 assert.equal(s.time,before.time);
 G.step(s,{},.05);
 assert.ok(s.time>before.time);
});
test('spawns and shots stay bounded; runs terminate without permanent awards',()=>{
 const s=G.start(G.createGame(7));
 for(let i=0;i<3601;i++){
  G.step(s,{x:0,y:0},1/60);
  assert.ok(s.enemies.length<=G.MAX_ENEMIES);
  assert.ok(s.shots.length<=G.MAX_SHOTS);
  assert.ok(s.player.hp>=0);
  assert.equal(s.rewards,0);
  if(s.phase==='finished')break;
 }
 assert.equal(s.phase,'finished');
 assert.ok(s.time<=G.DURATION);
 assert.equal(s.rewards,0);
 assert.throws(()=>G.createGame(-1),/Invalid demo seed/);
 const next=G.start(s);
 assert.equal(next.phase,'running');
 assert.equal(next.kills,0);
});
test('invalid timesteps and forged motion cannot produce NaN position',()=>{
 const s=G.start(G.createGame(10));
 assert.throws(()=>G.step(s,{},-1),/Invalid demo timestep/);
 assert.throws(()=>G.step(s,{},Number.NaN),/Invalid demo timestep/);
 G.step(s,{x:Infinity,y:NaN},1/60);
 assert.ok(Number.isFinite(s.player.x)&&Number.isFinite(s.player.y));
});
test('offline pages reference no network endpoints, remote resources or browser storage',async()=>{
 const [html,engine,app]=await Promise.all(
   ['index.html','engine.js','app.js'].map(name=>readFile(resolve(base,name),'utf8')));
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/script src="\.\/engine\.js"/);
 assert.match(html,/script src="\.\/app\.js"/);
 const all=html+'\n'+engine+'\n'+app;
 assert.doesNotMatch(all,/https?:\/\//i);
 assert.doesNotMatch(all,/<(?:script|link|img)[^>]+(?:src|href)="(?:https?:)?\/\//i);
 assert.doesNotMatch(all,/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
 assert.doesNotMatch(all,/\b(?:localStorage|sessionStorage|indexedDB)\b/);
 assert.doesNotMatch(all,/\b(?:pokebonk\.com|api\.pokebonk\.com)\b/i);
});
