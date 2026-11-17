# Offline solo local metadata + public port feasibility — 2026-11-17

## Scope (source-only DRAFT)

The owner allows a **fresh local account**, but insists on earning all gameplay Pokémon, upgrades, rewards, unlocks and purchases. The experimental Android package ID `org.projectpokemon.offlinesandbox` remains completely separate from official Charcher and Standard profiles. This PR introduces a first-run **identity record only**, not a gameplay save or authentic PokéBonk progression.

`OfflineSoloProfileStore` creates one UUIDv4 identity in Android app-private `SharedPreferences("offline_solo_profile_metadata_v1")`. It stores exactly `namespace`, `schema`, `id` and `createdAtEpochMillis`. It creates the record only when none exists; subsequent opens return existing bytes. Unreadable, wrong-namespace, invalid-schema or unexpected fields fail closed **without overwriting existing bytes**. There is no delete/reset/import/export or online migration; `android:allowBackup="false"` remains. Android code is the only consumer; no JavaScript interface, token or user profile exposed to the WebView.

No starter Pokémon, currencies, stardust, XP, purchases, unlocks, run history or synthetic rewards are granted. This is **NOT** a complete player save. The existing Standard `pokebonk.standard.*` keys, raw saves, pending tickets and F3/F4 failed-undo/conflict hazards are untouched.

### Verification gates

- Existing source Node tests + new source checks ensure private namespace, no Standard key coupling, no privileged gameplay fields and fail-closed parsing.
- `OfflineSoloProfileStoreTest` on Android validates stable identity across repeated opens, exactly four metadata fields, and rejection of malicious/invalid profile JSON without storing it. **App/runtime proof is pending** until this exact-head AndroidJUnit suite runs.
- Linux CI compiles the actual Android app and androidTest APK, checks no INTERNET permission, matches all locally bundled demo scripts and runs independent Chromium smoke.
- Android emulator tests, real device persistence after full process death and authentic gameplay must be reported independently. No one may count the disposable placeholder demo as complete PokéBonk.

## Public alternative-port leads — read-only, not imported

1. **JayElDragon/Pokebonk-android** at [`4eafe982dbd8286e129404711a230005c0b67821`](https://github.com/JayElDragon/Pokebonk-android/tree/4eafe982dbd8286e129404711a230005c0b67821): public README says port tools, **not the game**, are in the repository; `porting/port099.py` indicates an offline local backend and a separate untracked pristine original client copy plus upstream mirror script are prerequisites. Public AndroidManifest.xml requests **INTERNET** and allows backup. Reddit author claims offline gameplay and locally stored progression, but this is **not independently verified as authentic earn-only player progression**, and its `INTERNET` permission does not satisfy our no-permission release target. No LICENSE in repo metadata; a comment claiming creator permission does not establish our reuse rights. **Do not import** game code, assets or port code.
2. **VdustR/pokebonk-offline** at [`98e42caa9e9fa488cf39272d32a5b55b8c36d5e9`](https://github.com/VdustR/pokebonk-offline/tree/98e42caa9e9fa488cf39272d32a5b55b8c36d5e9): repository metadata shows AGPL-3.0 for its own code, but descriptions and player reports mention **complete unlocks / unlocked APKs**. That conflicts with our real-earned progression requirement; its license also does not automatically grant redistribution rights to original game/Pokémon assets. **Do not import** gameplay bytes, art, saves or unlocked state.
3. **CharcherGit/pokebonk-app** official desktop Electron wrapper loads the online site and does not establish distributable offline game client/source/assets. **No third-party game content included** in this repository's prototype.
4. **PMDCollab/SpriteCollab** mixed original/rightsholder and artist metadata is for rights/provenance review only. No sprites copied.

### Next safe milestones

- Verify exact-head AndroidJUnit suite including fresh profile persistence and corruption rejection, then a physical-device airplane-mode launch/restart.
- Establish actual original solo gameplay mechanics from authorized source or verified behavior before adding rewards, starter progression or a local ledger.
- Only then design a separate immutable/backup-safe offline progression journal with explicit confirmations. F3/F4 from Standard remain fail-closed and must never be silently migrated.
