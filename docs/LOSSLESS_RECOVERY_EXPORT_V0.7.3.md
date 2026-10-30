# v0.7.3 — Lossless emergency recovery export (source-only)

**Branch:** `feature/v0.7.3-lossless-recovery-export`, stacked on the unmerged v0.7.2 PR #6 head `3c34aadf40554b2f598d9d756b7cfe3d828aa705`. Merge v0.7.2 only after its independent review, and rebase this branch before any final merge into `main`.

## Why
A primary profile may be corrupt or use a future/unknown schema. The standard constructor deliberately refuses it; users still need a way to preserve all Standard-profile data before any explicit recovery, migration, or discard. A raw bundle must not parse, repair, normalize or delete any save content.

## API
- `exportRawRecoveryBundle(storage)`: read all six Standard slots (primary, backup, preImport, preRestore, preUndo and quarantine), preserve each exact string or `null` for an absent key, and return portable JSON.
- `parseRawRecoveryBundle(text)`: structure-only check for a complete six-slot bundle. It does not import or validate the underlying game saves.
- Both functions are read-only. No overwrite, unlock, restore, discarding or hidden fallback.
- The exporter reads every slot twice and fails on an observed change; cross-tab localStorage has no atomic multi-key snapshot, so this is *not* a transactional guarantee.
- No checksum/signature or user-device export confirmation is implemented. The future UI must prompt the player to save and verify the bundle externally before permitting any destructive recovery action.
- It deliberately does not touch keys from other editions.

## Verification boundaries
New tests cover corrupt/unknown-schema bytes, empty vs absent slots, other-edition isolation, no writes, malformed bundle rejection and an observed concurrent save. This is source-only. It does not prove original-game rewards, compatibility with the original client, Android APK functionality or successful device import.

## Remaining blockers
F3/F4 undo recovery conflicts, processed run ID storage growth, versioned migration, multi-tab atomicity, validated upstream catalog/reward rules, authentic gameplay client/assets, Android app packaging and real-device testing.
