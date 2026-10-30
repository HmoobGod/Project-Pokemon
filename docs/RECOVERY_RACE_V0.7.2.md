# Project Pokemon v0.7.2 — missing-primary race guard

**Status:** source-only milestone, not a playable APK.

## Claude N1 follow-up
The v0.7.1 independent review reproduced a data-loss race in `recoverCorruptPrimary()` when the initial primary is `null`. The method validated a backup and then wrote it unconditionally, even if another tab created a newer valid primary in between. The same method already rechecked non-null primaries.

## Fix
Re-read the primary immediately before the recovery's final write, and refuse unless it still exactly equals the original observed value (including `null`). This does **not** make localStorage atomic: the final read → write interval still has a race that requires transactions/locks at a different storage layer.

Four new tests check normal missing-primary restoration, a competing write during backup lookup, a competing write during the final check, and invalid backup fail-closed behavior. The older full source regression suite also runs in CI.

## Unresolved pre-UI risks
- F3: failed undo write can leave a stale pre-undo stash.
- F4: `restorePreUndo()` can encounter a pre-restore conflict after further gameplay.
- Quarantine clear needs a confirmed export and consent in a future UI.
- Versioned migration for incompatible profiles, processed-run growth, multi-tab concurrency and space quota UX remain unresolved.
- No authentic server Stardust reward formula, League entitlements, client integration, licensed content bundle, APK or device verification exists.

Do not merge without green exact-head GitHub CI and independent Claude review.
