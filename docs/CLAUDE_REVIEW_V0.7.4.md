# CLAUDE — Independent exact-head review packet, Project Pokemon PR #8 (v0.7.4)

**SOURCE ONLY — NO PLAYABLE APK OR ANDROID DEVICE VALIDATION.**

- PR: https://github.com/HmoobGod/Project-Pokemon/pull/8
- **Merged main / exact required base:** `1ff42dc9e2591b8234e6de4888ef63aee59a6e39` (v0.7.3 PR #7; approved at `94a16c6102a3133eb01bc3f55164a532dde4fa22`; GitHub push and PR CI green, 92/92 source tests).
- Fetch `refs/pull/8/head` fresh; print the full current SHA and verify GitHub workflows match that **exact** head. Do NOT review or merge prior stale PR #8 head `21be9a98f0bd19b001ed1d044d2d65bb5743bd59`.
- Read `docs/RECOVERY_PREFLIGHT_V0.7.4.md`, `src/recovery-readiness.ts`, and `test/recovery-readiness.test.ts`; compare ONLY to the new merged main.

## Required independent checks

1. **Zero writes and no raw saved bytes in result.** Independently instrument a storage implementation: `assessRecoveryReadiness(storage,catalog)` must perform no `setItem` / `removeItem` and return only slot-health and restore-readiness flags, never raw profile strings, JSON, or embedded Pokémon values. Verify the API's storage type only exposes `getItem`.
2. Inspect actual Standard six-slot key mappings (including quarantine) against `StandardProgression` fields, with no other-edition reads or changes. Check malformed, missing, unknown-schema and future-schema data. Check thrown storage read errors propagate without mutations.
3. **F3 and F4 are *not fixed*.** The F3 failed primary write/retry and F4 pre-restore protected conflict tests describe **read-only previews of existing safeguards and blockers**, NOT repair of a data-loss bug, automatic conflict resolution, durable transactional guarantees, or user-facing undo/discard UX. Confirm README, PROGRESS, PR description, and tracker do not claim F3/F4 fixed.
4. Check preview-vs-live mutator parity: no misleading `ready` for cases live mutators would reject, no false positive safe retry when there is an unrecoverable stash, and no safety weakening. Look for stale tabs / A→B→A races; this remains non-atomic localStorage.
5. Confirm no earned-progression bypass, free Pokémon unlocks, extra shop items, economy/reward changes, profile wipes, import path or assets. These are synthetic source-only tests. The v0.7.3 raw-bundle exporter has no integrity validation or bundle import, and it should not be advertised as a restorable backup.
6. Run the full Node source test suite and strict `tsc` on exact `refs/pull/8/head` after fresh fetch, and inspect both **push and PR** CI statuses and hashes. The pre-rebase milestone was 99/99 tests; recount on the new exact head. Investigate any failure before recommending merge.
7. Review doc labels, package version/typecheck coverage, dependency history and no regressions from v0.7.3. Identify blockers separately from nonblocking suggestions.

## Deliverable

Return full **reviewed exact HEAD SHA**, exact base SHA and merge-base check, CI run links/results, observed test counts, raw-byte/mutation safety evidence, F3/F4 preview-not-fix finding, and **APPROVE or REQUEST CHANGES**, plus explicit **MERGE YES or NO**. Do not modify repository during independent review. ChatGPT will not merge PR #8 until it gets this review result and rechecks GitHub exact-head CI. Source-only; no APK exists.
