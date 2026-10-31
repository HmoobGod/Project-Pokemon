// Differential parity test: assessRecoveryReadiness previews vs the real restore methods.
// Supplied with Claude's PR #8 independent review. Every combination of five slots
// (null / A / B / C / corrupt) checks that "safe" previews are never refused
// by the actual live restore method; inspection must not write or expose raw saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression, type Catalog, type RewardPolicy, type StorageLike} from '../src/progression.ts';
import {assessRecoveryReadiness} from '../src/recovery-readiness.ts';
import {STANDARD_RECOVERY_SLOTS as S} from '../src/recovery-bundle.ts';

class Store implements StorageLike {
  v = new Map<string,string>(); writes = 0;
  getItem(k:string){return this.v.get(k) ?? null;}
  setItem(k:string,x:string){this.writes++;this.v.set(k,x);}
  removeItem(k:string){this.writes++;this.v.delete(k);}
}
const catalog:Catalog={sourceVersion:'parity-fixture',starters:[1],pokemon:[1],lab:[{id:'m',costByLevel:[5]}],
  shop:[{key:'b',price:3}],achievements:[],counterKeys:['kills'],maps:[{id:'f'}]};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?30:10};
let seq=0; const idf=()=>`p${++seq}`;

test('preview never says safe when the live restore method would refuse (all slot combinations)',()=>{
  const gen=new Store(), g=new StandardProgression(gen,catalog,policy,idf); g.chooseStarter(1);
  const raws:string[]=[];
  for(let i=0;i<3;i++){const t=g.beginRun('f');g.finishRun(t.id,{victory:true,counters:{kills:1}});raws.push(gen.getItem(S.primary)!);}
  assert.equal(new Set(raws).size,3);
  const pool:(string|null)[]=[null,...raws,'{corrupt'];
  const slots=['primary','backup','preImport','preRestore','preUndo'] as const;
  const actions=[['backup','restoreBackup'],['preImport','restorePreImport'],['preRestore','restorePreRestore'],['preUndo','restorePreUndo']] as const;
  const falseSafe:string[]=[]; let checked=0;
  for(let n=0;n<pool.length**5;n++){
    const pick=slots.map((_,i)=>pool[Math.floor(n/pool.length**i)%pool.length]);
    const mk=()=>{const s=new Store();slots.forEach((nm,i)=>{if(pick[i]!==null)s.v.set(S[nm],pick[i]!);});return s;};
    const probe=mk(), before=new Map(probe.v), result=assessRecoveryReadiness(probe,catalog);
    assert.equal(probe.writes,0); assert.deepEqual(probe.v,before);
    const serialized=JSON.stringify(result);
    assert.ok(!serialized.includes('corrupt') && !serialized.includes('stardust') && !serialized.includes('schema'));
    for(const [key,method] of actions){
      checked++;
      const label=result.restores[key];
      if(!['ready','retry-with-preserved-pre-undo','no-op'].includes(label)) continue;
      let ok=false;
      try{const inst=new StandardProgression(mk(),catalog,policy,idf);(inst as any)[method]();ok=true;}catch{}
      if(!ok) falseSafe.push(`${JSON.stringify(pick.map(x=>x===null?'null':x.slice(0,8)))} ${method} -> ${label}`);
    }
  }
  assert.ok(checked>=12500);
  assert.deepEqual(falseSafe,[]);
});
