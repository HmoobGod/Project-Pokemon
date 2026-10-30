/**
 * PokéBonk Standard: independent offline progression core.
 * No upstream game code/assets. This is NOT yet wired to the PokéBonk UI.
 * Every economy rule must be supplied from a verified game version.
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface LabUpgrade { id: string; costByLevel: readonly number[] }
export interface ShopItem { key: string; price: number }
export interface Achievement { id: string; counter: string; goal: number; reward: number }
export interface MapRule { id: string; requiresWinOf?: string }
export interface Catalog {
  sourceVersion: string;
  starters: readonly number[];
  pokemon: readonly number[];
  lab: readonly LabUpgrade[];
  shop: readonly ShopItem[];
  achievements: readonly Achievement[];
  counterKeys: readonly string[];
  maps: readonly MapRule[];
}
export interface RunReport {
  victory: boolean;
  counters: Record<string, number>;
  seen?: number[];
  captures?: number[];
}
export interface RewardPolicy {
  /** Must exactly match the upstream reward formula before this is integrated. */
  calculateRunStardust(report: Readonly<RunReport>, map: string): number;
}
export interface RunTicket { id: string; map: string; mode: 'classic' | 'other' }
export interface SaveState {
  schema: 1;
  sourceVersion: string;
  starter: number | null;
  stardust: number;
  totalStardust: number;
  pokemonUnlocked: number[];
  pokemonSeen: number[];
  lab: Record<string, number>;
  itemsOwned: string[];
  questsClaimed: string[];
  counters: Record<string, number>;
  mapsWon: string[];
  processedRuns: string[];
  pendingRuns: RunTicket[];
}
export class ProgressionError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const asInteger = (v: unknown, name: string): number => {
  if (!Number.isSafeInteger(v) || (v as number) < 0) throw new ProgressionError(`Invalid non-negative integer: ${name}`);
  return v as number;
};
const add = (a: number, b: number): number => asInteger(a + b, 'numeric overflow');
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const jsonCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const listOf = (v: unknown, parse: (item: unknown) => void, name: string): void => {
  if (!Array.isArray(v)) throw new ProgressionError(`Invalid save list: ${name}`);
  for (const item of v) parse(item);
};
const nonemptyString = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v.length) throw new ProgressionError(`Invalid string: ${name}`);
  return v;
};
const safeCounters = (v: unknown, name: string): Record<string, number> => {
  if (!isRecord(v)) throw new ProgressionError(`Invalid counters: ${name}`);
  for (const [k,n] of Object.entries(v)) { nonemptyString(k,name); asInteger(n, `${name}.${k}`); }
  return v as Record<string,number>;
};

export function validateCatalog(c: Catalog): void {
  nonemptyString(c.sourceVersion, 'sourceVersion');
  if (!c.starters.length || !c.pokemon.length || !c.maps.length) throw new ProgressionError('Incomplete source catalog');
  const checkUnique = (a: readonly string[], label: string) => { if (new Set(a).size !== a.length) throw new ProgressionError(`Duplicate ${label}`); };
  c.pokemon.forEach(n => asInteger(n, 'pokemon id'));
  c.starters.forEach(n => { asInteger(n,'starter id'); if (!c.pokemon.includes(n)) throw new ProgressionError('Starter missing from Pokemon registry'); });
  checkUnique(c.pokemon.map(String),'Pokemon'); checkUnique(c.starters.map(String),'starter');
  c.lab.forEach(l => {nonemptyString(l.id,'lab id'); if (!l.costByLevel.length) throw new ProgressionError('Missing Lab level costs'); l.costByLevel.forEach(x=>asInteger(x,'Lab price'));});
  c.shop.forEach(i => {nonemptyString(i.key,'item key');asInteger(i.price,'shop price');});
  c.counterKeys.forEach(k=>{nonemptyString(k,'counter key');if (k==='runs' || k==='wins') throw new ProgressionError('Reserved counter in catalog');});
  c.achievements.forEach(a=>{nonemptyString(a.id,'achievement id');nonemptyString(a.counter,'counter');if (!c.counterKeys.includes(a.counter) && a.counter !== 'runs' && a.counter !== 'wins') throw new ProgressionError('Achievement counter not in catalog');asInteger(a.goal,'goal'); if (!a.goal) throw new ProgressionError('Zero achievement goal');asInteger(a.reward,'achievement reward');});
  c.maps.forEach(m=> {nonemptyString(m.id,'map id'); if (m.requiresWinOf && !c.maps.some(x=>x.id===m.requiresWinOf)) throw new ProgressionError('Missing map prerequisite');});
  checkUnique(c.lab.map(x=>x.id),'Lab id');checkUnique(c.shop.map(x=>x.key),'shop id');
  checkUnique(c.achievements.map(x=>x.id),'achievement id');checkUnique(c.maps.map(x=>x.id),'map id');checkUnique(c.counterKeys,'counter keys');
}

export function freshState(sourceVersion: string): SaveState {
  return { schema: 1, sourceVersion, starter: null, stardust: 0, totalStardust: 0,
    pokemonUnlocked: [], pokemonSeen: [], lab: {}, itemsOwned: [], questsClaimed: [],
    counters: {}, mapsWon: [], processedRuns: [], pendingRuns: [] };
}
export function parseSave(raw: string, expectedVersion: string): SaveState {
  let data: unknown;
  try { data = JSON.parse(raw); } catch {throw new ProgressionError('Save JSON is corrupt; primary save left unchanged');}
  if (!isRecord(data) || data.schema !== 1 || data.sourceVersion !== expectedVersion) throw new ProgressionError('Incompatible save schema or game version');
  if (data.starter !== null) asInteger(data.starter,'starter');
  asInteger(data.stardust,'stardust');asInteger(data.totalStardust,'totalStardust');
  for (const key of ['pokemonUnlocked','pokemonSeen'] as const) listOf(data[key],x=>{asInteger(x,key);},key);
  for (const key of ['itemsOwned','questsClaimed','mapsWon','processedRuns'] as const) listOf(data[key],x=>{nonemptyString(x,key);},key);
  safeCounters(data.lab,'lab');safeCounters(data.counters,'counters');
  if (!Array.isArray(data.pendingRuns)) throw new ProgressionError('Invalid pending runs');
  for (const ticket of data.pendingRuns) {
    if (!isRecord(ticket)) throw new ProgressionError('Invalid ticket');
    nonemptyString(ticket.id,'run id');nonemptyString(ticket.map,'run map');
    if (ticket.mode !== 'classic' && ticket.mode !== 'other') throw new ProgressionError('Invalid run mode');
  }
  if ((data.stardust as number) > (data.totalStardust as number)) throw new ProgressionError('Balance exceeds lifetime earnings');
  for (const key of ['pokemonUnlocked','pokemonSeen','itemsOwned','questsClaimed','mapsWon','processedRuns'] as const) {
    const values = data[key] as unknown[];
    if (unique(values).length !== values.length) throw new ProgressionError(`Duplicate save entries: ${key}`);
  }
  const ids = (data.pendingRuns as RunTicket[]).map(t=>t.id);
  if (new Set(ids).size!==ids.length || ids.some(id=>(data.processedRuns as string[]).includes(id))) throw new ProgressionError('Duplicate or replayed run ticket');
  return data as unknown as SaveState;
}

/**
 * All mutations are committed in a single localStorage write; the previous
 * valid state is copied to a separate recovery key beforehand. Browser storage
 * is NOT tamper-proof. This protects accidental duplicate claims, not cheating.
 */
export class StandardProgression {
  readonly key = 'pokebonk.standard.profile.v1';
  readonly backupKey = 'pokebonk.standard.profile.backup.v1';
  private state: SaveState;
  private readonly storage: StorageLike;
  private readonly catalog: Catalog;
  private readonly policy: RewardPolicy;
  private readonly idFactory: () => string;
  constructor(storage: StorageLike, catalog: Catalog, policy: RewardPolicy, idFactory: () => string = () => crypto.randomUUID()) {
    this.storage = storage; this.catalog = catalog; this.policy = policy; this.idFactory = idFactory;
    validateCatalog(catalog);
    const raw = storage.getItem(this.key);
    this.state = raw === null ? freshState(catalog.sourceVersion) : parseSave(raw,catalog.sourceVersion);
  }
  snapshot(): SaveState { return jsonCopy(this.state); }
  private commit(change: (next: SaveState) => void): SaveState {
    const next = this.snapshot();
    change(next);
    const serialized = JSON.stringify(next);
    parseSave(serialized,this.catalog.sourceVersion);
    const previous = this.storage.getItem(this.key);
    if (previous !== null) {
      parseSave(previous,this.catalog.sourceVersion); // Never back up an invalid primary.
      this.storage.setItem(this.backupKey,previous);
    }
    this.storage.setItem(this.key,serialized);
    this.state = next;
    return this.snapshot();
  }
  chooseStarter(id: number): SaveState {
    if (!this.catalog.starters.includes(id)) throw new ProgressionError('Unknown or ineligible starter');
    if (this.state.starter!==null) throw new ProgressionError('Starter already selected');
    return this.commit(s=>{s.starter=id;s.pokemonUnlocked.push(id);s.pokemonSeen.push(id);});
  }
  beginRun(map: string, mode: 'classic' | 'other' = 'classic'): RunTicket {
    if (this.state.starter===null) throw new ProgressionError('Choose a starter first');
    const m=this.catalog.maps.find(x=>x.id===map);
    if (!m) throw new ProgressionError('Unknown map');
    if (m.requiresWinOf && !this.state.mapsWon.includes(m.requiresWinOf)) throw new ProgressionError('Map is locked');
    const id=this.idFactory();nonemptyString(id,'ticket id');
    if ([...this.state.pendingRuns.map(r=>r.id),...this.state.processedRuns].includes(id)) throw new ProgressionError('Repeated run ID');
    const ticket:RunTicket={id,map,mode};
    this.commit(s=>{s.pendingRuns.push(ticket);});
    return jsonCopy(ticket);
  }
  finishRun(ticketId: string, report: RunReport): {state: SaveState; earned: number} {
    const ticket=this.state.pendingRuns.find(t=>t.id===ticketId);
    if (!ticket || this.state.processedRuns.includes(ticketId)) throw new ProgressionError('Unknown or already credited run');
    if (typeof report.victory!=='boolean') throw new ProgressionError('Invalid victory flag');
    safeCounters(report.counters,'report counters');
    for (const key of Object.keys(report.counters)) if (!this.catalog.counterKeys.includes(key)) throw new ProgressionError('Unknown or reserved run counter');
    const seen=report.seen??[],captures=report.captures??[];
    for(const id of [...seen,...captures]) if (!this.catalog.pokemon.includes(id)) throw new ProgressionError('Unknown Pokemon in run report');
    const earned=asInteger(this.policy.calculateRunStardust(jsonCopy(report),ticket.map),'run reward');
    const state=this.commit(s=>{
      s.pendingRuns=s.pendingRuns.filter(t=>t.id!==ticketId);
      s.processedRuns.push(ticketId);
      s.counters.runs=add(s.counters.runs??0,1);
      if (report.victory) {
        if (ticket.mode === 'classic') s.mapsWon=unique([...s.mapsWon,ticket.map]);
        s.counters.wins=add(s.counters.wins??0,1);
      }
      for(const [k,n] of Object.entries(report.counters)) {
        s.counters[k]=add(s.counters[k]??0,n);
      }
      s.pokemonSeen=unique([...s.pokemonSeen,...seen,...captures]);
      // A capture is NOT evidence that a League character is unlocked.
      // The upstream League challenge requirements must be implemented separately.
      // Capture IDs are retained as sightings until a version-verified contract exists.
      s.stardust=add(s.stardust,earned);
      s.totalStardust=add(s.totalStardust,earned);
    });
    return {state,earned};
  }
  buyLab(id: string): SaveState {
    const upgrade=this.catalog.lab.find(x=>x.id===id);
    if (!upgrade) throw new ProgressionError('Unknown Lab upgrade');
    const level=this.state.lab[id]??0;
    const cost=upgrade.costByLevel[level];
    if (cost===undefined) throw new ProgressionError('Lab level already maxed');
    if (this.state.stardust<cost) throw new ProgressionError('Not enough Stardust');
    return this.commit(s=>{s.stardust-=cost;s.lab[id]=level+1;});
  }
  buyItem(key: string): SaveState {
    const item=this.catalog.shop.find(x=>x.key===key);
    if (!item) throw new ProgressionError('Unknown shop item');
    if (this.state.itemsOwned.includes(key)) throw new ProgressionError('Item already owned');
    if (this.state.stardust<item.price) throw new ProgressionError('Not enough Stardust');
    return this.commit(s=>{s.stardust-=item.price;s.itemsOwned.push(key);});
  }
  claimAchievement(id: string): SaveState {
    const a=this.catalog.achievements.find(x=>x.id===id);
    if (!a) throw new ProgressionError('Unknown achievement');
    if (this.state.questsClaimed.includes(id)) throw new ProgressionError('Achievement already claimed');
    if ((this.state.counters[a.counter]??0)<a.goal) throw new ProgressionError('Achievement not earned');
    return this.commit(s=>{s.questsClaimed.push(id);s.stardust=add(s.stardust,a.reward);s.totalStardust=add(s.totalStardust,a.reward);});
  }
  /** Recovery is a deliberate choice, never a silent overwrite of the primary. */
  static recoverCorruptPrimary(storage: StorageLike, catalog: Catalog): SaveState {
    validateCatalog(catalog);
    const raw=storage.getItem('pokebonk.standard.profile.backup.v1');
    if (raw===null) throw new ProgressionError('No backup available');
    const recovered=parseSave(raw,catalog.sourceVersion);
    storage.setItem('pokebonk.standard.profile.v1',raw);
    return jsonCopy(recovered);
  }
  restoreBackup(): SaveState {
    const raw=this.storage.getItem(this.backupKey);
    if (raw===null) throw new ProgressionError('No backup available');
    const next=parseSave(raw,this.catalog.sourceVersion);
    this.storage.setItem(this.key,raw);
    this.state=next;
    return this.snapshot();
  }
}
