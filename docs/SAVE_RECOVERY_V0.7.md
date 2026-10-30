# Project Pokemon v0.7 — Undo and quarantine safety

**Scope:** source-only progression prototype. There is no playable APK, original game client, or game asset bundle.

## Why
Claude approved v0.6 for source-only merge but identified pre-UI risks: restoring an undo could discard gameplay performed after the restore (N18); quarantined raw data had no explicit clear operation; and a concurrent primary change could leave a stale quarantine.

## Source changes
- `restorePreRestore()` now preserves the current valid primary in a durable **pre-undo** slot before switching to the pre-restore snapshot. It refuses a different existing pre-undo snapshot instead of silently overwriting it. A no-op undo writes nothing.
- `restorePreUndo()` can restore the preserved post-restore progress using existing pre-restore guards. `clearPreUndoBackup()` is an explicit, stale-writer-protected irreversible clear.
- `clearQuarantine(expectedRaw)` requires the precise raw snapshot to be supplied; it never silently removes another version. A UI must export the raw bytes and confirm the irreversible clear before calling this function.
- `recoverCorruptPrimary()` now re-reads the primary before writing quarantine. If another tab writes after the quarantine, a newly created matching quarantine is removed on best effort before the operation throws.
- New regression tests cover post-restore gameplay, double-taps, conflicts, quota failure, quarantine exact-match clearing, stale tabs, and concurrent recovery.

## Remaining gates
- Full versioned migration and explicit discard/export UI for incompatible saves are not complete.
- Processed run IDs can grow without bound; they must not be compacted in a way that allows reuse.
- Browser `localStorage` is not transactional and cannot prevent every race or device uninstall data loss. Backup export remains essential.
- Upstream Stardust rewards, League entitlement rules, live game integration, content rights, Android APK and device tests remain unverified or absent.

**Merge only after independent exact-head GitHub Actions CI and Claude delta review.**
