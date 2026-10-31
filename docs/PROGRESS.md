# Project Pokemon — development progress

**As of:** October 30, 2026 · v0.7 source candidate

```text
Overall APK          ███░░░░░░░░░░░░░░░░░  14% (estimate)
Source & CI          █████████████░░░░░░░  65% (candidate awaiting review)
Progression engine   ███████████░░░░░░░░░  55% (synthetic test core)
Client rules         ██████░░░░░░░░░░░░░░  30% (client metadata only)
Gameplay integration ░░░░░░░░░░░░░░░░░░░░   0%
Android APK          ░░░░░░░░░░░░░░░░░░░░   0%
Device testing       ░░░░░░░░░░░░░░░░░░░░   0%
Permissions          ░░░░░░░░░░░░░░░░░░░░   0%
```

## Latest
- v0.6: Claude approved with conditions and PR #3 was squash-merged to main at `8f03b2555f71f3ef9ac58f8c4d7536b676e8ae3f` after both exact-head CI runs passed. 70 local tests passed.
- v0.7 candidate: durable pre-undo progress, reversible `restorePreUndo()`, guarded quarantine clear and concurrent recovery cleanup. Nine additional source tests target these changes.
- Merge remains gated by exact-head CI and an independent Claude review.

## Open pre-UI issues
- Design real migration/discard/export for incompatible source versions and schemas.
- Manage unbounded `processedRuns` without ever reusing run IDs.
- Clarify all user-facing restoration/discard confirmations and storage quota handling.
- Validate original server rewards, League entitlements, original client and content permissions.

No playable Android APK exists. These are engineering estimates, not measured functional completion.

## v0.7.1 hotfix candidate — October 30, 2026

- v0.7 PR #4 passed 79/79 CI tests and was independently approved by Claude, then squash-merged to main at `a7a5d3fc122108671843cf69d184d4e693df10b4`.
- Claude F1/F2 from v0.7: add static quarantine clear reachable during corrupt primary and stop race cleanup deleting the only copy of rejected bytes.
- Five new regression tests; new exact-head CI and independent Claude delta review required before merge.
- F3/F4 recovery UX, processed-run growth and migration remain pre-UI blockers.
- Overall APK estimate **14%**; no playable Android integration has been completed.


## v0.7.2 missing-primary recovery race fix (October 30, 2026)
- Claude APPROVE WITH CONDITIONS for v0.7.1 and PR #5 merged at `328eab8bd9dfc4f5d89261ffcacbd9c4b86dc277` (84/84 CI tests).
- Fix N1: avoid overwriting newer primary when initial primary was missing and another tab saves during recovery.
- Four new tests; exact-head GitHub CI and Claude delta review required before merge.
- No increase to overall 14% estimated APK progress; no playable UI/Android implementation.

## v0.7.3 stacked read-only emergency export candidate — October 30, 2026
- v0.7.2 PR #6 merged at `7331f4efbfa932c398b57b5024a318aad661f374`; v0.7.3 PR #7 independently Claude-approved and merged at `1ff42dc9e2591b8234e6de4888ef63aee59a6e39` (92/92 tests, strict typecheck).
- Add raw export/structural validation for six recovery slots, including incompatible/corrupt bytes, without mutating any saved gameplay state.
- v0.7.3 source CI and independent Claude review passed, with 92/92 tests and strict typecheck.
- Overall APK estimate remains 14%; gameplay/Android/device tests still 0%.

## v0.7.4 read-only recovery preflight candidate — October 30, 2026
- New PR #8 is rebased directly on merged v0.7.3 main `1ff42dc9e2591b8234e6de4888ef63aee59a6e39`. PR #8 passed independent Claude APPROVE / MERGE YES at head `21b39210b4c485804b6161d70fbba94fda2e89e7` and merged at `fbe0c34542ab589940977fe655845d51dfb45933`. F3/F4 are still NOT fixed.
- Read-only Standard slot health and action preview: no write, read-only inspection, no raw save bytes returned. Actual restore/clear/import remains unchanged.
- F3 failed-undo retry and F4 blocked redo tests demonstrate **preflight recognition only**. They do NOT fix F3 or F4; no user-facing resolution UX exists.
- No original client/assets, official reward parity, Android APK, on-device gameplay or migration completed. Estimated overall APK progress remains 14%.

## v0.7.5 recovery-parity regression candidate — October 30, 2026
- Base: merged v0.7.4 main `fbe0c34542ab589940977fe655845d51dfb45933`.
- Add attached Claude differential test covering 3,125 storage combinations and 12,500 restore preview/action comparisons. A safe preview must not be refused by the corresponding live mutator on stable storage.
- Replace weak `Object.hasOwn(result,'raw')` check with serialized result scan for actual saved bytes, and verify result's top-level shape.
- No change to runtime progression / restoration, no recovery import, no UI, no APK or gameplay/device tests. F3 and F4 remain open; overall estimated APK completion stays 14%.

## v0.7.6 merged and v0.7.7 source-only candidate — October 30, 2026
- v0.7.5 PR #9 and v0.7.6 PR #10 both independently Claude approved and merged. Latest verified merged main at creation: `9659ec7b61631c7635658fa89e8ecba35e6c8448`.
- v0.7.7 candidate: add non-mutating preflight for `recoverCorruptPrimary`, explicitly distinguishing future-schema/source-version data and backup/quarantine state. Compare against real static recovery on stable cloned slots. Include observed-race and read-error failure probes.
- Recovery previews do not grant consent, overwrite profiles, handle simultaneous tabs atomically, or fix F3/F4. Independent exact-head CI and Claude review required before merge.
- Progress estimate unchanged: overall APK ~14%; original gameplay, Android build and device tests remain unverified or 0%.
