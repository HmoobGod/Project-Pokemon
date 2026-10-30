# v0.4 — Offline save integrity and import/export milestone

**Status:** Source-only prototype for Charcher's PokéBonk offline adaptation. There is no playable APK or integrated original client. The reward policy used by tests is synthetic and must never ship as authentic game logic.

## Implemented

- Manual `exportSave()` emits an edition-tagged JSON envelope with schema, pinned sourceVersion, and a Web Crypto SHA-256 checksum of the serialized payload.
- Manual `importSave()` validates envelope identity, game source version, checksum, save schema, catalog identifiers, purchased Lab levels, and counters **before** touching saved progress.
- Import refuses to overwrite existing progress unless explicitly called with `{replace:true}`; the previous valid profile is saved to a recovery slot during an import.
- The same engine's `requireFreshWriter()` checks whether localStorage changed since this instance last loaded/wrote, rejecting **detected stale writes** from a second session. This is best-effort collision detection, not a cross-process compare-and-swap or transactional database.
- Invalid client run species arrays, injected top-level save fields, unknown catalog IDs and unsupported counters reject. A storage write exception leaves the previous primary value and the in-memory progress unchanged.
- Original edition's localStorage keys remain untouched (`pokebonk.local.profile.v1`), while the experimental edition uses `pokebonk.standard.profile.v1` and a separate backup key.

## Integrity and trust boundaries

1. SHA-256 detects accidental modification of an exported file without recomputation. **It is not authentication**: anybody who controls local files can change progress and recompute the checksum. This is a personal offline game, not an anti-cheat server.
2. The game still needs a secure user-controlled export/import UI and Android-compatible file picker. The methods are currently API-only.
3. `localStorage` writes one key at a time. A backup and primary write are not a multi-key transaction. Browser data may be deleted during app removal or corruption, so provide user-initiated exported copies.
4. Concurrent WebViews can still race between a compare and the next write. Resolve by serializing game writes in one runtime, or adopt IndexedDB transactions for stricter multi-window coordination.
5. The source version is pinned to a synthetic fixture for testing; real migration and compatibility with the original game must be designed after the upstream profile and server contracts are verified.
6. Strict catalog checks intentionally fail closed on unknown saved fields. Future schema additions require an explicit versioned migration and a test covering both directions.

## Source verification

Run:

```bash
npm run test
npm run typecheck
```

Local result on 2026-10-30: **36/36 Node automated tests pass** and strict TypeScript checking passes. GitHub Actions status on the exact newly pushed head must be checked independently.

## Next acceptance gates

- Verify original run reward formula and ownership/claim semantics without assuming client metadata equals server authorization.
- Bind `StandardProgression` to a permitted client and a real run-result adapter. Do not credit fabricated client events.
- Integrate import/export UI, restore confirmation and Android file handling.
- Test process death, interrupted writes, app upgrades, device performance, and fresh/offline startup.
- Obtain appropriate content permissions before including copyrighted game code/assets in any public APK.
