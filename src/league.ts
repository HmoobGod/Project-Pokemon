/**
 * Read-only projection of observed client League challenges.
 * Explicitly NOT an entitlement checker: the original server unlock rules
 * remain unverified, so this module never grants a Pokémon character.
 */
import type {Catalog,SaveState} from './progression.ts';

export interface LeagueCondition { counter:string; goal:number }
export interface LeagueChallenge {
  id:number;
  starter:boolean;
  conditions:readonly LeagueCondition[];
  logic:'all';
  status:'client-objectives-only';
}
export interface LeagueObjectiveStatus {
  counter:string;
  goal:number;
  observed:number|null;
  met:boolean|null;
  reason:'client-counter-observed'|'counter-unverified'|'aggregate-ambiguous';
}
export interface LeagueProgressStatus {
  id:number;
  starter:boolean;
  clientGoalsMet:boolean|null;
  objectives:LeagueObjectiveStatus[];
  serverVerified:false;
  canGrantUnlock:false;
}

const safeInt=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
/**
 * 'league' can refer to a separate captured/owned roster, not the 40
 * League character choices. Never infer it from pokemonUnlocked.length.
 * Best-in-one-run milestones need an explicit max accumulation policy.
 */
export function previewLeagueObjectives(
  rules:readonly LeagueChallenge[],
  state:Readonly<SaveState>,
  catalog:Readonly<Catalog>
):LeagueProgressStatus[] {
  const ids=new Set<number>();
  return rules.map(rule=>{
    if(!safeInt(rule.id)||rule.id===0||ids.has(rule.id)||rule.logic!=='all'||
       rule.status!=='client-objectives-only'||!rule.conditions.length)
      throw new Error('Unsupported League challenge record');
    ids.add(rule.id);
    const objectives: LeagueObjectiveStatus[]=rule.conditions.map(objective=>{
      if(!objective.counter||!safeInt(objective.goal)||objective.goal===0)
        throw new Error('Malformed League objective');
      const counter=objective.counter;
      const aggregateAmbiguous=counter==='league'||
        ((counter.startsWith('best_')||counter==='maxLevel') && catalog.counterModes?.[counter]!=='max');
      const known=counter==='runs'||counter==='wins'||catalog.counterKeys.includes(counter);
      const reason=aggregateAmbiguous?'aggregate-ambiguous':!known?'counter-unverified':'client-counter-observed';
      const raw=state.counters[counter];
      const observed=reason!=='client-counter-observed'?null:raw===undefined?0:raw;
      if(observed!==null&&!safeInt(observed))throw new Error('Invalid observed counter');
      return {counter,goal:objective.goal,observed,met:observed===null?null:observed>=objective.goal,reason};
    });
    const clientGoalsMet=objectives.some(x=>x.met===false)?false:
      objectives.some(x=>x.met===null)?null:true;
    return {id:rule.id,starter:rule.starter,clientGoalsMet,objectives,
      serverVerified:false as const,canGrantUnlock:false as const};
  });
}
