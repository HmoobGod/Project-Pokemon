# v0.4.2 — Claude B3 + N12 delta repairs

**Parent head:** `0ea9a3f1ad0277828b5183c5c8a210c96d231653` (v0.4.1, Claude REQUEST CHANGES).  
**Target:** source-only recovery safety, not a playable APK.

## B3 — repeated restore loses the newest save

- `restoreFrom()` validates the target, then returns without writes when the current serialized primary already equals the target. Repeated identical `restoreBackup()` calls therefore cannot overwrite an undo.
- If a different pre-restore snapshot exists, a new restore refuses with `Pre-restore snapshot exists` before writing. The user can explicitly call `restorePreRestore()` to recover that snapshot or `clearPreRestoreBackup()` to release the slot for a later restore.
- When the pre-restore slot already equals the healthy current primary, restoring another valid source can reuse it without rotation.
- The current primary is rechecked immediately before replacement. This narrows, but cannot close, the localStorage cross-tab race.

## N12 — future schema must not look like corruption

- `recoverCorruptPrimary()` now rejects a readable JSON object whose `schema` is not exactly `1` (including schema `2` and absent schema) instead of overwriting a future-format profile.
- A primary with a different `sourceVersion` is likewise protected; malformed JSON and corrupt schema-1 data may be recovered only from a validated same-version backup.

## Verification

- Added seven focused regression tests: no-op double restore (with writes forbidden), restore → action → restore refusal, pre-import restoration conflict, explicit clear, safe undo followed by restore, future-schema rejection, and failed pre-restore storage write.
- Expected total: **51 automated tests**; confirm using exact-head CI before merging.
- Local save checksums are not cryptographic authentication; source-only code has no real game integration, Android APK, or permissions to distribute original game assets.
- Merge requires both exact-head GitHub Actions success and Claude delta re-review.

## Remaining work

Claude's prior nonblocking issues (spend-accounting, map cycles, strict ticket keys, pending run cap, catalog migration, quota handling, original client licensing, and run rewards) remain open. No unlocks, economy values, or original game assets were introduced.
