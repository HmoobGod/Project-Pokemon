/** Browser entry: wires simulation + Three.js view + controls + HUD. */
import { GameView } from './render/scene.ts';
import { createControls } from './input/controls.ts';
import { SoundFx } from './audio.ts';
import { chooseUpgrade, createWorld, step, type World } from './sim/world.ts';
import { xpToNext } from './sim/config.ts';
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

let world: World = createWorld(seedFromUrl());
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
const defeatOverlay = $('defeat');
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
  world = createWorld((Math.random() * 2 ** 32) >>> 0);
  runCount++;
  accumulator = 0;
  syncOverlays();
  view.render(world, 0, true);
}

function syncOverlays(): void {
  startOverlay.classList.toggle('hidden', started);
  levelOverlay.classList.toggle('hidden', !(started && world.phase === 'levelup'));
  defeatOverlay.classList.toggle('hidden', world.phase !== 'defeated');
  if (world.phase === 'levelup' && choicesEl.childElementCount === 0) renderChoices();
  if (world.phase !== 'levelup') choicesEl.innerHTML = '';
  if (world.phase === 'defeated') {
    $('defeat-summary').textContent =
      `Survived ${formatTime(world.time)} · Level ${world.player.level} · ${world.stats.kills} KOs. ` +
      'No rewards are granted in this prototype.';
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
  if (started && world.phase === 'playing' && !document.hidden) {
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
  else if (world.phase === 'levelup' && /^(Digit|Numpad)[123]$/.test(code)) pick(Number(code.slice(-1)) - 1);
  else if (world.phase === 'defeated' && (code === 'KeyR' || code === 'Enter')) restart();
  else if (code === 'KeyM') $('mute').click();
});
window.addEventListener('resize', () => view.resize());
document.addEventListener('visibilitychange', () => {
  last = performance.now();
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
