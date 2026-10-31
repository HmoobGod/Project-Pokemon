// Claude PR #11 N1: compare exact live refusal reason, not just ready/blocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,type Catalog,type RewardPolicy,type StorageLike} from '../src/progression.ts';
import {STANDARD_RECOVERY_SLOTS as S} from '../src/recovery-bundle.ts';
import {assessCorruptPrimaryReadiness} from '../src/corrupt-primary-readiness.ts';

class Store implements StorageLike {
  data=new Map<string,string>();writes=0;reads:string[]=[];
  getItem(k:string){this.reads.push(k);return this.data.get(k)??null;}
  setItem(k:string,v:string){this.writes++;this.data.set(k,v);}
  removeItem(k:string){this.writes++;this.data.delete(k);}
}
const catalog:Catalog={sourceVersion:'reason-fixture',starters:[1],pokemon:[1],
  lab:[{id:'speed',costByLevel:[5]}],shop:[{key:'berry',price:3}],
  achievements:[],counterKeys:['kills'],maps:[{id:'forest'}]};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?30:10};
function profiles(){
 const s=new Store(),p=new StandardProgression(s,catalog,policy,()=> 'run-1');
 p.chooseStarter(1);const t=p.beginRun('forest');p.finishRun(t.id,{victory:true,counters:{kills:1}});
 return [s.getItem(S.primary)!,s.getItem(S.backup)!] as const;
}
function make(p:string|null,b:string|null,q:string|null){
 const s=new Store();
 for(const [k,v] of [[S.primary,p],[S.backup,b],[S.quarantine,q]] as const)
   if(v!==null)s.data.set(k,v);
 s.data.set('pokebonk.local.profile.v1','other-edition');return s;
}
const primaryLabels=new Set(['missing','valid','unreadable','incompatible-schema','incompatible-version']);
const backupLabels=new Set(['missing','valid','unreadable']);
const quarantineLabels=new Set(['empty','matches-primary','occupied-other']);
const recoveryLabels=new Set(['ready-missing-primary','ready-preserve-primary','ready-matching-quarantine',
 'blocked-primary-valid','blocked-incompatible-schema','blocked-incompatible-version',
 'blocked-backup-missing','blocked-backup-unreadable','blocked-quarantine-conflict']);
function refused(msg:string){
 if(msg.startsWith('Primary has incompatible save schema'))return 'blocked-incompatible-schema';
 if(msg.startsWith('Primary belongs to another game version'))return 'blocked-incompatible-version';
 if(msg.startsWith('Primary is valid'))return 'blocked-primary-valid';
 if(msg==='No backup available')return 'blocked-backup-missing';
 if(msg.startsWith('Quarantined recovery snapshot exists'))return 'blocked-quarantine-conflict';
 if(msg==='Save JSON is corrupt; primary save left unchanged'||
    msg==='Incompatible save schema or game version')return 'blocked-backup-unreadable';
 assert.fail(`Unexpected live recovery refusal: ${msg}`);
}
test('576-case exact refusal reason and strict enum-only recovery preview',()=>{
 const [a,b]=profiles(),save=JSON.parse(a);
 const primaries=[null,a,b,'',`  ${a}  `,'{bad','[]','null','42','"text"','{}',
  JSON.stringify({...save,schema:2}),JSON.stringify({...save,schema:'1'}),
  JSON.stringify({...save,sourceVersion:'future'}),JSON.stringify({...save,sourceVersion:3}),
  JSON.stringify({...save,stardust:-1}),JSON.stringify({...save,lab:{unknown:1}}),
  JSON.stringify({...save,schema:2,sourceVersion:'future'})];
 const backups=[null,a,b,'','{bad','[]','{}',JSON.stringify({...save,sourceVersion:'future'})];
 let count=0,good=0;
 for(const p of primaries)for(const b of backups)for(const q of [null,p,'old-rescue','']){
  count++;
  const s=make(p,b,q),before=new Map(s.data),v=assessCorruptPrimaryReadiness(s,catalog);
  assert.equal(s.writes,0);assert.deepEqual(s.data,before);
  assert.ok(s.reads.every(k=>Object.values(S).includes(k as (typeof S)[keyof typeof S])));
  assert.deepEqual(Object.keys(v).sort(),['backup','primary','quarantine','recovery']);
  assert.ok(primaryLabels.has(v.primary));assert.ok(backupLabels.has(v.backup));
  assert.ok(quarantineLabels.has(v.quarantine));assert.ok(recoveryLabels.has(v.recovery));
  const output=JSON.stringify(v);
  for(const raw of [p,b,q])if(raw!==null&&raw.length>0)assert.ok(!output.includes(raw));
  const live=make(p,b,q);let expected:string;
  try{
   StandardProgression.recoverCorruptPrimary(live,catalog);good++;
   expected=p===null?'ready-missing-primary':q===p?'ready-matching-quarantine':'ready-preserve-primary';
   assert.equal(live.getItem(S.primary),b);assert.equal(live.getItem(S.quarantine),p??q);
  }catch(e){
   assert.ok(e instanceof ProgressionError);
   expected=refused(e.message);assert.deepEqual(live.data,before);
  }
  assert.equal(v.recovery,expected,'wrong preview refusal reason');
  assert.equal(live.getItem('pokebonk.local.profile.v1'),'other-edition');
 }
 // The 18×8×4 fixture count is intentionally pinned. Update deliberately.
 assert.equal(count,576);assert.ok(good>0);
});
