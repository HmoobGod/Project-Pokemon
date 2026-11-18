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
- **Stage → boss → portal loop (2 stages):** each stage has a KO quota of normal enemies (30, then 40). Only real KOs count — time alone never advances anything. Meeting the quota spawns that stage's **Guardian** boss (chases, melee wind-up, telegraphed red-ring ground slam; HP 600 / 1000 with an on-screen boss bar). Defeating it is **not** victory: it opens a portal placed ≥12 units away, which you must walk into and explicitly activate (**Enter portal** button / E / Space). Stage 1's portal moves you to the tougher stage 2; stage 2's gold **final portal** is the only way to win. A ground arrow points to the boss/portal.
- Four distinct outcomes: **victory** (final portal), **defeat** (HP 0, at any point — including after a boss dies), **quit** (⏸ → Quit run), and **restart** (new run). The result screen names the outcome and shows time, stage, stages cleared, bosses, level and KOs. Pausing also happens automatically when the phone switches apps.
- `?preset=short`: the same rules with small quotas/boss HP, used by the automated browser test; labelled **SHORT TEST PRESET** on screen.
- HP 0 → defeat screen with run summary → Restart (button, R or Enter) starts a fresh run.
- Synthesized sound effects (Web Audio, no audio files), mute button / M; full-screen button.
- **Optional private sprites:** a generic loader shows locally supplied 2D sprite sheets as camera-facing billboards (8-direction or single-row, animated). Absent, invalid, uncredited or broken sprites fall back to the placeholder shapes. See [PHONE_TEST.md](PHONE_TEST.md#optional-your-own-private-sprites).
- **Credits screen** (start/defeat screens): engine + project credits, plus credits for exactly the sprites that loaded, and any loader problems.
- `?debug=1` shows FPS and screen size (for phone test reports). If WebGL is unavailable a readable error is shown instead of a blank page.

## Deliberately NOT in this slice

No Stardust, currency, purchases, persistent rewards, unlocks or saves. Every result screen says no rewards are granted. Existing TEST_ONLY reward rates remain untouched until real gameplay authority and safe save settlement exist.

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
npm run phone:preview      # production build on http://<LAN-IP>:4173  (or: npm run phone -> dev server on :5173)
# equivalent to: npm run dev -- --host 0.0.0.0
```

Open `http://<your computer's LAN IP>:4173/?debug=1` in Chrome on the phone. Full steps, pass/fail checklist and report template: **[PHONE_TEST.md](PHONE_TEST.md)**. Stop the server with Ctrl+C; `0.0.0.0` exposes it to your local network, so never forward or tunnel it to the internet.

This only shows the game in the phone's **browser**. It does not prove native Android, WebView packaging, APK install or offline-on-device behaviour — none of those exist yet.

## CI

`.github/workflows/game-ci.yml` runs on every push/PR touching `game/`: `npm ci`, unit tests, strict typecheck, Vite production build, offline-reference check, a no-private-assets check, and a check that the build contains no private sprites, and a headless-Chromium smoke test against the Vite build (screenshots + log uploaded as an artifact). The smoke test also generates an **original** throw-away sprite sheet at test time to prove sprite loading, credits and invalid-manifest fallback; no third-party art is involved and nothing is committed.

## Layout

```text
game/
  index.html            page + HUD/overlays
  src/sim/              pure deterministic simulation (no DOM/three) — unit tested
  src/input/            keyboard + touch joystick (vectors.ts is pure and tested)
  src/render/scene.ts   Three.js view, original primitive meshes
  src/sprites/          optional private sprite manifest validation, loader, credits, sheet math
  src/audio.ts          generated sound effects
  src/main.ts           fixed 60 Hz loop, HUD, level-up/defeat UI
  test/                 node --test suites
  tools/                esbuild build, offline check, Playwright smoke test
```

## Offline / Android notes

Every runtime resource is in `dist/` (JS, CSS, HTML); no fonts, CDNs or network APIs. For a WebView without the `INTERNET` permission, serve `dist/` through `WebViewAssetLoader` (needed for the Vite module build) or load the esbuild classic-script build directly. Not yet done or tested on a device.

## Rights and private art

All code, shapes, colours and sounds committed here are original placeholders. No PokéBonk code/assets, no Pokémon art, names or audio.

Private sprites live in `game/public/private-sprites/` (template: `private-sprites.example.js`). Model/sprite files (`*.glb`, `*.gltf`, `*.fbx`, `*.obj`, `*.vrm`, images, and the `private-models/`, `private-sprites/`, `private-assets/` folders) are git-ignored, and CI fails if any are tracked under `game/`. Any community art the owner chooses to use stays on the owner's machine with its original credits and licence.
