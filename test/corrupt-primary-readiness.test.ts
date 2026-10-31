import test from 'node:test';
import assert from 'node:assert/strict';
import {StandardProgression,ProgressionError,type Catalog,type RewardPolicy,type StorageLike} from '../src/progression.ts';
import {STANDARD_RECOVERY_SLOTS as S} from '../src/recovery-bundle.ts';
import {assessCorruptPrimaryReadiness} from '../src/corrupt-primary-readiness.ts';

class Store implements StorageLike {
  data=new Map<string,string>();writes=0;
  getItem(k:string){return this.data.get(k)??null;}
  setItem(k:string,v:string){this.writes++;this.data.set(k,v);}
  removeItem(k:string){this.writes++;this.data.delete(k);}
}
const catalog:Catalog={sourceVersion:'preview-fixture',starters:[1],pokemon:[1],
  lab:[{id:'speed',costByLevel:[5]}],shop:[{key:'berry',price:3}],
  achievements:[],counterKeys:['kills'],maps:[{id:'forest'}]};
const policy:RewardPolicy={calculateRunStardust:r=>r.victory?30:10};
function fixture(){
  const s=new Store(),p=new StandardProgression(s,catalog,policy,()=> 'stable-run');
  p.chooseStarter(1);
  const t=p.beginRun('forest');
  p.finishRun(t.id,{victory:true,counters:{kills:1}});
  return {a:s.getItem(S.primary)!,b:s.getItem(S.backup)!};
}
function store(primary:string|null,backup:string|null,quarantine:string|null){
  const s=new Store();
  for(const [k,v] of [[S.primary,primary],[S.backup,backup],[S.quarantine,quarantine]] as const)
    if(v!==null)s.data.set(k,v);
  s.data.set('pokebonk.local.profile.v1','other-edition');
  return s;
}
test('corrupt primary preview recognizes schema, quarantine and backup guards',()=>{
  const {a,b}=fixture();
  const cases=[
    [null,b,null,'ready-missing-primary'],
    ['{bad',b,null,'ready-preserve-primary'],
    ['{bad',b,'{bad','ready-matching-quarantine'],
    ['{bad',b,'old-rescue','blocked-quarantine-conflict'],
    ['{bad',null,null,'blocked-backup-missing'],
    ['{bad','{broken',null,'blocked-backup-unreadable'],
    [a,b,null,'blocked-primary-valid'],
    [JSON.stringify({...JSON.parse(a),schema:2}),b,null,'blocked-incompatible-schema'],
    [JSON.stringify({...JSON.parse(a),sourceVersion:'future'}),b,null,'blocked-incompatible-version'],
  ] as const;
  for(const [primary,backup,quarantine,expected] of cases) {
    const s=store(primary,backup,quarantine),before=new Map(s.data);
    const output=assessCorruptPrimaryReadiness(s,catalog);
    assert.equal(output.recovery,expected);
    assert.equal(s.writes,0);assert.deepEqual(s.data,before);
    const live=store(primary,backup,quarantine);let succeeded=false;
    try{StandardProgression.recoverCorruptPrimary(live,catalog);succeeded=true;}
    catch(error){assert.ok(error instanceof ProgressionError);}
    assert.equal(succeeded,expected.startsWith('ready-'));
    if(succeeded){assert.equal(live.getItem(S.primary),backup);assert.equal(live.getItem(S.quarantine),primary??quarantine);}
    else assert.deepEqual(live.data,before);
    for(const raw of [primary,backup,quarantine])
      if(raw!==null)assert.ok(!JSON.stringify(output).includes(raw));
  }
});
