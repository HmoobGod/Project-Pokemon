# v0.7.7 — Read-only corrupt-primary recovery readiness

**Source-only candidate, not an APK.** This adds an advisory assessment for the existing static `StandardProgression.recoverCorruptPrimary` path. The new function does **not** perform recovery, clear quarantine, import a bundle, modify a save, or expose raw save bytes.

## Why this path matters

The older recovery-readiness API previews ordinary restores only when a healthy primary loads. It cannot tell a player whether a malformed primary can be rescued from a backup without losing a preexisting quarantine copy. This v0.7.7 API adds `assessCorruptPrimaryReadiness(storage,catalog)` with a `getItem`-only storage type.

## Outputs and priority

The result has exactly `primary`, `backup`, `quarantine`, `recovery`. It contains **only enum labels**.

- Primary: `missing`, `valid`, `unreadable`, `incompatible-schema`, `incompatible-version`.
- Backup: `missing`, `valid`, `unreadable`.
- Quarantine: `empty`, `matches-primary`, `occupied-other`.
- Recovery: `ready-missing-primary`, `ready-preserve-primary`, `ready-matching-quarantine`, `blocked-primary-valid`, `blocked-incompatible-schema`, `blocked-incompatible-version`, `blocked-backup-missing`, `blocked-backup-unreadable`, `blocked-quarantine-conflict`.

Priority matches live recovery: protect incompatible primary schema/version; reject a valid primary; require a valid backup; for a nonmissing rejected primary block overwriting a different quarantine; otherwise show readiness. When primary is missing, an occupied old quarantine is not overwritten by the real recovery path. A recoverable invalid primary requires preservation in quarantine; do not confuse **future version** with corrupt data or instruct users to discard it.

## Verification scope

The exporter double-reads all six Standard slots and throws on an **observed** concurrent change; this is not an atomic snapshot. A positive preview is not consent or a guarantee. The existing live mutator still revalidates storage, may refuse a race, and can fail quota writes. The matrix tests compare preview with the real static recover method on cloned storage, including occupied/matching quarantine, absent backup, malformed primary and incompatible schema/version, plus read errors and observed mutation.

## Still open

F3/F4 conflict-resolution user experience and repair are **NOT fixed**, and there is no destructive UI, bundle integrity check, verified authentic rewards/assets, bounded processedRuns, offline gameplay, Android APK, real-device installation, or content rights clearance. Explicit raw export and user confirmation are prerequisites to destructive recovery or quarantine disposal.
