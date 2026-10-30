# PokéBonk Standard Offline — Progression + Catalog Audit v0.2

**Target:** Charcher's Pokémon survivor game at https://pokebonk.com, with earned progression and Android offline play.

**Current status:** Local standalone TypeScript progression prototype with test-only economy fixtures, plus a real-client version-pinned economy/catalog extractor. **Not an APK, not a playable game, and not integrated into Charcher's client.** This archive does not include copyrighted game code, Pokémon graphics, models, sound, or the captured upstream snapshot.

## New in v0.2

- Investigated the community project's captured **PokéBonk 0.8.80**, build `mvur4p6p`, manifest. Its 3,021 listed files include all **151 Kanto IDs** for each of five visual/audio groups, totaling 755 mandatory entries. The whole snapshot lists 93,569,796 bytes (~89.2 MiB). This checks manifest completeness, not real-device rendering or redistribution permission.
- Examined the pinned browser client's configuration JavaScript: **3 starter Pokémon (1, 4, 7), 40 League member definitions, 24 Lab upgrades, 59 shop entries, 71 achievement definitions.** Pokémon appearing in the game and League-playable character definitions are different categories; do not confuse 151 Kanto Pokédex species with 151 selectable League characters.
- Added `tools/extract-verified-catalog.mjs`. It extracts actual client-listed Lab costs, shop prices, achievement goals/rewards, starter IDs, and roster IDs from an authorized local snapshot. It checks source hashes/build identity and fails on unrecognized formulas/catalog changes. It does not execute upstream JavaScript.
- Corrected `src/progression.ts`: capture/sighting events no longer silently unlock League characters; the game's separate unlock-challenge logic must be implemented and verified.
- Added seven extractor/manifest tests and one progression regression test. **17/17 local tests pass** (10 progression, 7 new extractor tests). TypeScript static checking passes. These tests are not equivalent to a game or Android test.

## Real client values verified

| Client metadata | Verified in v0.8.80 |
| --- | --- |
| Starter species | 1 Bulbasaur, 4 Charmander, 7 Squirtle |
| First slot-move Lab upgrade price | 1,275 Stardust |
| Vitamin-slot Lab price levels | 1,020 and 2,550 Stardust |
| Reroll Lab price levels | 100, 145, 200, 280, 390, 550 Stardust |
| Soda Pop shop cost | 150 Stardust |
| TM Case shop cost | 3,200 Stardust |
| `k100` achievement | 100 kills, client lists 50 Stardust reward |
| `win1` achievement | 1 win, client lists 200 Stardust reward |

The extractor also resolves the client's symbolic achievement targets `u.maxDex` (151) and `$e.length` (59). **These are client-side catalog definitions, not independently confirmed server transactions.** Never infer actual end-of-run Stardust rewards or final server eligibility from these values.

## How to run

For local regression tests (Node.js 22.16+ and TypeScript CLI):

```bash
node --experimental-strip-types --test test/progression.test.ts
node --test test/verified-catalog.test.mjs
tsc --noEmit --target ES2022 --module nodenext --moduleResolution nodenext --strict --lib ES2022,DOM --allowImportingTsExtensions --skipLibCheck src/progression.ts
```

For a permitted local copy of the VdustR snapshot (`vendor/pokebonk/`, with `snapshot.json` and `game/`):

```bash
node tools/extract-verified-catalog.mjs /path/to/vendor/pokebonk > client-catalog.json
node tools/extract-verified-catalog.mjs /path/to/vendor/pokebonk --verify-assets > client-catalog-byte-verified.json
```

`--verify-assets` checks all 755 required sprite/portrait/icon/audio file hashes on disk. Without it, the extractor checks only inventory metadata. The entire catalog extraction will refuse files that differ from the pinned 0.8.80 snapshot. The local tests exercise the parser against synthetic source fixtures; the exact 0.8.80 client and metadata were separately inspected through GitHub, but the full on-disk extraction has not been executed here because the original game snapshot is not included.

## Integration blockers

1. **Server-side economy:** Actual complete-run reward formula, limits, validation, purchases and claim endpoints are not available from the verified client catalog. The v0.1 fixture reward formula **must not be shipped**.
2. **Unlock semantics:** Prove how each of 40 League member challenges is evaluated; a Pokémon capture is not automatically a playable unlock.
3. **Additional systems:** Research, Pokédex, starter selection, evolutions, achievements with cosmetics, preparation item consumption, maps/difficulties and offline tasks.
4. **Client adaptation:** A separate Standard backend and app ID, without touching existing community Unlocked saves. No native APK has been built.
5. **Permissions:** Original game and underlying Pokémon assets have separate rights. Public availability alone does not grant permission to redistribute an APK. Obtain authorization as appropriate before packaging or distributing protected content.

See `docs/INTEGRATION.md` for additional acceptance gates and `evidence/verified-client-catalog-v0.8.80.json` for source-derived facts.
