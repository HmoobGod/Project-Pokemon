import test from 'node:test';
import assert from 'node:assert/strict';
import {ProgressionError,type StorageLike} from '../src/progression.ts';
import {STANDARD_RECOVERY_SLOTS as S} from '../src/recovery-bundle.ts';
import {exportChecksummedRecoveryBundle,parseChecksummedRecoveryBundle}
  from '../src/recovery-bundle-integrity.ts';

class Store implements StorageLike {
  values=new Map<string,string>();writes=0;reads:string[]=[];
  getItem(k:string){this.reads.push(k);return this.values.get(k)??null;}
  setItem(k:string,v:string){this.writes++;this.values.set(k,v);}
  removeItem(k:string){this.writes++;this.values.delete(k);}
}
test('SHA-256 bundle preserves exact raw Standard bytes, empty strings, null and future data',async()=>{
  const s=new Store();
  // All SIX slots are checked. Escape sequences produce real NUL and a
  // real unpaired surrogate at runtime; preUndo remains absent (null).
  const specimens:(string|null)[]=['{bad','',' \\u0000 Ω 😀 ','\\uD800',null,'null'];
  const keys=Object.keys(S) as Array<keyof typeof S>;
  for(const [i,key] of keys.entries())if(specimens[i]!==null)s.values.set(S[key],specimens[i]!);
  s.values.set('pokebonk.local.profile.v1','foreign-edition');
  const before=new Map(s.values);
  const encoded=await exportChecksummedRecoveryBundle(s);
  const envelope=JSON.parse(encoded);
  assert.equal(envelope.kind,'project-pokemon.standard.raw-recovery.sha256');
  assert.match(envelope.sha256,/^[0-9a-f]{64}$/);
  const restored=await parseChecksummedRecoveryBundle(encoded);
  for(const [i,key] of keys.entries())
    assert.equal(restored.slots[key],specimens[i],`raw slot changed: ${key}`);
  assert.ok(restored.slots.preImport!.includes('\\u0000'),'real NUL not exercised');
  assert.equal(restored.slots.preRestore!.charCodeAt(0),0xD800,'lone surrogate not exercised');
  assert.deepEqual(s.values,before);assert.equal(s.writes,0);
  assert.equal(s.reads.length,18,'two snapshot passes + post-hash verification');
  assert.ok(s.reads.every(k=>Object.values(S).includes(k as never)));
  assert.equal(s.values.get('pokebonk.local.profile.v1'),'foreign-edition');
});

test('tampering a single raw slot or checksum causes integrity rejection',async()=>{
 const s=new Store();s.values.set(S.primary,'{future-version-data');
 const envelope=JSON.parse(await exportChecksummedRecoveryBundle(s));
 envelope.payload=envelope.payload.replace('future-version-data','replaced-progress');
 await assert.rejects(parseChecksummedRecoveryBundle(JSON.stringify(envelope)),/integrity/);
 envelope.payload=envelope.payload.replace('replaced-progress','future-version-data');
 envelope.sha256='0'.repeat(64);
 await assert.rejects(parseChecksummedRecoveryBundle(JSON.stringify(envelope)),/integrity/);
 assert.equal(s.writes,0);
});

test('strict envelope validation rejects unknown fields, old unchecked format and bad hashes',async()=>{
 const s=new Store(),raw=await exportChecksummedRecoveryBundle(s),env=JSON.parse(raw);
 for(const item of ['bad-json','null','[]',
   JSON.stringify({...env,schema:2}),
   JSON.stringify({...env,kind:'foreign-edition'}),
   JSON.stringify({...env,extra:'injected'}),
   JSON.stringify({...env,sha256:'ABC'}),
   JSON.stringify({...env,sha256:42}),
   JSON.stringify({...env,payload:null}),
   env.payload]) {
   await assert.rejects(parseChecksummedRecoveryBundle(item),ProgressionError);
 }
 assert.equal(s.writes,0);
});

test('checksummed parser rejects malformed raw slot structure even with valid hash',async()=>{
 const s=new Store(),env=JSON.parse(await exportChecksummedRecoveryBundle(s));
 const raw=JSON.parse(env.payload);raw.slots.rogue='other-edition';
 env.payload=JSON.stringify(raw);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.payload));
 env.sha256=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 await assert.rejects(parseChecksummedRecoveryBundle(JSON.stringify(env)),/unknown slots/);
});

test('storage change observed during asynchronous digest fails closed with zero exporter writes',async()=>{
 const s=new Store();s.values.set(S.primary,'old');
 let primaryReads=0;
 const racing:Pick<StorageLike,'getItem'>={getItem(k){
   if(k===S.primary && ++primaryReads===3)s.setItem(k,'other-tab-new');
   return s.getItem(k);
 }};
 await assert.rejects(exportChecksummedRecoveryBundle(racing),/changed during checksum export/);
 assert.equal(s.getItem(S.primary),'other-tab-new');
});
