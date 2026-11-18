/** Browser entry: wires simulation + Three.js view + controls + HUD. */
import { GameView } from './render/scene.ts';
import { createControls } from './input/controls.ts';
import { SoundFx } from './audio.ts';
import { availableAction, chooseBlessing, chooseUpgrade, createWorld, distanceToPortal, isRunOver, mapLabel, overtimeSeconds, performAction, quitRun, step, type World } from './sim/world.ts';
import { RARITY_STYLE, SHORT_RULES, blessingIsEvidenced, xpToNext } from './sim/config.ts';
import { drawMap } from './ui/minimap.ts';
import { UPGRADES } from './sim/upgrades.ts';
import { browserLoaderDeps, loadPrivateSprites, type SpriteLoadResult } from './sprites/loader.ts';
import { buildCredits, spriteStatusText } from './sprites/credits.ts';

const FIXED_DT = 1 / 60;

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

function seedFromUrl(): number {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) ? n >>> 0 : (Math.random() * 2 ** 32) >>> 0;
}

function formatTime(t: number): string {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const canvas = $('view') as HTMLCanvasElement;
const params = new URLSearchParams(location.search);

function fatal(message: string): never {
  $('fatal-msg').textContent = message;
  $('fatal').classList.remove('hidden');
  $('start').classList.add('hidden');
  throw new Error(message);
}

let view: GameView;
try {
  view = new GameView(canvas);
} catch (e) {
  fatal(`This browser could not start 3D graphics (WebGL). Try updating Chrome or turning off battery saver. Details: ${(e as Error).message}`);
}
const controls = createControls($('app'), $('stick'), $('knob'));
const sfx = new SoundFx();

// ?preset=short = same rules with small quotas, for automated/quick tests. Clearly labelled on screen.
const shortPreset = params.get('preset') === 'short';
const worldOptions = shortPreset ? { rules: SHORT_RULES } : {};
let world: World = createWorld(seedFromUrl(), worldOptions);
let paused = false;
let started = false;
let accumulator = 0;
let last = performance.now();
let runCount = 1;
let spriteResult: SpriteLoadResult | null = null;
let fps = 0;

const hpFill = $('hp-fill');
const hpText = $('hp-text');
const xpFill = $('xp-fill');
const xpText = $('xp-text');
const timeEl = $('time');
const killsEl = $('kills');
const startOverlay = $('start');
const levelOverlay = $('levelup');
const resultOverlay = $('result');
const pauseOverlay = $('pause-menu');
const actionBtn = $('action-btn');
const blessingOverlay = $('blessing');
const blessingChoicesEl = $('blessing-choices');
const interactStatus = $('interact-status');
const minimapCanvas = $('minimap') as HTMLCanvasElement;
const fullmapCanvas = $('fullmap') as HTMLCanvasElement;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
function sizeCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const css = c.getBoundingClientRect().width || c.width;
  c.width = Math.round(css * DPR);
  c.height = Math.round(css * DPR);
  return c.getContext('2d');
}
let miniCtx = sizeCanvas(minimapCanvas);
let fullCtx: CanvasRenderingContext2D | null = null;
const zoneClock = $('zone-clock');
const objectiveText = $('objective-text');
const bossBar = $('boss-bar');
const bossFill = $('boss-fill');
$('preset-tag').classList.toggle('hidden', !shortPreset);
const choicesEl = $('choices');

function renderChoices(): void {
  choicesEl.innerHTML = '';
  if (!world.choices) return;
  $('levelup-title').textContent = `Level ${world.player.level - world.pendingLevelUps + 1}! Choose one`;
  world.choices.forEach((id, i) => {
    const def = UPGRADES[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.dataset.upgrade = id;
    b.innerHTML = `<b>${i + 1}. ${def.name}</b>${def.describe(world.player)}`;
    b.addEventListener('click', () => pick(i));
    choicesEl.appendChild(b);
  });
}

function pick(i: number): void {
  if (chooseUpgrade(world, i)) {
    handleEvents();
    syncOverlays();
  }
}

function restart(): void {
  view.clearDynamic();
  world = createWorld((Math.random() * 2 ** 32) >>> 0, worldOptions);
  paused = false;
  runCount++;
  accumulator = 0;
  syncOverlays();
  view.render(world, 0, true);
}

function syncOverlays(): void {
  startOverlay.classList.toggle('hidden', started);
  levelOverlay.classList.toggle('hidden', !(started && world.phase === 'levelup'));
  resultOverlay.classList.toggle('hidden', !isRunOver(world));
  pauseOverlay.classList.toggle('hidden', !(paused && !isRunOver(world)));
  if (paused && !isRunOver(world)) {
    fullCtx = sizeCanvas(fullmapCanvas);
    if (fullCtx) drawMap(fullCtx, world, fullmapCanvas.width, 'full');
  }
  blessingOverlay.classList.toggle('hidden', world.phase !== 'blessing');
  if (world.phase === 'blessing' && blessingChoicesEl.childElementCount === 0) renderBlessings();
  if (world.phase !== 'blessing') blessingChoicesEl.innerHTML = '';
  if (world.phase === 'levelup' && choicesEl.childElementCount === 0) renderChoices();
  if (world.phase !== 'levelup') choicesEl.innerHTML = '';
  const r = world.result;
  if (r) {
    const title = r.outcome === 'victory' ? 'Victory!' : r.outcome === 'quit' ? 'Run abandoned' : 'Defeated';
    $('result-title').textContent = title;
    resultOverlay.dataset.outcome = r.outcome;
    const lead =
      r.outcome === 'victory'
        ? `Run complete: you defeated the Legendary at ${formatTime(r.victoryTime ?? r.time)}${r.exitedViaPortal ? ' and left through the exit portal' : ' (you left before taking the exit portal; the victory still counts once)'}.`
        : r.outcome === 'quit'
          ? 'You quit the run.'
          : 'You were knocked out.';
    $('result-summary').textContent =
      `${lead} Time ${formatTime(r.time)} · Reached ${r.reached} · Zones cleared ${r.zonesCleared}/${world.rules.zones.length} · Guardians ${r.guardiansDefeated} · ` +
      `Final Swarms ${r.finalSwarmsReached} · Level ${r.level} · ${r.kills} KOs. No rewards, currency or unlocks are granted in this prototype.`;
  }
}

function renderBlessings(): void {
  blessingChoicesEl.innerHTML = '';
  (world.blessingChoices ?? []).forEach((opt, i) => {
    const st = RARITY_STYLE[opt.rarity];
    const ok = blessingIsEvidenced(opt.effect);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `choice rarity-${opt.rarity}`;
    b.style.borderColor = st.color;
    b.dataset.rarity = opt.rarity;
    const name = document.createElement('b');
    name.style.color = st.color;
    name.textContent = `${i + 1}. ${st.label} blessing`;
    const eff = document.createElement('span');
    eff.textContent = ok ? `${opt.effect!.stat} +${opt.effect!.amount}` : 'Effect pending evidence (no effect yet)';
    b.append(name, eff);
    b.addEventListener('click', () => pickBlessing(i));
    blessingChoicesEl.appendChild(b);
  });
}

function pickBlessing(i: number): void {
  if (chooseBlessing(world, i)) {
    handleEvents();
    syncOverlays();
  }
}

function setPaused(on: boolean): void {
  if (on && (!started || isRunOver(world))) return;
  paused = on;
  last = performance.now();
  accumulator = 0;
  syncOverlays();
}

function tryAction(): void {
  if (paused) return;
  const done = performAction(world);
  if (done) {
    if (done === 'enter-portal') view.clearDynamic();
    handleEvents();
    syncOverlays();
  }
}

function quit(): void {
  if (quitRun(world)) {
    paused = false;
    handleEvents();
    syncOverlays();
  }
}

function handleEvents(): void {
  let shot = false;
  for (const ev of world.events) {
    switch (ev.type) {
      case 'shot': shot = true; break;
      case 'enemyHit': sfx.play('hit'); break;
      case 'enemyKilled': sfx.play('kill'); break;
      case 'playerHit': sfx.play('hurt'); break;
      case 'xpCollected': sfx.play('xp'); break;
      case 'levelUp': sfx.play('levelup'); choicesEl.innerHTML = ''; break;
      case 'pulse': sfx.play('pulse'); view.spawnPulseRing(ev.radius); break;
      case 'defeated': sfx.play('defeat'); break;
      case 'guardianAwakened': sfx.play('boss'); break;
      case 'unownCharged': sfx.play('levelup'); break;
      case 'challengeStarted': sfx.play('boss'); break;
      case 'challengeWon': sfx.play('levelup'); break;
      case 'challengeFailed': sfx.play('hurt'); break;
      case 'legendaryAppeared': sfx.play('boss'); break;
      case 'finalSwarm': sfx.play('boss'); break;
      case 'bossSlam': sfx.play('pulse'); { const b = world.enemies.find((e) => e.id === ev.id); if (b) view.spawnPulseRing(ev.radius, b.pos, 0xff3030); } break;
      case 'guardianDefeated': sfx.play('levelup'); break;
      case 'portalOpened': sfx.play('portal'); break;
      case 'zoneTransition': sfx.play('portal'); break;
      case 'shrineEntered': sfx.play('portal'); break;
      case 'legendaryDefeated': sfx.play('victory'); break;
      case 'exitPortalOpened': sfx.play('portal'); break;
      case 'stageExited': sfx.play('portal'); break;
      default: break;
    }
  }
  if (shot) sfx.play('shot');
}

function updateHud(): void {
  const p = world.player;
  hpFill.style.width = `${(100 * p.hp) / p.maxHp}%`;
  hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  const need = xpToNext(p.level);
  xpFill.style.width = `${(100 * Math.min(p.xp, need)) / need}%`;
  xpText.textContent = `Lv ${p.level}  ${p.xp}/${need} XP`;
  timeEl.textContent = formatTime(world.time);
  killsEl.textContent = String(world.stats.kills);
  const m = world.map;
  const boss = m.bossId !== null ? world.enemies.find((e) => e.id === m.bossId) : undefined;
  if (m.kind === 'zone') {
    const left = m.zoneSeconds - m.zoneTime;
    zoneClock.textContent = m.finalSwarm ? `Zone ${m.index + 1}/${m.zoneCount} · FINAL SWARM +${formatTime(overtimeSeconds(world))}` : `Zone ${m.index + 1}/${m.zoneCount} · ${m.name} · ${formatTime(Math.max(0, Math.ceil(left)))}`;
    zoneClock.classList.toggle('swarm', m.finalSwarm);
    const toShrine = m.index === m.zoneCount - 1;
    objectiveText.textContent =
      m.state === 'explore'
        ? 'Wake the Guardian at its altar (green arrow) when you are ready'
        : m.state === 'guardian'
          ? 'Defeat the Guardian!'
          : `Portal open — stand in it and enter${toShrine ? ' (leads to the Shrine)' : ` (to Zone ${m.index + 2})`}`;
  } else {
    zoneClock.textContent = 'Shrine';
    zoneClock.classList.remove('swarm');
    objectiveText.textContent =
      m.state === 'intro' ? 'The Legendary approaches…' : m.state === 'cleared' ? 'VICTORY! Run complete — exit the stage through the portal' : 'Defeat the Legendary (defeating it wins the run)';
  }
  $('shrine-tag').classList.toggle('hidden', true);
  bossBar.classList.toggle('hidden', !boss);
  if (boss) {
    bossFill.style.width = `${(100 * boss.hp) / boss.maxHp}%`;
    $('boss-text').textContent = `${boss.kind === 'legendary' ? 'Legendary' : 'Guardian'} ${Math.ceil(boss.hp)} / ${boss.maxHp}`;
  }
  const act = started && !paused ? availableAction(world) : null;
  actionBtn.classList.toggle('hidden', !act);
  actionBtn.classList.toggle('altar', act === 'wake-guardian');
  actionBtn.classList.toggle('challenge', act === 'start-challenge');
  actionBtn.classList.toggle('shrine', act === 'enter-portal' && m.index === m.zoneCount - 1);
  actionBtn.dataset.action = act ?? '';
  actionBtn.classList.toggle('exit', act === 'exit-stage');
  actionBtn.textContent = act === 'exit-stage' ? 'Exit stage' : act === 'wake-guardian' ? 'Wake Guardian' : act === 'start-challenge' ? 'Start Challenge' : act === 'enter-portal' ? (m.index === m.zoneCount - 1 ? 'Enter portal to Shrine' : 'Enter portal') : '';
  const u = m.unown;
  const c = m.challenge;
  let status = '';
  if (u && (u.state === 'charging' || (u.state === 'idle' && u.charge > 0))) status = `Unown altar ${Math.round(u.charge * 100)}%${u.state === 'idle' ? ' (step back in to continue)' : ''}`;
  if (c?.state === 'active') status = `Challenge: ${c.total - c.remaining}/${c.total} ${c.species}s defeated`;
  interactStatus.textContent = status;
  interactStatus.classList.toggle('hidden', !status || !started);
  if (miniCtx) drawMap(miniCtx, world, minimapCanvas.width, 'mini');
}

const debugEl = $('debug');
const debugOn = params.get('debug') === '1';
debugEl.classList.toggle('hidden', !debugOn);

function frame(now: number): void {
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (frameDt > 0) fps = fps * 0.9 + (1 / frameDt) * 0.1;
  if (debugOn) {
    debugEl.textContent = `${fps.toFixed(0)} fps  ${window.innerWidth}x${window.innerHeight} @${(window.devicePixelRatio || 1).toFixed(1)}x\nenemies ${world.enemies.length}  ${spriteStatusText(spriteResult)}`;
  }
  if (started && !paused && world.phase === 'playing' && !document.hidden) {
    accumulator += frameDt;
    let changed = false;
    while (accumulator >= FIXED_DT) {
      step(world, controls.getMove(), FIXED_DT);
      accumulator -= FIXED_DT;
      handleEvents();
      if (world.events.length) changed = true;
      if (world.phase !== 'playing') {
        accumulator = 0;
        break;
      }
    }
    if (changed) syncOverlays();
  }
  updateHud();
  view.render(world, frameDt);
  requestAnimationFrame(frame);
}

function renderCredits(): void {
  const list = $('credits-list');
  list.replaceChildren();
  for (const c of buildCredits(spriteResult ?? { sprites: new Map() })) {
    const h = document.createElement('h3');
    h.textContent = c.heading;
    list.appendChild(h);
    for (const line of c.lines) {
      const p = document.createElement('p');
      p.className = 'credit';
      p.textContent = line; // textContent only: manifest text can never inject markup
      list.appendChild(p);
    }
  }
  $('credits-sprite-status').textContent = spriteStatusText(spriteResult);
  const probs = $('credits-problems');
  probs.replaceChildren();
  for (const pr of spriteResult?.problems ?? []) {
    const li = document.createElement('li');
    li.textContent = pr;
    probs.appendChild(li);
  }
}

function showCredits(open: boolean): void {
  if (open) renderCredits();
  $('credits').classList.toggle('hidden', !open);
}

async function initSprites(): Promise<void> {
  try {
    spriteResult = await loadPrivateSprites(browserLoaderDeps());
  } catch (e) {
    spriteResult = { status: 'failed', sprites: new Map(), problems: [String(e)] };
  }
  try {
    if (spriteResult.sprites.size > 0) view.setSprites(spriteResult.sprites);
  } catch (e) {
    spriteResult = { status: 'failed', sprites: new Map(), problems: [...spriteResult.problems, `renderer: ${String(e)}`] };
    view.setSprites(new Map());
  }
  $('sprite-status').textContent = spriteStatusText(spriteResult);
  if (spriteResult.problems.length) console.warn('[sprites]', spriteResult.problems.join(' | '));
}

function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    /* not supported (e.g. some WebViews) */
  }
}

function begin(): void {
  if (started) return;
  started = true;
  sfx.unlock();
  last = performance.now();
  syncOverlays();
}

$('start-btn').addEventListener('click', begin);
$('restart-btn').addEventListener('click', restart);
$('credits-btn').addEventListener('click', () => showCredits(true));
$('credits-btn-2').addEventListener('click', () => showCredits(true));
$('credits-close').addEventListener('click', () => showCredits(false));
$('fullscreen').addEventListener('click', toggleFullscreen);
$('pause').addEventListener('click', () => setPaused(!paused));
// Tap the minimap (or press Tab) for the full map, shown in the pause menu like the guide's pause screen.
minimapCanvas.addEventListener('click', () => {
  if (world.phase === 'playing') setPaused(true);
});
$('resume-btn').addEventListener('click', () => setPaused(false));
$('quit-btn').addEventListener('click', quit);
actionBtn.addEventListener('click', tryAction);
$('mute').addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  $('mute').textContent = sfx.muted ? '🔇' : '🔊';
});
controls.onKey((code) => {
  if (!$('credits').classList.contains('hidden')) {
    if (code === 'Escape' || code === 'Enter') showCredits(false);
    return;
  }
  if (!started && (code === 'Enter' || code === 'Space')) begin();
  else if (paused && (code === 'Escape' || code === 'KeyP')) setPaused(false);
  else if (paused && code === 'KeyQ') quit();
  else if (world.phase === 'levelup' && /^(Digit|Numpad)[123]$/.test(code)) pick(Number(code.slice(-1)) - 1);
  else if (world.phase === 'blessing' && /^(Digit|Numpad)[123]$/.test(code)) pickBlessing(Number(code.slice(-1)) - 1);
  else if (code === 'Tab' && started && !isRunOver(world) && (paused || world.phase === 'playing')) setPaused(!paused);
  else if (isRunOver(world) && (code === 'KeyR' || code === 'Enter')) restart();
  else if (world.phase === 'playing' && (code === 'Escape' || code === 'KeyP')) setPaused(true);
  else if (world.phase === 'playing' && (code === 'KeyE' || code === 'Space')) tryAction();
  else if (code === 'KeyM') $('mute').click();
});
window.addEventListener('resize', () => {
  view.resize();
  miniCtx = sizeCanvas(minimapCanvas);
});
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  if (document.hidden && world.phase === 'playing') setPaused(true); // phone: switching apps pauses
});

// Read-only snapshot for automated smoke tests. It exposes no way to change the run.
Object.defineProperty(window, '__arenaSlice', {
  value: Object.freeze({
    snapshot: () => ({
      started,
      runCount,
      phase: world.phase,
      time: world.time,
      player: { x: world.player.pos.x, z: world.player.pos.z, hp: world.player.hp, maxHp: world.player.maxHp, level: world.player.level, xp: world.player.xp, upgrades: [...world.player.upgradesTaken] },
      enemies: world.enemies.length,
      paused,
      preset: shortPreset ? 'short' : 'normal',
      blessingChoices: world.blessingChoices ? [...world.blessingChoices] : null,
      blessings: world.blessings.map((b) => ({ ...b })),
      victory: world.victory ? { ...world.victory } : null,
      unown: world.map.unown ? { x: world.map.unown.pos.x, z: world.map.unown.pos.z, state: world.map.unown.state, charge: world.map.unown.charge } : null,
      challenge: world.map.challenge ? { x: world.map.challenge.pos.x, z: world.map.challenge.pos.z, state: world.map.challenge.state, species: world.map.challenge.species, total: world.map.challenge.total, remaining: world.map.challenge.remaining } : null,
      challengeEnemies: world.enemies.filter((e) => e.challenge).map((e) => e.kind),
      map: { kind: world.map.kind, index: world.map.index, zoneCount: world.map.zoneCount, name: world.map.name, label: mapLabel(world.map), state: world.map.state, zoneTime: world.map.zoneTime, zoneSeconds: world.map.zoneSeconds, finalSwarm: world.map.finalSwarm, altar: world.map.altar ? { x: world.map.altar.pos.x, z: world.map.altar.pos.z, state: world.map.altar.state } : null, portal: world.map.portal ? { ...world.map.portal } : null, portalDistance: distanceToPortal(world), action: availableAction(world) },
      boss: (() => { const b = world.enemies.find((e) => e.id === world.map.bossId); return b ? { kind: b.kind, hp: b.hp, maxHp: b.maxHp, x: b.pos.x, z: b.pos.z, ai: b.ai } : null; })(),
      enemyPositions: world.enemies.map((e) => [Math.round(e.pos.x * 10) / 10, Math.round(e.pos.z * 10) / 10, e.kind === 'boss' || e.kind === 'legendary' ? 1 : 0]),
      orbPositions: world.orbs.slice(0, 60).map((o) => [Math.round(o.pos.x * 10) / 10, Math.round(o.pos.z * 10) / 10]),
      result: world.result ? { ...world.result } : null,
      stats: { ...world.stats },
      kills: world.stats.kills,
      xpCollected: world.stats.xpCollected,
      choices: world.choices ? [...world.choices] : null,
      sprites: spriteResult ? { status: spriteResult.status, roles: [...spriteResult.sprites.keys()], rendered: view.activeSpriteRoles(), problems: [...spriteResult.problems] } : null,
      fps: Math.round(fps),
    }),
  }),
});

syncOverlays();
view.render(world, 0, true);
requestAnimationFrame(frame);
void initSprites();
