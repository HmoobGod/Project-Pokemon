# Claude independent exact-head review — Project Pokemon v0.7.3 (PR #7)

This is **source-only**. There is no licensed original client/assets, official reward parity, gameplay integration, Android APK, or device verification.

## Review target
- Repository: https://github.com/HmoobGod/Project-Pokemon
- PR: https://github.com/HmoobGod/Project-Pokemon/pull/7
- **Required base:** merged v0.7.2 main `7331f4efbfa932c398b57b5024a318aad661f374` (PR #6, Claude APPROVE / MERGE YES).
- Fetch `refs/pull/7/head` fresh and report the complete exact head SHA. Do not reuse the old pre-rebase SHA `aafe4e4ae6c5d5f842c2a5c3c6334ed4cf970be7`.
- Compare only changes relative to the merged v0.7.2 main commit and ensure no v0.7.2 regression.

## Review checklist
1. Audit `src/recovery-bundle.ts` and `test/recovery-bundle.test.ts`: all six Standard profile slots (primary, backup, preImport, preRestore, preUndo, quarantine) must export as exact raw strings or null, **including corrupt JSON, unknown schema, whitespace, empty raw bytes**. No accidental mutation or normalization.
2. Probe the two-pass snapshot read: on a detected change it must fail closed, but do NOT claim atomicity against unobserved multi-tab changes. Check storage read exceptions and that a read error cannot trigger writes.
3. Review the strict parser: reject malformed JSON, wrong kind/schema, missing or unknown slots, and non-string/non-null values. The parser must not import, restore, clear, or validate authentic gameplay.
4. Confirm code does not read/write another edition's keys, bypass original earning/unlocks, award Stardust, alter purchases, or discard old saves. `README.md` and `docs/PROGRESS.md` must not call this a playable release.
5. Run the exact-head full Node source test suite and strict TypeScript check; verify GitHub push and PR CI conclusively succeeded at the **same current HEAD**. Read test logs (expected previous milestone 92/92; recount after rebase).
6. Verify PR #8 remains a separate, unmerged draft stacked on this branch. Its F3/F4 read-only preflight is NOT an F3/F4 fix, and PR #8 must not be merged/rebased until PR #7 merges.

## Deliverable
Return reviewed full SHA, base SHA, exact CI links and conclusions, blockers and non-blocking suggestions, plus **APPROVE / REQUEST CHANGES** and explicit **MERGE YES / NO**. No code modifications during independent review. Merge only after a green exact-head CI and review approval.
