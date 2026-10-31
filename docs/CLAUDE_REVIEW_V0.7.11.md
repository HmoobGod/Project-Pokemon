# Claude — focused independent review of Project Pokemon PR #15 (v0.7.11)

**Source-only. No gameplay client, APK, real-device certification or F3/F4 fix.**

**Base main:** `aa3d938982f4218f6aa3d9f40d50d6c6e780b153` (v0.7.10, PR #14 Claude-approved/merged). **Fetch PR #15 head fresh** from `refs/pull/15/head` and report exact full SHA, base/merge-base and drift.

Review ONLY the changed `src/progression.ts` import/opt-in code, `test/import-run-mode-safety.test.ts`, related existing save/import/replay tests, and compatibility documentation. Full historical repo audit not needed.

1. Ensure `importSave` no longer leaks stale optional `runSequence` when importing legacy into opted-in mode. Check fully replacing the state inside guarded commit does NOT drop unrelated required fields, change save formats, corrupt existing pre-import rescue or bypass checksum, catalog validation, stale-writer protections or `replace:true` requirement.
2. Mode transitions in BOTH directions, namespace changes and counter rollback must refuse without `confirmRunIdModeChange === true`, with **zero storage writes** before refusal. Confirm even truthy string/numeric values do not bypass opt-in. With explicit confirmation, source state equals actual imported state; pre-import rescue retains the old primary raw bytes.
3. `enableMonotonicRunIds` must require literal `backupConfirmed === true`; reject strings/numbers/objects/arrays. Confirmation is not evidence an export occurred.
4. Probe malformed `r2` pending ticket suffixes `01`, `1e0`, foreign legacy IDs and extra colon in namespace. Run attempted import cross-mode with pending run and a stale writer, test corruption and no partial state changes.
5. Evaluate two still-open risks: restoring older monotonic counters can reissue earlier run IDs and old source builds can quarantine opted-in new-format saves as if corrupt. Documentation must describe these candidly. **No changes to rewards, shop, League, old save compatibility, assets or Android.**
6. Run all Node source tests and strict TypeScript; verify push and PR CI SUCCESS at exact complete head and provide test counts. No ref drift before merge.

Report exact reviewed SHA/base, CI links/results, blockers/nonblockers, **APPROVE or REQUEST CHANGES** and explicit **MERGE YES or NO**. Do not modify the repository during independent review. No GitHub PR approval is claimed until this result is supplied.
