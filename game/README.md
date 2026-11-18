# Arena Slice — first playable Three.js vertical slice

A self-contained, **original** Three.js + TypeScript arena-survival prototype living beside (not inside) the existing progression/recovery modules. It does not import, call or modify `../src`, saves, `Current`, R5 DenyAllAuthority, F3/F4 gates or any draft PR.

Status: **prototype vertical slice.** Browser-tested only (headless Chrome). **Not** tested on a phone, **not** packaged as an APK, **not** authentic PokéBonk gameplay or rules.

## What actually works (verified by unit tests + real browser smoke test)

- 60×60 arena with walls and pillars (collision), visible placeholder hero, follow camera (portrait-aware FOV).
- Controls: WASD / arrow keys; touch drag-anywhere virtual joystick (pointer events, works with Android WebView touch).
- Enemies: purple *chaser* from the start, larger red *brute* after 45 s. They spawn in a ring, chase, **wind up (telegraphed pulse) and strike**; stepping away during the wind-up dodges.
- Player auto-attacks the nearest enemy in range with projectiles; hit detection, HP, hit flash, brief invulnerability after being hit.
- Kills drop XP orbs; walking near them (magnet radius) collects XP. **XP only comes from kills.**
- Level-up pauses the run and offers 3 distinct upgrades (damage, fire rate, speed, max HP, multishot, magnet, new **Shock Pulse** AoE ability). Choose by tap/click or keys 1/2/3. Multiple level-ups queue.
- HP 0 → defeat screen with run summary → Restart (button, R or Enter) starts a fresh run.
- Synthesized sound effects (Web Audio, no audio files), mute button / M.

## Deliberately NOT in this slice

No Stardust, currency, rewards, unlocks, saves, stages, bosses or portals. The defeat screen says no rewards are granted. Existing TEST_ONLY reward rates remain untouched until real gameplay authority and safe save settlement exist.

## Run it

Requires Node 22.6+.

```bash
cd game
npm install          # three, @types/three, vite, typescript, esbuild
npm run dev          # http://localhost:5173 — also reachable from a phone on the same Wi-Fi
npm test             # 18 simulation + input unit tests (node --test, no browser)
npm run typecheck    # strict TypeScript over src/
npm run build        # Vite production build -> dist/ (relative paths, base './')
npm run build:esbuild  # alternative build -> dist/ as a classic script; dist/index.html opens straight from disk
npm run check:offline  # fails if dist/ references any remote resource
npx playwright install chromium && npm run smoke   # real browser: keys, touch, level-up, defeat, restart, phone portrait
```

## Layout

```text
game/
  index.html            page + HUD/overlays
  src/sim/              pure deterministic simulation (no DOM/three) — unit tested
  src/input/            keyboard + touch joystick (vectors.ts is pure and tested)
  src/render/scene.ts   Three.js view, original primitive meshes
  src/audio.ts          generated sound effects
  src/main.ts           fixed 60 Hz loop, HUD, level-up/defeat UI
  test/                 node --test suites
  tools/                esbuild build, offline check, Playwright smoke test
```

## Offline / Android notes

Every runtime resource is in `dist/` (JS, CSS, HTML); no fonts, CDNs or network APIs. For a WebView without the `INTERNET` permission, serve `dist/` through `WebViewAssetLoader` (needed for the Vite module build) or load the esbuild classic-script build directly. Not yet done or tested on a device.

## Rights

All code, shapes, colours and sounds here are original placeholders. No PokéBonk code/assets, no Pokémon art, names or audio.
