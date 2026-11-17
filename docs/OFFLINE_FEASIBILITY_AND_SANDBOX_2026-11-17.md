# Offline-first feasibility checkpoint — 2026-11-17 (America/Chicago)

## User goal and confirmed scope
Personal-use **fully offline solo Android** game is preferred, with convenience settings afterward. A **fresh local profile** is acceptable; importing an existing live account is not a requirement. Authentic earned Pokémon, upgrades, rewards and purchases remain mandatory once those features are implemented; never seed them for free or bypass game purchases. The proposed local profile must use its own namespace and must never overwrite existing Standard or online saves. This changes design priorities, not ownership/licensing constraints.

## Evidence tiers

| Evidence | Verified from public source | What it does NOT prove |
| --- | --- | --- |
| CharcherGit/pokebonk-app `219162945987c3b8c95699c3f84bdc758926f1a3` | Public Electron desktop app `src/main.ts` loads `https://pokebonk.com` by default; package marks `UNLICENSED`, `private: true`. Release v1.4.0 offers developer's Android `PokeBonk-1.0.1-android.apk`. | It does NOT publish the full solo gameplay engine, server logic, offline data pack, Android source, or reuse permission. Developer's APK does not prove offline play. |
| PMDCollab/SpriteCollab `2ce13010294c78baf438f2cef0808a5ea2ef8b6a` | Folders `sprite/0001`, `portrait/0001`, `sprite/0150`, etc.; `credits.txt` marks some current actions `CHUNSOFT` and others `PMDCollab_1` or `CC_BY-NC_4`; repo `LICENSE.md` offers CC BY-NC for eligible community materials. | An image in GitHub is NOT automatically safe to bundle: official artwork, artist provenance, Nintendo/Pokémon IP and noncommercial terms require review. SpriteCollab does not supply PokéBonk gameplay logic or scene assets. |
| This repo's existing Standard progression core | Source tests, save recovery/export/replay protections. Latest merged `main aa3d938982f4218f6aa3d9f40d50d6c6e780b153`; draft PR #15 (7b79f4159fb18b17dd24e9f44e318f02dcdb04a3) independently unreviewed at this checkpoint. | Source tests are synthetic; they do not establish upstream original mechanics, shipped client behavior or APK readiness. F3/F4 remain NOT FIXED. |
| New `offline-sandbox/` | Pure original JS/CSS/HTML, all files local, fixed seed deterministic toy runtime. No remote references, no WebSocket/fetch, no storage calls, no external media. Solo movement, enemy chase, automatic projectiles, collisions, pause, 60-second end. | Prototype mechanics are **not** PokéBonk-authentic; no Pokémon, game economy, roster, unlocks, save progress, original artwork, Android packaging or device results. |

## Runnable source-only prototype

Open `offline-sandbox/index.html` under a browser's trusted local static origin (or a future app-local WebView origin). No account, internet, backend, paid assets, network calls or installation required **by the demo code**. Use WASD/arrows or drag on the left half of the playfield; click Start/Pause/Restart.

All game geometry is placeholder circles and a grid. The prototype consciously **awards nothing**, stores nothing, and cannot change any original save. It is a technical control/loop test only. The `connect-src 'none'` Content Security Policy and test checks reinforce the local-only intent. `node:test` verifies mechanics without browser execution; browser and Android runtime must be tested separately. A file:// browser may enforce its own local script policy, so use an app-local origin for device integration.

## Required gates before the word 'offline PokéBonk APK'

1. Establish authorized, repeatable reproduction of actual solo rules (attacks, damage, enemy spawns, upgrades, item/purchase rules), with public source evidence, permission or separately verified behavior; NEVER claim the placeholders are authentic.
2. Build a local gameplay catalog and assets only with verified rights, granular attribution and no hidden remote dependencies.
3. Build and test a dedicated local-save profile with authentic progression events, explicit backups, and never silently migrate or overwrite any existing raw Standard or browser save bytes. Keep known F3/F4 hazards fail-closed.
4. Build an actual Android package from bundled local resources with a distinct app ID and, if possible, no INTERNET permission. Confirm packaged files and signing scope.
5. Install on an actual device; complete new-account progress and combat in airplane mode, restart and prove save persistence; report installed build and physical gameplay separately.

No official/client/private assets copied; no APK built; no merged UI. This is **isolated source development**, not a playable release. Current tracker ~14% overall source engineering estimate is **not** an acceptance percentage, and need not change based on new sandbox tests.
