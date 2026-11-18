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
- **Zone run (guide-aligned, original art):** 3 zones, each a separate map (Grove, Dunes, Frost: own ground colour, obstacle layout and altar spot) with a **10-minute active zone clock** (frozen while paused or choosing a level-up). When it runs out the **Final Swarm** starts: the HUD turns red, newly spawned wild enemies become much tougher (HP ×2 +0.5/min, damage ×1.5 +0.25/min, faster spawns — **design placeholder values, not authentic**), and you keep fighting; nothing ends or moves on by itself.
- **Guardian altar:** each zone has one altar (green arrow). Stand on it and press the action button (**Wake Guardian** / E / Space) whenever you're ready — early or during the Final Swarm. KOs never wake it; it can be woken once per zone. The Guardian (teal, gold spikes; HP 700/1400/2400) chases, swings and does a telegraphed red-ring slam.
- **Portal:** only the Guardian's real HP-zero defeat opens a portal at its altar. Entering it is another explicit action (**Enter portal**). Zones 1–2 lead to the next zone's fresh map (clock reset, new dormant altar; your level and upgrades carry over). Zone 3's purple portal leads to the **Shrine**.
- **Minimap + full map:** a round, player-centred minimap (top right) shows you, the Guardian altar, the Unown and Challenge altars, an open portal, the awake boss and nearby enemies; important markers stay pinned to the edge when far away. **Tab** or tapping the minimap pauses and shows the whole-arena map in the pause menu (guide #10/#11).
- **Unown altar** (blue crystal, guide #11): stand inside its circle and it fills (progress stays if you step out; fill time is a placeholder). When full, the game pauses and offers the **four blessing tiers** (owner rule: blessings are stat buffs in four tiers). Which stat and how much each tier gives is **not documented yet**, so `BLESSING_EVIDENCE` in `src/sim/config.ts` ships with every stat/amount/source empty and a pick is recorded with `applied: false` and no effect. A tier starts working only when its row is filled with a stat, a positive amount and a cited source.
- **Challenge altar** (crossed orange blades, guide #11): stand on it and tap **Start Challenge** to spawn a wave of **one species** (wave size is a placeholder). Defeat every wave enemy to win it; dying mid-wave or leaving the zone fails it. The documented **Great Ball is NOT granted** — no items exist until run-only items and earned-event provenance are implemented.
- **Shrine → victory → exit (owner rule 2026-11-18):** zone 3's portal leads to the Shrine, where the Legendary (pale, violet halo, 4000 HP, bigger slam) appears. Its real HP-zero defeat **is the run victory**, recorded exactly once at that moment. A gold **exit portal** then opens; walk in and tap **Exit stage** to leave. The exit ends the run with that same victory — it never records a second one or any credit. After the victory nothing can turn the run into a defeat; quitting before the exit still keeps the single victory (`exitedViaPortal: false`).
- Outcomes: **victory** (Legendary defeated; normally followed by the exit portal), **defeat**, **quit** (⏸ → Quit run), plus **restart**. Save & quit is not implemented (needs safe local saves).
- `?preset=short`: same mechanics with 30-second zone clocks and small Guardian/Legendary HP, used by the automated browser test; labelled **SHORT TEST PRESET** on screen.
- HP 0 → defeat screen with run summary → Restart (button, R or Enter) starts a fresh run.
- Synthesized sound effects (Web Audio, no audio files), mute button / M; full-screen button.
- **Optional private sprites:** a generic loader shows locally supplied 2D sprite sheets as camera-facing billboards (8-direction or single-row, animated). Absent, invalid, uncredited or broken sprites fall back to the placeholder shapes. See [PHONE_TEST.md](PHONE_TEST.md#optional-your-own-private-sprites).
- **Credits screen** (start/defeat screens): engine + project credits, plus credits for exactly the sprites that loaded, and any loader problems.
- `?debug=1` shows FPS and screen size (for phone test reports). If WebGL is unavailable a readable error is shown instead of a blank page.

## Deliberately NOT in this slice

No Stardust, Pokédollars, Bonkoins, purchases, items, persistent rewards, unlocks or saves. Every result screen says no rewards are granted. Other guide features (Cursed altar, Great Ball/item rewards, blessing stats/amounts, Cracks/Incense/Relics, Alphas, items/Poké Balls, Meowth, Hypno, Bill's Machine, evolution/Ultimate, statuses, League, Lab, Pokédex…) and owner-reported Tower/rift are a staged backlog — not implemented, no invented rules. Existing TEST_ONLY reward rates remain untouched until real gameplay authority and safe save settlement exist.

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
