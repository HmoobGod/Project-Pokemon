# Claude independent review request — PR #9 (v0.7.5)

SOURCE ONLY. NO PLAYABLE APK / NO ORIGINAL-GAME OR ANDROID DEVICE TESTING.

## Exact review target
- Repo: https://github.com/HmoobGod/Project-Pokemon
- PR #9: https://github.com/HmoobGod/Project-Pokemon/pull/9
- Base: merged v0.7.4 main at `fbe0c34542ab589940977fe655845d51dfb45933`.
- Fetch `refs/pull/9/head` fresh and record the full exact head SHA. Confirm this base is the merge-base; never use an obsolete head or unmerged feature branch as the source of truth.

## Scope
The owner supplied `recovery-parity.test.ts.txt` with Claude's PR #8 review. The test has been added as `test/recovery-parity.test.ts` without changing the production source. Its differential matrix covers 3,125 combinations of the five restorable save slots (missing, three valid profiles, corrupted), across four restore methods (12,500 checks). It rejects a preview which says `ready`, `retry-with-preserved-pre-undo`, or `no-op` when a live mutator rejects the same stable storage state. It verifies preview writes zero data. The prior weak `Object.hasOwn(result,'raw')===false` assertion has been replaced by checking that the JSON-serialized preview contains none of the actual saved raw string values.

Review all test and documentation changes; **no production code changes** are intended.

## Required review checks
1. Execute all source tests and strict TypeScript typecheck at the exact PR head. Check push and pull_request CI at the same SHA and report links/results/test counts.
2. Verify the parity matrix actually runs the documented 3,125 scenarios / 12,500 comparisons and the no-raw assertion is substantive. Detect whether the test accidentally passes after unsafe code is introduced or has overlooked leakage channels. Verify no writes and no mutation by the preview.
3. Identify any false-safe scenarios, conservative mismatches, or blind spots, particularly quarantine recovery, invalid primary and multi-tab interference. Avoid overstating test coverage.
4. Verify original gameplay reward/unlock/shop rules and existing save formats are unchanged. No source bundles, secret data, APK or outside assets added.
5. **F3/F4 remain NOT FIXED** — these tests are evidence of read-only preflight safety, not implementation of recovery conflict resolution or Android UX. No schema migration, bundle-integrity/import, bounded processedRuns, or authentic gameplay integration is delivered.
6. Recommend APPROVE / REQUEST CHANGES, and explicit MERGE YES / NO, with reviewed exact head/base, CI evidence, blocking/nonblocking findings.

Independent review only; do not modify repository while reviewing.
