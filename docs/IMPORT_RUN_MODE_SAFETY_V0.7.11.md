# v0.7.11 — Safe import state replacement and run-ID mode guards

**Source only; no playable client, import UI, mobile APK or original-game parity.** This fixes Claude PR #14 nonblocking findings N1, N4 and expands N5 tests. F3/F4 recovery user experience remains unresolved.

## Source changes

- `importSave(input,{replace:true})` now **replaces the entire parsed save state**, removing optional keys absent from the imported data, rather than merging them onto the target. The old `Object.assign` mutation left `runSequence` behind when importing a legacy save into an opted-in profile.
- If the imported run-ID mode differs (legacy vs monotonic), the namespace changes, or the stored `next` counter differs, import refuses **before any pre-import or profile write** unless `confirmRunIdModeChange:true` is explicitly supplied. A truthy string is not accepted. Existing `replace:true`, SHA-256 integrity, source-version/catalog checks, stale-writer checks and pre-import rescue protections remain.
- The option is **acknowledgment only**. It is not evidence of a physical backup, cannot authenticate locally editable saves and cannot prevent the caller from deliberately rolling a sequence counter backwards.
- `enableMonotonicRunIds` now requires `backupConfirmed === true` rather than a truthy value. Existing opted-in saves are not silently modified.
- Expanded tests cover legacy→monotonic and monotonic→legacy imports, namespace/counter changes, lack of state mutations upon refusals, preservation of the original pre-import slot after confirmed import, truthy strings/numbers, noncanonical `01`/`1e0` suffixes, namespace extra colon and foreign legacy pending IDs.

## Remaining release risks

- Existing run restores can roll back a monotonic `next` counter and issue previously used sequential IDs. A stale in-flight game ticket can accidentally match a new run ticket after restore. Any future UI MUST invalidate in-flight runs, discard obsolete tickets, and reopen the saved profile after import or restore. Namespace/generation rotation remains future design work.
- Old pre-v0.7.10 builds can classify the new optional `runSequence` as corrupt, quarantine it and restore a legacy backup because schema/sourceVersion didn't change. An authentic versioned migration and release gate are required before exposing the feature to players.
- Prior already-large `processedRuns` history is kept; future growth stops only after explicit opt-in. No F3/F4 export/confirmation UX, bundle import/rollback, Android game or real device tests.

## Independent review before merge

Exact-head GitHub push and PR CI must both pass all source tests and strict TypeScript. Independent Claude review should focus on the changed import path and new tests, rather than repeating a full historical audit.
