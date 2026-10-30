# Claude independent delta-review — v0.7.1

Compare new PR branch against merged v0.7 `main` and inspect its **exact HEAD SHA**.

1. **F1:** Confirm the static `clearQuarantine(storage,expectedRaw,expectedPrimary)` is usable when primary is corrupt, does not clear the wrong snapshot, and leaves both storage editions isolated. Reproduce double-corruption deadlock from v0.7.
2. **F2:** Concurrently recover the same corrupted primary twice, interleaving after tab A's quarantine write. Ensure tab A never deletes tab B's only rescue copy.
3. Check errors, stale-writer behavior, quota failures and whether a new data-loss or hidden overwrite scenario exists.
4. Run all repository tests (v0.7 baseline 79 + 5 new), TypeScript typecheck, and verify exact-head CI.
5. Flag blocking and nonblocking findings, including whether F3/F4 must be fixed before UI work.
6. Return **reviewed exact HEAD SHA**, verdict (APPROVE / APPROVE WITH CONDITIONS / REQUEST CHANGES), and explicit **MERGE YES/NO**.

No original game client or copyrighted asset files may be bundled. Do not modify the repo.
