# Android offline sandbox — experimental only

**This is NOT an authentic PokéBonk APK, game client, or release.** This is a disposable native Android wrapper around the original placeholder `offline-sandbox/` game loop, for packaging and offline controls tests only.

## Proven scope

- `org.projectpokemon.offlinesandbox` is intentionally separate from any official or earlier game package.
- The manifest declares **no** `INTERNET` or `ACCESS_NETWORK_STATE` permission; Java additionally sets WebView network loading to blocked.
- AndroidX `WebViewAssetLoader` maps `https://appassets.androidplatform.net/assets/*` to exactly the locally bundled `offline-sandbox/index.html`, `engine.js`, `app.js`. No site requests, API keys, official sprites/audio, network assets, online accounts, storage access or original game engine are included.
- The demonstration can move the player with a touch drag on the left side, spawn placeholder circles, fire automatic projectiles, pause and restart. **No Pokémon, actual game rewards, items, upgrades, purchases or saves** are implemented. Players cannot unlock anything in this demo.
- The bundled webpage uses Content Security Policy `connect-src 'none'`. It does **not** prove Android WebView compatibility until exercised on Android hardware/emulator.
- WebView JavaScript is enabled for the local engine only. DOM storage, database, file/content access, file-origin access, mixed content and WebView remote debugging are disabled.
- Standard progression source and raw local saves in the main repository remain untouched. F3/F4 are still not fixed.

## CI and artifact

Workflow `.github/workflows/offline-android-sandbox.yml` builds a temporary `app-debug.apk` with JDK 17, Gradle 8.11.1, Android Gradle Plugin 8.9.2, Android API 35 and AndroidX WebKit 1.14.0. A build job validates the package name, absence of network permissions and byte-for-byte equality of all 3 packaged local webpage files. The independent browser job runs the demo in real headless Chromium, checking the controls and canvas through localhost. CI `browser` is **not** Android or physical-device gameplay.

The debug APK is unsigned for release (Android debug signing only), with a temporary debug keystore created on the GitHub runner. **It is not ready for release or long-term upgrades.** Different jobs/builds may have different debug signing identities; do not replace an installed app without verifying signer compatibility or preserving user data. Since this demo contains no save state, there is no profile to migrate. No builds are promoted to `Current` or tagged as official releases.

Find the exact-head workflow under the **Actions** tab, then its `UNVERIFIED-offline-sandbox-debug-<SHA>` artifact (ZIP containing `app-debug.apk`). Its retention is seven days. Don't present a CI artifact as a device-tested APK.

## Remaining physical acceptance gates

1. Independent review of the sandbox and its Android wrapper, including license/security/static build evidence.
2. Install on a disposable device/emulator. Inspect installed package ID, version, permissions, WebView availability and actual display.
3. Enable airplane mode, launch, move with touch, observe enemies, auto-attacks, pause/resume, restart and 60-second termination.
4. Exit/reopen; confirm no account/server request, permanent save, unintended shared app storage or device-level regression.
5. Only after later verified offline local saves and real gameplay mechanics exist should earned progression be connected. No fake unlocks or zero-effort rewards. Keep original user saves and F3/F4 recovery fail-closed.

**Engineering progress tracker ~14% is source-only estimate, not playable completion.**
