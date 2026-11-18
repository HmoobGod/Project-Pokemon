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

Requires Node 22.12+.

```bash
cd game
npm ci               # exact versions from package-lock.json
npm run dev          # http://localhost:5173 on this computer only
npm test             # simulation + input unit tests (node --test, no browser)
npm run typecheck    # strict TypeScript over src/
npm run build        # Vite production build -> dist/ (relative paths, base './')
npm run check:offline  # fails if dist/ references any remote resource
npx playwright install chromium && npm run smoke   # real browser: keys, touch, level-up, defeat, restart, phone portrait
npm run build:esbuild  # alternative build -> dist/ as a classic script; dist/index.html opens straight from disk
```

### Preview on a phone (same Wi-Fi)

```bash
npm run dev -- --host 0.0.0.0
```

Find your computer's LAN IP (Windows: `ipconfig` → IPv4 Address; macOS: `ipconfig getifaddr en0`; Linux: `hostname -I`), then open `http://<that-IP>:5173` in the phone's browser. Allow Node through the computer's firewall if the page doesn't load. Stop the server with Ctrl+C when done, since `0.0.0.0` exposes it to your local network.

This only shows the game in the phone's **browser**. It does not prove native Android, WebView packaging, APK install or offline-on-device behaviour — none of those exist yet.

## CI

`.github/workflows/game-ci.yml` runs on every push/PR touching `game/`: `npm ci`, unit tests, strict typecheck, Vite production build, offline-reference check, a no-private-assets check, and a headless-Chromium smoke test against the Vite build (screenshots + log uploaded as an artifact).

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

## Rights and private art

All code, shapes, colours and sounds committed here are original placeholders. No PokéBonk code/assets, no Pokémon art, names or audio.

Model/sprite files (`*.glb`, `*.gltf`, `*.fbx`, `*.obj`, `*.vrm`, images, and the `private-models/`, `private-sprites/`, `private-assets/` folders) are git-ignored, and CI fails if any are tracked under `game/`. Any community art the owner chooses to use stays on the owner's machine with its original credits and licence.
