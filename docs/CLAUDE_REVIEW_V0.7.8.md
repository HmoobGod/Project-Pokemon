# Claude independent review — PR #12 v0.7.8

This is **source-only test/docs work** after Claude approved PR #11. No APK, client, save-format or recovery mutator changes.

- Repository: https://github.com/HmoobGod/Project-Pokemon
- PR #12: https://github.com/HmoobGod/Project-Pokemon/pull/12
- Base merged v0.7.7 main: `5d72dad1a042ca1c8449720f8d55f679a266d029`.
- **Fetch PR head fresh** from `refs/pull/12/head` and record its complete SHA. Confirm main equals merge-base.

## Required verification

1. Review new `test/corrupt-primary-reason-parity.test.ts` against existing `StandardProgression.recoverCorruptPrimary()` and `assessCorruptPrimaryReadiness()`.
2. Independent 17×8×4 matrix (544 cases): compare **exact preview status to corresponding real live refusal reason**, not merely ready-vs-blocked. Include malformed/nonrecord JSON, empty strings, future schemas, incompatible versions, unavailable or corrupt backups, and occupied/matching quarantine.
3. Verify output has exactly the four promised fields, each belongs to its own strict status label set. No raw data or derived data leaks, no preview writes; Standard-only storage reads.
4. Stress the test with targeted mutations: reorder incompatible-schema/backup-missing priority, reorder corrupt-backup/quarantine priority, append numeric save length or an extra raw prefix to output. Each should fail the test. List false negatives.
5. Run all source Node tests and strict TypeScript at exact head; verify both push and PR CI on same full SHA.
6. Check no existing files under `src/`, package version, reward logic or save formats were modified. **F3/F4 still NOT FIXED**, bundle checksum/import and Android gameplay absent.

Return exact reviewed SHA/base, CI evidence, blockers/nonblockers, **APPROVE or REQUEST CHANGES**, and **MERGE YES or NO**. Do not modify repository during independent review.