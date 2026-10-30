/**
 * PokéBonk Standard offline edition — pinned, fail-closed catalog reader.
 * Own code; reads an already obtained, appropriately authorized upstream snapshot.
 * Does not fetch, execute, or bundle the original game's code/assets.
 *
 * Usage: node tools/extract-verified-catalog.mjs /path/to/vendor/pokebonk
 *        node tools/extract-verified-catalog.mjs /path/to/vendor/pokebonk --verify-assets
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PIN = Object.freeze({
  upstreamVersion: '0.8.80', upstreamBuild: 'mvur4p6p',
  configPath: 'assets/defineProperty-DFY2V380-mvur4p6p.js',
  configSha256: 'ee80917af414bf62aa37f40176c6b3fb13063da979d1c192a54b960adb7e9431',
  configBytes: 211174,
  snapshotDigest: '5a851d03b9b79a3f1808a0a9aba9cc703e804c241882be5b6ac74699975fcc0d',
  labCount:24, shopCount:59, achievementCount:71, rosterCount:40,
});
const sha256 = b=> createHash('sha256').update(b).digest('hex');
const numeric = s => {
  if (typeof s!=='string' || !/^(?:\d+\.?\d*|\.\d+)(?:e\d+)?$/i.test(s)) throw new Error('Unsupported numeric expression: '+s);
  const n=Number(s);
  if (!Number.isSafeInteger(n) && !Number.isFinite(n)) throw new Error('Invalid numeric expression');
  return n;
};
const finitePositive = (n,label)=>{
  if (!Number.isSafeInteger(n)||n<0) throw new Error('Invalid '+label+': '+n);
  return n;
};
const distinct = (rows,key,label)=>{
  if (new Set(rows.map(x=>x[key])).size!==rows.length) throw new Error('Duplicate '+label);
};
/** Bracket reader respects quoted strings. Never evaluate client source. */
export function arrayAt(code, anchor) {
  const where=code.indexOf(anchor);
  if(where<0 || code.indexOf(anchor,where+anchor.length)>=0) throw new Error('Missing or ambiguous array: '+anchor);
  const bracketOffset=anchor.indexOf("[");
  if(bracketOffset<0) throw new Error("Missing bracket in anchor");
  const start=where+bracketOffset;
  if(code[start]!=='[') throw new Error('Invalid array anchor');
  let depth=0,quote='',escape=false;
  for(let i=start;i<code.length;i++) {
    const ch=code[i];
    if(quote) {
      if(escape){escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='[')depth++;
    if(ch===']' && --depth===0) return code.slice(start,i+1);
  }
  throw new Error('Unclosed array: '+anchor);
}
const checkExpected=(actual,expected,label)=>{
  if(actual!==expected) throw new Error(`Unexpected ${label}: ${actual} (expected ${expected})`);
};

function getLab(code,pin){
  // Fixed formula as examined in the EXACT pinned source; upstream changes require a new pin.
  const formula='Je=.85,Ye=e=>Math.round(e*Je/5)*5,m=(e,t)=>n=>Ye(e*t**+n),Xe=e=>t=>Ye(e[Math.min(t,e.length-1)]),h=e=>()=>Ye(e)';
  if(!code.includes(formula)) throw new Error('Unknown Lab pricing formula; refuse to guess');
  const array=arrayAt(code,'Ze=[');
  const rows=[...array.matchAll(/\{id:`([^`]+)`[\s\S]*?,max:(\d+),cost:(h|m|Xe)\(([^)]*)\)/g)].map(m=>{
    const id=m[1],max=finitePositive(Number(m[2]),'Lab max');
    if(!max||max>50)throw new Error('Unsupported Lab maximum');
    const kind=m[3],args=m[4];
    let raw;
    if(kind==='h'){const price=numeric(args);raw=Array(max).fill(price);}
    else if(kind==='m'){
      const bits=args.split(',').map(numeric);
      if(bits.length!==2)throw new Error('Invalid geometric cost');
      raw=Array.from({length:max},(_,i)=>bits[0]*bits[1]**i);
    } else {
      if(!/^\[[^\[\]]+\]$/.test(args))throw new Error('Unsupported array cost');
      const values=args.slice(1,-1).split(',').map(numeric);
      raw=Array.from({length:max},(_,i)=>values[Math.min(i,values.length-1)]);
    }
    // JS Math.round is used, rather than Python's bankers rounding.
    return {id,max,costByLevel:raw.map(price=>finitePositive(Math.round(price*.85/5)*5,'Lab cost'))};
  });
  checkExpected(rows.length,pin.labCount,'Lab upgrade count');distinct(rows,'id','Lab IDs');
  return rows;
}
function getShop(code,pin){
  if(!code.includes('g=(e,t)=>({key:e,price:t})'))throw new Error('Unknown shop price factory');
  const rows=[...arrayAt(code,'$e=[').matchAll(/g\(`([^`]+)`,([\de.]+)\)/g)].map(m=>({key:m[1],price:finitePositive(numeric(m[2]),'shop price')}));
  checkExpected(rows.length,pin.shopCount,'shop item count');distinct(rows,'key','shop keys');
  return rows;
}
function getAchievements(code,pin,shopCount){
  const a=arrayAt(code,'at=[');
  const all=[...a.matchAll(/\{id:`([^`]+)`[^{}]*?counter:`([^`]+)`,goal:([^,}]+),reward:([^,}]+)/g)];
  const rows=all.map((m)=>{
    const raw=m[3].trim();
    const goal=raw==='u.maxDex'?151:raw==='$e.length'?shopCount:numeric(raw);
    const reward=numeric(m[4].trim());
    return {id:m[1],counter:m[2],goal:finitePositive(goal,'goal'),reward:finitePositive(reward,'reward'),goalSource:raw==='u.maxDex'?'maxDex':raw==='$e.length'?'shopCatalogLength':'literal'};
  });
  checkExpected(rows.length,pin.achievementCount,'achievement count');distinct(rows,'id','achievement IDs');
  if(!rows.some(a=>a.id==='dex151'&&a.goal===151)||!rows.some(a=>a.id==='items'&&a.goal===shopCount))throw new Error('Missing anchored variable-goal achievements');
  return rows;
}
/** Split an array on top-level commas without executing upstream JavaScript. */
export function splitArrayEntries(source) {
  if(!source.startsWith('[')||!source.endsWith(']'))throw new Error('Invalid array source');
  const rows=[];let begin=1,braces=0,brackets=0,parens=0,quote='',escaped=false;
  for(let i=1;i<source.length-1;i++) {
    const ch=source[i];
    if(quote) {
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')braces++;
    else if(ch==='}')braces--;
    else if(ch==='[')brackets++;
    else if(ch===']')brackets--;
    else if(ch==='(')parens++;
    else if(ch===')')parens--;
    if(Math.min(braces,brackets,parens)<0)throw new Error('Unbalanced client array');
    if(ch===','&&!braces&&!brackets&&!parens) {
      rows.push(source.slice(begin,i).trim());begin=i+1;
    }
  }
  if(quote||braces||brackets||parens)throw new Error('Incomplete client array');
  const last=source.slice(begin,-1).trim();if(last)rows.push(last);
  if(rows.some(x=>!x))throw new Error('Empty client array entry');
  return rows;
}
function getRoster(code,pin){
  const a=arrayAt(code,'O=[{id:1,start:!0');
  const entries=splitArrayEntries(a);
  checkExpected(entries.length,pin.rosterCount,'playable roster count');
  const rules=entries.map(entry=>{
    const id=Number(entry.match(/^\{id:(\d+),/)?.[1]);
    if(!Number.isSafeInteger(id)||id<=0)throw new Error('Unsupported League member ID');
    const starter=/^\{id:\d+,start:!0,/.test(entry);
    const match=entry.match(/,challenge:(\{[^{}]*\}|\[(?:\{[^{}]*\},?)+\])\}$/);
    if(!match)throw new Error('Missing or unsupported League challenge: '+id);
    const challenge=match[1];
    const conditions=[...challenge.matchAll(/counter:`([^`]+)`,goal:([\de.]+)/g)]
      .map(x=>({counter:x[1],goal:finitePositive(numeric(x[2]),'League challenge goal')}));
    if(!conditions.length||conditions.some(x=>!x.goal)||
       (challenge.match(/counter:/g)||[]).length!==conditions.length)
      throw new Error('Unsupported League conditions: '+id);
    const parts=challenge.startsWith('[')?splitArrayEntries(challenge):[challenge];
    if(parts.length!==conditions.length)throw new Error('Incomplete League challenge conditions: '+id);
    return {id,starter,conditions,logic:'all',status:'client-objectives-only'};
  });
  distinct(rules,'id','League member IDs');
  const starters=rules.filter(x=>x.starter).map(x=>x.id);
  if(starters.join(',')!=='1,4,7') throw new Error('Unexpected starter options');
  const locked=rules.filter(x=>!x.starter);
  if(pin.rosterCount===40 && (
    rules.find(x=>x.id===151)?.conditions[0]?.goal!==78 ||
    rules.find(x=>x.id===133)?.conditions.length!==2 ||
    rules.find(x=>x.id===1)?.conditions[0]?.counter!=='runs' ||
    locked.length!==37
  ))throw new Error('League challenge control mismatch');
  return {starters,rosterIds:rules.map(x=>x.id),leagueChallenges:rules};
}

export function auditManifest(snapshot,pin=PIN) {
  if(snapshot.upstreamBuild!==pin.upstreamBuild || snapshot.upstreamVersion!==pin.upstreamVersion)throw new Error('Mismatched snapshot build');
  if(pin.snapshotDigest && snapshot.digest!==pin.snapshotDigest)throw new Error('Snapshot digest mismatch');
  if(!Array.isArray(snapshot.files))throw new Error('Invalid snapshot files');
  const names=new Set(),byName=new Map();
  for(const f of snapshot.files) {
    if(typeof f.name!=='string'||!/^[-\w./]+$/.test(f.name)||f.name.includes('..')||names.has(f.name))throw new Error('Invalid or duplicate asset path');
    names.add(f.name);byName.set(f.name,f);
    if(!Number.isSafeInteger(f.bytes)||f.bytes<0||!(/^[0-9a-f]{64}$/).test(f.sha256))throw new Error('Bad asset metadata');
  }
  const paths=[];
  for(let id=1;id<=151;id++)for(const [type,extension] of [['pmd','png'],['pmd-shiny','png'],['portraits','png'],['icons','png'],['cries','ogg']]){
    const path=`assets/${type}/${id}.${extension}`;
    const file=byName.get(path);
    if(!file)throw new Error('Missing mandatory Kanto resource: '+path);
    paths.push(file);
  }
  const config=byName.get(pin.configPath);
  if(!config||config.sha256!==pin.configSha256||config.bytes!==pin.configBytes)throw new Error('Config provenance mismatch');
  return {fileCount:snapshot.files.length,assetsVerifiedByManifest:paths.length,assetBytes:paths.reduce((sum,x)=>sum+x.bytes,0),assets:paths};
}
export function extractCatalog(configText,pin=PIN) {
  if(!configText.includes('version:`'+pin.upstreamVersion+'`,build:`'+pin.upstreamBuild+'`'))throw new Error('Unrecognized game build');
  const lab=getLab(configText,pin),shop=getShop(configText,pin),achievements=getAchievements(configText,pin,shop.length),roster=getRoster(configText,pin);
  if(lab.find(x=>x.id==='slot-move')?.costByLevel[0]!==1275 || lab.find(x=>x.id==='slot-vit')?.costByLevel.join(',')!=='1020,2550'||shop.find(x=>x.key==='soda-pop')?.price!==150||achievements.find(x=>x.id==='k100')?.reward!==50)throw new Error('Catalog control mismatch');
  return {source:{upstreamVersion:pin.upstreamVersion,upstreamBuild:pin.upstreamBuild,configSha256:pin.configSha256,source:'client config; server logic NOT included'},starters:roster.starters,leagueCandidateIds:roster.rosterIds,leagueChallenges:roster.leagueChallenges,lab,shop,achievements,unverified:['run Stardust rewards','run eligibility and anti-cheat','League unlock and research prerequisites','map unlock rules','event and commission rewards','server-validated achievement claims']};
}
export async function extractSnapshot(root,{verifyAssets=false}={}){
  const snapshot=JSON.parse(await readFile(join(root,'snapshot.json'),'utf8'));
  const manifest=auditManifest(snapshot);
  const bytes=await readFile(join(root,'game',PIN.configPath));
  if(bytes.length!==PIN.configBytes||sha256(bytes)!==PIN.configSha256)throw new Error('Config binary SHA-256 mismatch');
  const catalog=extractCatalog(bytes.toString('utf8'));
  if(verifyAssets)for(const file of manifest.assets){
    const buf=await readFile(join(root,'game',file.name));
    if(buf.length!==file.bytes||sha256(buf)!==file.sha256)throw new Error('Corrupt/missing asset: '+file.name);
  }
  const {assets,...coverage}=manifest;
  return {...catalog,coverage:{...coverage,verification:verifyAssets?'SHA-256 checked actual files':'manifest entries only'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const root=process.argv[2];
  if(!root){console.error('Usage: node tools/extract-verified-catalog.mjs /path/to/vendor/pokebonk [--verify-assets]');process.exitCode=2;}
  else{
    try{console.log(JSON.stringify(await extractSnapshot(root,{verifyAssets:process.argv.includes('--verify-assets')}),null,2));}
    catch(e){console.error('Extraction FAILED CLOSED:',e instanceof Error?e.message:String(e));process.exitCode=1;}
  }
}
