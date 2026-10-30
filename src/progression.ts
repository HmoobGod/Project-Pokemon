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
  /** Only explicitly verified per-run maxima use max; other counters accumulate. */
  counterModes?: Readonly<Record<string, 'sum' | 'max'>>;
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
  calculateRunStardust(report: Readonly<RunReport>, map: string, mode: RunTicket['mode']): number;
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
/** A defensive bound until the exact upstream multi-run contract is verified. */
export const MAX_PENDING_RUNS = 128;

/** Export is portable JSON with a SHA-256 integrity checksum, NOT a digital signature. */
export interface SaveExportEnvelope {
  kind: 'project-pokemon.standard.export';
  schema: 1;
  sourceVersion: string;
  sha256: string;
  payload: string;
}

const unsafeKey = (key: string): boolean => ['__proto__','prototype','constructor'].includes(key);
const sha256Hex = async (message: string): Promise<string> => {
  const bytes = new TextEncoder().encode(message);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map(byte => byte.toString(16).padStart(2,'0')).join('');
};

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
  if (typeof v !== 'string' || !v.length || unsafeKey(v)) throw new ProgressionError(`Invalid string: ${name}`);
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
  for (const [key,mode] of Object.entries(c.counterModes??{})) {
    if (!c.counterKeys.includes(key) || (mode!=='sum' && mode!=='max')) throw new ProgressionError('Unsupported counter accumulation mode');
  }
  c.achievements.forEach(a=>{nonemptyString(a.id,'achievement id');nonemptyString(a.counter,'counter');if (!c.counterKeys.includes(a.counter) && a.counter !== 'runs' && a.counter !== 'wins') throw new ProgressionError('Achievement counter not in catalog');asInteger(a.goal,'goal'); if (!a.goal) throw new ProgressionError('Zero achievement goal');asInteger(a.reward,'achievement reward');});
  c.maps.forEach(m=> {nonemptyString(m.id,'map id'); if (m.requiresWinOf && !c.maps.some(x=>x.id===m.requiresWinOf)) throw new ProgressionError('Missing map prerequisite');});
  checkUnique(c.lab.map(x=>x.id),'Lab id');checkUnique(c.shop.map(x=>x.key),'shop id');
  checkUnique(c.achievements.map(x=>x.id),'achievement id');checkUnique(c.maps.map(x=>x.id),'map id');checkUnique(c.counterKeys,'counter keys');
  // One directed prerequisite per map: every chain must end at an available root.
  // An otherwise valid catalog with a cycle would permanently strand players.
  if (!c.maps.some(m=>!m.requiresWinOf)) throw new ProgressionError('Map catalog has no unlocked root');
  for (const map of c.maps) {
    const visited = new Set<string>();
    let current: MapRule | undefined = map;
    while (current?.requiresWinOf) {
      if (visited.has(current.id)) throw new ProgressionError('Cyclic map prerequisites');
      visited.add(current.id);
      current = c.maps.find(m=>m.id===current!.requiresWinOf);
      if (!current) throw new ProgressionError('Missing map prerequisite');
    }
  }
}

/** Reject wrong-edition, impossible catalog IDs, and out-of-range Lab levels. */
export function validateStateAgainstCatalog(state: Readonly<SaveState>, catalog: Readonly<Catalog>): void {
  const allowed = <T>(entries: readonly T[], value: T, label: string): void => {
    if (!entries.includes(value)) throw new ProgressionError(`Unknown ${label} in save`);
  };
  if (state.starter !== null) {
    allowed(catalog.starters, state.starter, 'starter');
    if (!state.pokemonUnlocked.includes(state.starter)) throw new ProgressionError('Starter missing from unlocked roster');
  } else if (state.pokemonUnlocked.length || state.processedRuns.length || state.pendingRuns.length || state.mapsWon.length) {
    throw new ProgressionError('Progress exists before starter selection');
  }
  for (const id of state.pokemonUnlocked) allowed(catalog.pokemon,id,'Pokemon unlock');
  for (const id of state.pokemonSeen) allowed(catalog.pokemon,id,'Pokemon sighting');
  for (const key of state.itemsOwned) allowed(catalog.shop.map(i=>i.key),key,'shop item');
  for (const id of state.questsClaimed) allowed(catalog.achievements.map(a=>a.id),id,'achievement');
  for (const map of state.mapsWon) {
    allowed(catalog.maps.map(m=>m.id),map,'map');
    const prerequisite = catalog.maps.find(m=>m.id===map)?.requiresWinOf;
    if (prerequisite && !state.mapsWon.includes(prerequisite))
      throw new ProgressionError('Won map without prerequisite victory');
  }
  for (const run of state.pendingRuns) {
    allowed(catalog.maps.map(m=>m.id),run.map,'pending map');
    const prerequisite = catalog.maps.find(m=>m.id===run.map)?.requiresWinOf;
    if (prerequisite && !state.mapsWon.includes(prerequisite))
      throw new ProgressionError('Pending run map is locked by prerequisite');
  }
  for (const [id,level] of Object.entries(state.lab)) {
    const entry = catalog.lab.find(l => l.id === id);
    if (!entry || level > entry.costByLevel.length) throw new ProgressionError('Invalid Lab level in save');
  }
  for (const key of Object.keys(state.counters)) {
    if (key !== 'runs' && key !== 'wins' && !catalog.counterKeys.includes(key))
      throw new ProgressionError('Unsupported counter in save');
  }
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
  const permittedFields = new Set(['schema','sourceVersion','starter','stardust','totalStardust','pokemonUnlocked','pokemonSeen','lab','itemsOwned','questsClaimed','counters','mapsWon','processedRuns','pendingRuns']);
  if (Object.keys(data).some(key => !permittedFields.has(key))) throw new ProgressionError('Unsupported save field');
  if (data.starter !== null) asInteger(data.starter,'starter');
  asInteger(data.stardust,'stardust');asInteger(data.totalStardust,'totalStardust');
  for (const key of ['pokemonUnlocked','pokemonSeen'] as const) listOf(data[key],x=>{asInteger(x,key);},key);
  for (const key of ['itemsOwned','questsClaimed','mapsWon','processedRuns'] as const) listOf(data[key],x=>{nonemptyString(x,key);},key);
  safeCounters(data.lab,'lab');safeCounters(data.counters,'counters');
  if (!Array.isArray(data.pendingRuns)) throw new ProgressionError('Invalid pending runs');
  if (data.pendingRuns.length > MAX_PENDING_RUNS) throw new ProgressionError('Too many pending run tickets');
  for (const ticket of data.pendingRuns) {
    if (!isRecord(ticket)) throw new ProgressionError('Invalid ticket');
    if (Object.keys(ticket).length !== 3 ||
        !['id','map','mode'].every(key=>Object.hasOwn(ticket,key)))
      throw new ProgressionError('Unexpected pending run ticket fields');
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
  /** Durable pre-import snapshot: normal commits NEVER rotate this slot. */
  readonly preImportKey = 'pokebonk.standard.profile.preimport.v1';
  /** Previous valid primary before a user-initiated restore. */
  readonly preRestoreKey = 'pokebonk.standard.profile.prerestore.v1';
  /** Progress made after a restore, saved before an explicit undo. */
  readonly preUndoKey = 'pokebonk.standard.profile.preundo.v1';
  /** Durable raw rescue copy of a primary that cannot be validated under this build. */
  readonly recoveryQuarantineKey = 'pokebonk.standard.profile.quarantine.v1';
  private state: SaveState;
  private readonly storage: StorageLike;
  private readonly catalog: Catalog;
  private readonly policy: RewardPolicy;
  private readonly idFactory: () => string;
  private persistedRaw: string | null;
  constructor(storage: StorageLike, catalog: Catalog, policy: RewardPolicy, idFactory: () => string = () => crypto.randomUUID()) {
    this.storage = storage; this.catalog = catalog; this.policy = policy; this.idFactory = idFactory;
    validateCatalog(catalog);
    const raw = storage.getItem(this.key);
    if (raw === null && storage.getItem(this.backupKey) !== null)
      throw new ProgressionError('Primary missing; backup available. Recover before starting new progress');
    this.state = raw === null ? freshState(catalog.sourceVersion) : parseSave(raw,catalog.sourceVersion);
    validateStateAgainstCatalog(this.state,catalog);
    this.persistedRaw = raw;
  }
  snapshot(): SaveState { return jsonCopy(this.state); }
  private requireFreshWriter(): void {
    if (this.storage.getItem(this.key) !== this.persistedRaw)
      throw new ProgressionError('Save changed in another session; reopen before writing');
  }
  /** Portable manual backup, deliberately not the browser's internal backup slot. */
  async exportSave(): Promise<string> {
    this.requireFreshWriter();
    const payload = JSON.stringify(this.state);
    const envelope: SaveExportEnvelope = {
      kind: 'project-pokemon.standard.export', schema: 1,
      sourceVersion: this.catalog.sourceVersion,
      sha256: await sha256Hex(payload), payload,
    };
    return JSON.stringify(envelope);
  }
  /** Import is opt-in. Replacing existing progress must be explicitly requested. */
  async importSave(input: string, options: {replace?: boolean} = {}): Promise<SaveState> {
    this.requireFreshWriter();
    let json: unknown;
    try {json = JSON.parse(input);} catch {throw new ProgressionError('Malformed save export JSON');}
    if (!isRecord(json) || json.kind !== 'project-pokemon.standard.export' || json.schema !== 1 ||
        json.sourceVersion !== this.catalog.sourceVersion || typeof json.payload !== 'string' ||
        typeof json.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(json.sha256))
      throw new ProgressionError('Wrong edition, schema, or source version');
    if ((await sha256Hex(json.payload)) !== json.sha256)
      throw new ProgressionError('Save export integrity check failed');
    const imported = parseSave(json.payload,this.catalog.sourceVersion);
    validateStateAgainstCatalog(imported,this.catalog);
    // Do not silently replace either a freshly created in-memory profile or saved progress.
    const existing = this.storage.getItem(this.key);
    if ((existing !== null || this.state.starter !== null) && !options.replace)
      throw new ProgressionError('Existing progress requires explicit replace option');
    this.requireFreshWriter();
    // A replacement cannot silently discard a previous pre-import snapshot.
    // If a prior import was interrupted, retrying the SAME primary is safe.
    const savedPreImport = this.storage.getItem(this.preImportKey);
    if (existing !== null && savedPreImport !== null && savedPreImport !== existing)
      throw new ProgressionError('Pre-import recovery exists; restore or explicitly clear it before importing again');
    // Preserve the pre-import profile independently from the rotating backup.
    // Keeping this slot after future runs protects against accidental imports.
    if (existing !== null && savedPreImport === null) {
      validateStateAgainstCatalog(parseSave(existing,this.catalog.sourceVersion),this.catalog);
      this.storage.setItem(this.preImportKey,existing);
    }
    return this.commit(state => {Object.assign(state, imported);});
  }
  private commit(change: (next: SaveState) => void): SaveState {
    const previous = this.storage.getItem(this.key);
    if (previous !== this.persistedRaw)
      throw new ProgressionError('Save changed in another session; reopen before writing');
    const next = this.snapshot();
    change(next);
    const serialized = JSON.stringify(next);
    validateStateAgainstCatalog(parseSave(serialized,this.catalog.sourceVersion),this.catalog);
    // Re-check the captured raw value before writing, narrowing (not eliminating)
    // the non-atomic localStorage race between validation and mutation.
    if (this.storage.getItem(this.key) !== previous)
      throw new ProgressionError('Save changed in another session; reopen before writing');
    if (previous !== null) {
      validateStateAgainstCatalog(parseSave(previous,this.catalog.sourceVersion),this.catalog);
      this.storage.setItem(this.backupKey,previous);
    }
    this.storage.setItem(this.key,serialized);
    this.persistedRaw = serialized;
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
    if (this.state.pendingRuns.length >= MAX_PENDING_RUNS)
      throw new ProgressionError('Too many pending run tickets');
    const id=this.idFactory();nonemptyString(id,'ticket id');
    if ([...this.state.pendingRuns.map(r=>r.id),...this.state.processedRuns].includes(id)) throw new ProgressionError('Repeated run ID');
    const ticket:RunTicket={id,map,mode};
    this.commit(s=>{s.pendingRuns.push(ticket);});
    return jsonCopy(ticket);
  }
  /** Permanently consumes a pending ticket WITHOUT crediting a run, reward or achievement. */
  abandonRun(ticketId: string): SaveState {
    nonemptyString(ticketId,'run id');
    if (!this.state.pendingRuns.some(ticket=>ticket.id===ticketId))
      throw new ProgressionError('Unknown or already processed run ticket');
    return this.commit(state => {
      state.pendingRuns = state.pendingRuns.filter(ticket=>ticket.id!==ticketId);
      // The consumed ID must not be credited/reused after a reload.
      state.processedRuns.push(ticketId);
    });
  }
  finishRun(ticketId: string, report: RunReport): {state: SaveState; earned: number} {
    const ticket=this.state.pendingRuns.find(t=>t.id===ticketId);
    if (!ticket || this.state.processedRuns.includes(ticketId)) throw new ProgressionError('Unknown or already credited run');
    if (typeof report.victory!=='boolean') throw new ProgressionError('Invalid victory flag');
    safeCounters(report.counters,'report counters');
    for (const key of Object.keys(report.counters)) if (!this.catalog.counterKeys.includes(key)) throw new ProgressionError('Unknown or reserved run counter');
    const seen=report.seen??[],captures=report.captures??[];
    if (!Array.isArray(seen) || !Array.isArray(captures)) throw new ProgressionError('Invalid run species list');
    for(const id of [...seen,...captures]) if (!this.catalog.pokemon.includes(id)) throw new ProgressionError('Unknown Pokemon in run report');
    const earned=asInteger(this.policy.calculateRunStardust(jsonCopy(report),ticket.map,ticket.mode),'run reward');
    const state=this.commit(s=>{
      s.pendingRuns=s.pendingRuns.filter(t=>t.id!==ticketId);
      s.processedRuns.push(ticketId);
      s.counters.runs=add(s.counters.runs??0,1);
      if (report.victory) {
        if (ticket.mode === 'classic') s.mapsWon=unique([...s.mapsWon,ticket.map]);
        s.counters.wins=add(s.counters.wins??0,1);
      }
      for(const [k,n] of Object.entries(report.counters)) {
        s.counters[k]=this.catalog.counterModes?.[k]==='max'
          ? Math.max(s.counters[k]??0,n)
          : add(s.counters[k]??0,n);
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
  /**
   * Recover a missing or rejected primary only after validating the backup.
   * Never discard even malformed primary bytes without a durable rescue copy.
   * An unknown schema/version is never automatically downgraded.
   */
  static recoverCorruptPrimary(storage: StorageLike, catalog: Catalog): SaveState {
    validateCatalog(catalog);
    const key = 'pokebonk.standard.profile.v1';
    const backupKey = 'pokebonk.standard.profile.backup.v1';
    const quarantineKey = 'pokebonk.standard.profile.quarantine.v1';
    const primary = storage.getItem(key);
    if (primary !== null) {
      let data: unknown;
      try { data = JSON.parse(primary); } catch { data = null; }
      if (isRecord(data) && data.schema !== 1)
        throw new ProgressionError('Primary has incompatible save schema; refusing recovery');
      if (isRecord(data) && typeof data.sourceVersion === 'string' && data.sourceVersion !== catalog.sourceVersion)
        throw new ProgressionError('Primary belongs to another game version; refusing recovery');
      try {
        const parsed = parseSave(primary,catalog.sourceVersion);
        validateStateAgainstCatalog(parsed,catalog);
        throw new ProgressionError('Primary is valid; refusing recovery');
      } catch (error) {
        if (error instanceof ProgressionError && error.message==='Primary is valid; refusing recovery') throw error;
        // The rejected raw primary must be preserved, even when the new client
        // is stricter (e.g. old ticket counts or additional ticket fields).
      }
    }
    const raw = storage.getItem(backupKey);
    if (raw === null) throw new ProgressionError('No backup available');
    const recovered = parseSave(raw,catalog.sourceVersion);
    validateStateAgainstCatalog(recovered,catalog);
    if (primary !== null) {
      const existing = storage.getItem(quarantineKey);
      if (existing !== null && existing !== primary)
        throw new ProgressionError('Quarantined recovery snapshot exists; export it before another recovery');
      // Check before writing a quarantine too: avoid an obsolete snapshot
      // poisoning recovery if another tab already changed the primary.
      if (storage.getItem(key) !== primary)
        throw new ProgressionError('Save changed in another session; refusing recovery');
      if (existing === null) storage.setItem(quarantineKey,primary);
      // A second read narrows, but cannot close, localStorage's non-atomic gap.
      if (storage.getItem(key) !== primary) {
        // Remove only a snapshot this call created, and only if unchanged.
        // If cleanup fails, the raw snapshot is retained rather than lost.
        if (existing === null && storage.getItem(quarantineKey) === primary)
          storage.removeItem(quarantineKey);
        throw new ProgressionError('Save changed in another session; refusing recovery');
      }
    }
    storage.setItem(key,raw);
    return jsonCopy(recovered);
  }
  /** The raw pre-recovery snapshot remains accessible for backup/migration. */
  static exportQuarantinedPrimary(storage: StorageLike): string | null {
    return storage.getItem('pokebonk.standard.profile.quarantine.v1');
  }
  /** Preserve the current healthy primary in its OWN slot before restoring. */
  private restoreFrom(raw: string, preserveCurrent: boolean): SaveState {
    this.requireFreshWriter();
    const next = parseSave(raw,this.catalog.sourceVersion);
    validateStateAgainstCatalog(next,this.catalog);
    const current = this.storage.getItem(this.key);
    if (current !== this.persistedRaw)
      throw new ProgressionError('Save changed in another session; reopen before writing');
    // A double-tap restore (same target bytes) must not rotate away an undo.
    if (current === raw) return this.snapshot();
    if (preserveCurrent && current !== null) {
      validateStateAgainstCatalog(parseSave(current,this.catalog.sourceVersion),this.catalog);
      // This recovery slot is deliberately durable, like pre-import. A later
      // restore must not destroy its newer, unrecovered snapshot.
      const preserved = this.storage.getItem(this.preRestoreKey);
      if (preserved !== null && preserved !== current)
        throw new ProgressionError('Pre-restore snapshot exists; restorePreRestore() or clearPreRestoreBackup() first');
      if (preserved === null) this.storage.setItem(this.preRestoreKey,current);
    }
    // Re-check after selecting the source/undo slot. This is still best-effort;
    // localStorage has no atomic compare-and-swap across multiple tabs.
    if (this.storage.getItem(this.key) !== current)
      throw new ProgressionError('Save changed in another session; reopen before writing');
    this.storage.setItem(this.key,raw);
    this.persistedRaw = raw;
    this.state = next;
    return this.snapshot();
  }
  restoreBackup(): SaveState {
    const raw = this.storage.getItem(this.backupKey);
    if (raw === null) throw new ProgressionError('No backup available');
    return this.restoreFrom(raw,true);
  }
  /** Recovers the state before an import, even after subsequent gameplay. */
  restorePreImport(): SaveState {
    const raw = this.storage.getItem(this.preImportKey);
    if (raw === null) throw new ProgressionError('No pre-import recovery available');
    return this.restoreFrom(raw,true);
  }
  /**
   * Undo a previous restore without losing gameplay performed since then.
   * Save the current primary to a separate durable pre-undo slot first.
   * A different existing pre-undo snapshot blocks repeated destructive undos.
   */
  restorePreRestore(): SaveState {
    this.requireFreshWriter();
    const raw = this.storage.getItem(this.preRestoreKey);
    if (raw === null) throw new ProgressionError('No pre-restore recovery available');
    validateStateAgainstCatalog(parseSave(raw,this.catalog.sourceVersion),this.catalog);
    const current = this.storage.getItem(this.key);
    if (current !== this.persistedRaw)
      throw new ProgressionError('Save changed in another session; reopen before writing');
    if (current === raw) return this.snapshot();
    if (current !== null) {
      validateStateAgainstCatalog(parseSave(current,this.catalog.sourceVersion),this.catalog);
      const preserved = this.storage.getItem(this.preUndoKey);
      if (preserved !== null && preserved !== current)
        throw new ProgressionError('Pre-undo snapshot exists; restorePreUndo() or clearPreUndoBackup() first');
      if (this.storage.getItem(this.key) !== current)
        throw new ProgressionError('Save changed in another session; reopen before writing');
      if (preserved === null) this.storage.setItem(this.preUndoKey,current);
    }
    return this.restoreFrom(raw,false);
  }
  /** Reapply the progress preserved immediately before an explicit restore undo. */
  restorePreUndo(): SaveState {
    const raw = this.storage.getItem(this.preUndoKey);
    if (raw === null) throw new ProgressionError('No pre-undo recovery available');
    // This method preserves the current primary via restoreFrom's pre-restore guard.
    return this.restoreFrom(raw,true);
  }
  /** Clearing durable pre-import recovery requires an explicit user choice. */
  clearPreImportBackup(): void {
    this.requireFreshWriter();
    this.storage.removeItem(this.preImportKey);
  }
  /** Make discarding an earlier restore undo a separate, explicit decision. */
  clearPreRestoreBackup(): void {
    this.requireFreshWriter();
    this.storage.removeItem(this.preRestoreKey);
  }
  /** Deliberately discard the extra snapshot captured before an undo. */
  clearPreUndoBackup(): void {
    this.requireFreshWriter();
    this.storage.removeItem(this.preUndoKey);
  }
  /**
   * Remove quarantined raw bytes only if the caller supplies the exact
   * snapshot they have chosen to discard. The UI should require users
   * to export a copy and explicitly confirm the irreversible clear.
   */
  clearQuarantine(expectedRaw: string): void {
    this.requireFreshWriter();
    const current = this.storage.getItem(this.recoveryQuarantineKey);
    if (current === null) throw new ProgressionError('No quarantined primary available');
    if (current !== expectedRaw)
      throw new ProgressionError('Quarantine differs from expected snapshot; refusing clear');
    this.requireFreshWriter();
    if (this.storage.getItem(this.recoveryQuarantineKey) !== expectedRaw)
      throw new ProgressionError('Quarantine changed in another session; refusing clear');
    this.storage.removeItem(this.recoveryQuarantineKey);
  }
}
