# Integration plan and audit — Charcher's PokéBonk Standard offline edition

## Verified community builder architecture

- GitHub repository: https://github.com/VdustR/pokebonk-offline
- Existing Android WebView shell and offline staging: `android/`, `scripts/stage-android.ts`, `scripts/prepare-game.ts`.
- Backend shim: `runtime/local-backend.ts`, injected into client in `scripts/patch-game.ts` by replacing the upstream backend factory.
- Existing save key: `pokebonk.local.profile.v1`; Unlocked edition currently applies `unlock()` on `loadProfile()` and `persist()`.
- Upstream `types/profile.d.ts` describes fields such as `league`, `unlocked`, `lab`, `stardust`, `totalStardust`, `itemsOwned`, `quests`, `biomes`, `counters`, `runs` and task records.
- Upstream builder `docs/editions.md` explicitly documents the missing Standard backend and the necessary isolation from Unlocked saves.

These paths and behavior were checked through the public repository as of October 30, 2026. The reference project's source is not bundled in this ZIP.

## Integration, in dependency order

1. **Rights + client parity gate.** Confirm permission to package the game and third-party resources. Obtain a permitted, pinned version of the client. Record an upstream build id. Do not pull authenticated or secret backend responses.
2. **Economy contract extraction.** For that exact build, independently verify the starter options, catalog/item eligibility and level costs, Stardust reward calculation for win/loss, achievement prerequisites, map/difficulty chain and consumption rules. Record verifiable evidence per rule; leave any unknown rule disabled instead of guessing.
3. **New Standard edition code path.** Add a build-time `standard` variant in `scripts/patch-game.ts` and `scripts/prepare-game.ts`. Keep the existing `unlock-all` variant unchanged. Replace the Standard backend with a shim that delegates to `StandardProgression`, rather than invoking `unlock()`.
4. **Upstream profile adapter.** Convert `SaveState` to/from the exact `Profile` shape expected by the current client. Make precise mappings for `starter`/`lastSpecies`, League/captures, research, Lab, purchases, quests, maps, medals and currencies. Preserve unknown upstream preference fields. Do not quietly migrate already-unlocked profiles.
5. **Run-report trust and bridge.** Adapt `startRun`, `finishRun`, `buyLab`, `buyItem`, `actions`, `claimQuest` and task refresh. Validate source UI call signatures, ticket identity and run results. Most importantly, connect the verified real `stardust` formula and accept only supported counters. Distinguish Classic wins from non-Classic completed runs.
6. **Missing systems.** Implement daily/weekly task periods with period-specific single claim IDs, research and League qualification, map difficulties and medals, cosmetics, preparation consumables, shop/archive details and any additional required backend actions. No fake completion or grants.
7. **Independent installation identity.** Use a distinct Android `applicationId` and separate Android app label for Standard. Keep Unlocked's package name, signing and saves untouched. In Electron use a separate bundle ID *and* user-data path. Keep separate Standard localStorage keys.
8. **Client & emulator acceptance.** Confirm starter -> run -> actual earned Stardust -> one real Lab/shop purchase -> reload persistence. Test win/loss rewards, purchase/claim retries, negative/overflow input, save corruption, force-quit, updates and app reinstall behavior. Test phone WebView GPU/controls specifically. Keep internet permission off if all content is local.
9. **Package signing and release.** Build an APK only after upstream compatibility and source/permission gates pass. Test actual Android launch. Record reproducible build inputs, digests and signature identity.

## Known major gaps in this v0.1 implementation

- Not integrated with the original game's minified client or builder; no source patch yet.
- Game version catalogs and server-reward rules not supplied.
- Item ownership is a basic single-purchase model: consumable counts and special cases need separate contracts.
- Unlocking captured Pokémon is illustrative; normal League capture/research requirements must be verified before integration.
- Map prerequisite data are externally supplied; difficulty, medal, mode-specific and region rules are not implemented.
- Achievements only grant numeric Stardust; title/cosmetic rewards are not implemented.
- Basic localStorage backup only, no export/import or multiple rotating backups.
- App assets and Android build chain are not included.

## Current local acceptance results

- New progress starts empty: PASS
- Starter -> run -> reward -> Lab + shop + achievement -> reopen: PASS (synthetic rules)
- Run credited once across reload: PASS
- Reject insufficient funds and duplicate claims: PASS
- Corrupt save rejected, explicit backup restore available: PASS
- Invalid counters/captures and unknown items rejected: PASS
- Standard and Unlocked save keys independent: PASS
- Non-Classic win does not unlock next Classic map: PASS
- Corrupt backup refuses recovery without touching primary: PASS

**Not a playable ROM/APK, Android test, or proof of gameplay parity.**
