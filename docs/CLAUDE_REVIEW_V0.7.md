# Claude independent review request — v0.7

Review PR #4 at its **exact SHA** (read the live branch head; do not assume this document states the current SHA). Compare against merged v0.6 main.

Required checks:
1. N18: `restorePreRestore` after additional gameplay preserves current progress in `preUndoKey`, and `restorePreUndo` can recover it without losing the prior restore target.
2. Double undo is a true no-op. Repeated restore/undo with mismatched preserved slots refuses to overwrite newer data.
3. Stale-writer and quota failure behavior: failed stash does not change primary. Verify failure after stash does not destroy previous target.
4. Quarantine clear matches exact raw bytes, refuses stale writer, and does not touch Unlocked edition storage.
5. Recovery race: another tab's change is never overwritten by this operation, and a newly created stale quarantine is cleaned up where safe.
6. Run full tests and strict TypeScript typecheck. Identify any tests missing, copyright/secret regressions, and ways snapshot slots could be overwritten.
7. Return **exact HEAD SHA**, findings (blocking/nonblocking), tests, final verdict, and explicit **MERGE YES/NO**.

No gameplay or APK is present. Do not modify the repo.
