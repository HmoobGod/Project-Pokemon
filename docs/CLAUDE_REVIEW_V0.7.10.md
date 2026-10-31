# Claude focused exact-head review — PR #14, v0.7.10

**Base:** latest merged v0.7.9 main `42f25ab1589280f9714675541271c7590fdc831d`. **Fetch actual `refs/pull/14/head` fresh** and report exact complete SHA and merge-base. Source-only; not an APK.

## Review the changed code and relevant legacy functions only

1. `src/progression.ts` — new optional `SaveState.runSequence`, explicit `enableMonotonicRunIds({backupConfirmed:true})`, and monotonic ID issuing on `beginRun`. The counter is committed **at ticket creation**, so finishing or abandoning never consumes an already issued value again. Under monotonic mode `finishRun` and `abandonRun` leave the legacy `processedRuns` array unchanged. Old legacy IDs are never truncated, and old saves without the new field retain their existing behavior.
2. `test/monotonic-run-ids.test.ts` — verify after multiple runs and reloads that the counter rises while processedRuns never grows, and no duplicate credit or reused abandoned ID is accepted. Test seed collision against old IDs, pending-run opt-in refusal, old-run replay defense, stale writer, counter exhaustion, backup confirmation, malformed namespace and counter validation.
3. Parse/migration/adversarial probes: malformed pending ticket with suffix >= persisted counter, noncanonical suffix, duplicate pending, malformed namespace, old processed ID with matching prefix, counter wrap, intentionally rolled-back save. Be clear about limits: rollback/import of old snapshots can reissue IDs; local save edits are not authenticated. This source prototype must **not** claim guaranteed replay protection against malicious tampering.
4. Crucial compatibility: old save states remain readable in v0.7.10; migrated states may be unreadable by pre-v0.7.10 software. The opt-in call does not actually prove a user exported a backup, only requires a `backupConfirmed` acknowledgment. There is no player UI, automatic upgrade or actual deletion of legacy history. Demand clear docs.
5. Claude PR #13 N1 test correction in `test/recovery-bundle-integrity.test.ts`: all **six** slots compared; real NUL and real lone surrogate in PRESENT slots; `preUndo` missing as null and backup present as empty string. Verify fault injection catches alteration of preImport and preRestore, not just the original four slots.
6. Independently run full source Node tests and strict TypeScript at the exact head; verify exact-head push and PR CI. Confirm no enemy/gameplay client, reward formula, purchased unlocks, content assets or Android APK added.

**Potential key design issue:** A schema-1 optional field is not backward-readable by old builds, and the migration retains legacy history rather than truly bounding already-oversized lists. Return a blocking finding if the implementation makes a false compatibility or full-size bound claim.

Return exact HEAD/base/merge-base, CI results/test counts, blocking/nonblocking findings, **APPROVE or REQUEST CHANGES**, explicit **MERGE YES or NO**. Do not modify the repo during independent review. F3/F4 remain NOT FIXED.
