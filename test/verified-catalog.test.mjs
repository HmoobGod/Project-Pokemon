import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {arrayAt, auditManifest, extractCatalog, PIN} from '../tools/extract-verified-catalog.mjs';
const hash=t=>createHash('sha256').update(t).digest('hex');
const fictive={...PIN,snapshotDigest:'fixture-digest',labCount:2,shopCount:1,achievementCount:3,rosterCount:3};
const fixture=[
  'version:`0.8.80`,build:`mvur4p6p`',
  'var Je=.85,Ye=e=>Math.round(e*Je/5)*5,m=(e,t)=>n=>Ye(e*t**+n),Xe=e=>t=>Ye(e[Math.min(t,e.length-1)]),h=e=>()=>Ye(e),',
  'Ze=[{id:`slot-move`,max:1,cost:h(1500)},{id:`slot-vit`,max:2,cost:Xe([1200,3e3])}],',
  'g=(e,t)=>({key:e,price:t}),$e=[g(`soda-pop`,150)],',
  'at=[{id:`k100`,counter:`kills`,goal:100,reward:50},{id:`dex151`,counter:`@dex`,goal:u.maxDex,reward:1500},{id:`items`,counter:`@items`,goal:$e.length,reward:1e3}],',
  'O=[{id:1,start:!0,challenge:{desc:t(`Choose`),counter:`runs`,goal:2}},{id:4,start:!0,challenge:{desc:t(`Choose`),counter:`runs`,goal:2}},{id:7,start:!0,challenge:{desc:t(`Choose`),counter:`runs`,goal:2}}]'
].join('');
test('pinned catalog reader extracts formula prices, starter IDs and special achievement goals',()=>{
  const c=extractCatalog(fixture,fictive);
  assert.deepEqual(c.starters,[1,4,7]);
  assert.equal(c.leagueChallenges.length,3);
  assert.deepEqual(c.leagueChallenges[0].conditions,[{counter:'runs',goal:2}]);
  assert.deepEqual(c.lab.find(x=>x.id==='slot-move').costByLevel,[1275]);
  assert.deepEqual(c.lab.find(x=>x.id==='slot-vit').costByLevel,[1020,2550]);
  assert.equal(c.shop[0].price,150);
  assert.equal(c.achievements.find(x=>x.id==='dex151').goal,151);
  assert.equal(c.achievements.find(x=>x.id==='items').goal,1);
  assert.ok(c.unverified.includes('run Stardust rewards'));
});
test('changed or broken formulas fail closed',()=>{
  assert.throws(()=>extractCatalog(fixture.replace('Je=.85','Je=.50'),fictive),/pricing formula/);
  assert.throws(()=>extractCatalog(fixture.replace('cost:h(1500)','cost:h(1000)'),fictive),/Catalog control/);
  assert.throws(()=>extractCatalog(fixture.replace('version:`0.8.80`','version:`0.8.81`'),fictive),/Unrecognized game build/);
});
test('does not execute hostile source text',()=>{
  let called=false;globalThis.__catalogTestPwn=()=>called=true;
  assert.throws(()=>extractCatalog(fixture.replace('cost:h(1500)','cost:(globalThis.__catalogTestPwn(),h(1500))'),fictive),/Unexpected Lab upgrade count/);
  assert.equal(called,false);delete globalThis.__catalogTestPwn;
});
test('correctly ignores bracket characters inside quotes and backticks',()=>{
  assert.equal(arrayAt('Ze=[{desc:`not ] end`,id:`test`}]','Ze=['),'[{desc:`not ] end`,id:`test`}]');
});
function fakeSnapshot(){
  const files=[];
  for(let id=1;id<=151;id++)for(const [type,ext] of [['pmd','png'],['pmd-shiny','png'],['portraits','png'],['icons','png'],['cries','ogg']]){
    files.push({name:`assets/${type}/${id}.${ext}`,bytes:5,sha256:hash(`${type}-${id}`)});
  }
  files.push({name:fictive.configPath,bytes:fictive.configBytes,sha256:fictive.configSha256});
  return {upstreamBuild:fictive.upstreamBuild,upstreamVersion:fictive.upstreamVersion,digest:fictive.snapshotDigest,files};
}
test('manifest requires all 755 regular Kanto resource entries plus pinned config',()=>{
  const m=fakeSnapshot(),r=auditManifest(m,fictive);
  assert.equal(r.assetsVerifiedByManifest,755);
  assert.equal(r.fileCount,756);
});
test('missing Pokémon asset fails with exact missing resource ID',()=>{
  const m=fakeSnapshot();m.files=m.files.filter(x=>x.name!=='assets/pmd/151.png');
  assert.throws(()=>auditManifest(m,fictive),/assets\/pmd\/151.png/);
});
test('conflicting digest, invalid hash, duplicate paths and version drift are rejected',()=>{
  const d=fakeSnapshot();d.digest='changed';assert.throws(()=>auditManifest(d,fictive),/digest/);
  const m=fakeSnapshot();m.files.push({...m.files[0]});assert.throws(()=>auditManifest(m,fictive),/duplicate/);
  const n=fakeSnapshot();n.files[0].sha256='nope';assert.throws(()=>auditManifest(n,fictive),/metadata/);
  const o=fakeSnapshot();o.upstreamVersion='0.8.81';assert.throws(()=>auditManifest(o,fictive),/build/);
});


test('League challenge extraction handles multiple requirements without client-code execution',()=>{
  const four={...fictive,rosterCount:4};
  const code=fixture.replace('}]', '}]');
  const expanded=code.replace('challenge:{desc:t(`Choose`),counter:`runs`,goal:2}}]', 'challenge:{desc:t(`Choose`),counter:`runs`,goal:2}},{id:133,challenge:[{desc:t(`Units`),counter:`league`,goal:15},{desc:t(`Played`),counter:`speciesPlayed`,goal:10}]}]');
  const parsed=extractCatalog(expanded,four);
  assert.equal(parsed.leagueChallenges.length,4);
  assert.deepEqual(parsed.leagueChallenges[3].conditions,[{counter:'league',goal:15},{counter:'speciesPlayed',goal:10}]);
  assert.equal(parsed.leagueChallenges[3].logic,'all');
  assert.equal(parsed.leagueChallenges[3].status,'client-objectives-only');
});
test('League challenge extraction fails closed when missing or malformed',()=>{
  assert.throws(()=>extractCatalog(fixture.replace('counter:`runs`,goal:2','counter:`runs`,goal:0'),fictive),/Unsupported League conditions|League challenge goal/);
  assert.throws(()=>extractCatalog(fixture.replace('counter:`runs`,goal:2','counter:`runs`,goal:wrong'),fictive),/conditions/);
  assert.throws(()=>extractCatalog(fixture.replace('challenge:{desc:t(`Choose`),counter:`runs`,goal:2}', 'challenge:undefined'),fictive),/League challenge/);
});
