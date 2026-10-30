# Claude delta review request — Project Pokemon v0.4.2

**Earlier independently reviewed:** `0ea9a3f1ad0277828b5183c5c8a210c96d231653` (v0.4.1, REQUEST CHANGES).

Review the new HEAD after it is pushed. Focus on:

1. B3 double-restore and restore-then-action: can any new `restoreBackup()` or `restorePreImport()` overwrite the protected `prerestore.v1` snapshot? Verify target-equals-current is a zero-write no-op.
2. Can `restorePreRestore()` safely undo and then permit another restore? Does `clearPreRestoreBackup()` require explicit invocation?
3. N12: readable future-schema JSON with the same sourceVersion must refuse recovery, preserving primary and backup.
4. Re-run all tests, typecheck, probe stash failure and stale-writer guards. Look for new regressions or data-loss paths.
5. Report exact reviewed SHA, PASS/FAIL tests, findings with reproductions, final **APPROVE / APPROVE WITH CONDITIONS / REQUEST CHANGES**, and **MERGE YES/NO** for the source-only project.

GitHub CI for the new exact head must be checked separately; do not infer it from earlier commits. Do not modify the repository.
