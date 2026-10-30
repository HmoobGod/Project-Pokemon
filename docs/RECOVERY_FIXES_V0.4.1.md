# Project Pokemon v0.4.1 — Claude blockers B1 and B2

**Status:** Source-only fix for the October 30, 2026 independent Claude review of v0.4 commit `6e9fae0597066326e18dac3b888983692d557107`.

The source is a synthetic-fixture progression engine. No playable APK or authorized original game client is included.

## B1: Valid primary saves must not be overwritten

- `recoverCorruptPrimary()` now checks the primary before recovering: if it validates against the current catalog, recovery throws `Primary is valid; refusing recovery` without writing. It also refuses to overwrite a readable save explicitly tagged with another game source version.
- It still restores a missing or corrupted current-version primary when a valid rotating backup is present.
- `restoreBackup()` copies the current valid primary into `pokebonk.standard.profile.prerestore.v1` before replacing it with the backup. `restorePreRestore()` restores that retained snapshot without overwriting its own slot.
- Failures to write the pre-restore slot stop the restore before touching the primary.

## B2: Import recovery survives subsequent gameplay

- A replace-import preserves the pre-import primary separately at `pokebonk.standard.profile.preimport.v1`.
- Normal `commit()` backup rotation does **not** touch the pre-import key. After further actions, `restorePreImport()` can restore the old profile, while saving the current profile in the pre-restore key.
- Subsequent replacement imports fail closed rather than overwriting a different pre-import snapshot. A user must explicitly call `clearPreImportBackup()` to release it.
- Repeating a failed import with the identical primary already preserved is safe.

## Additional mitigation

- When the primary is missing but a rotating backup exists, construction now refuses to initialize a fresh save; `recoverCorruptPrimary()` must restore the backup first.
- `commit()` captures and compares the same primary value around state validation. This narrows but does not eliminate the inherent localStorage multi-window race; it remains a best-effort guard, **not** an atomic CAS.

## Evidence and limits

- Eight new targeted Node tests cover valid-primary refusal; pre-restore undo; durable pre-import snapshot after another action; overwrite refusal; explicit clear; orphaned backup; actual corrupt primary recovery; and storage failure before restore/import.
- **44/44 local tests pass** with Node 22.16.0; `tsc 5.8.3` strict typecheck passes.
- These slots are browser storage, not tamper-proof security or an automatic Android file backup. A device wipe or app uninstall can still remove them. Users must be able to manually export copies before real deployment.
- No changes to run Stardust formulas, entitlement grants, original game client/assets, Android builds, or licensing.
- Exact-head GitHub Actions and Claude delta re-review are required before merging.

## Additional follow-ups from Claude review

The nonblocking findings N3–N11 remain on the backlog: spend accounting, map prerequisite cycles, strict ticket keys / pending-run cap, quota UX, catalog migrations, reward-policy mode, expanded test coverage, CI hardening, upstream-snippet audit and stale documentation. Implement and independently review before real-game integration where applicable.
