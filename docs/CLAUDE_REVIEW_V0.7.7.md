# Claude — independent exact-head review, Project Pokemon v0.7.7 PR #11

**Source-only; no APK.** Fetch `refs/pull/11/head` fresh and record full SHA. Compare to merged v0.7.6 main base `9659ec7b61631c7635658fa89e8ecba35e6c8448` and verify merge-base exactly equals base.

## Review scope

- `src/corrupt-primary-readiness.ts` is a read-only status assessment for the **existing** `StandardProgression.recoverCorruptPrimary()` static mutator; it must not write, remove, import, restore, award or leak raw save bytes. Only `getItem` is in its storage type.
- `test/corrupt-primary-readiness.test.ts` tests distinct malformed, valid, missing, future-schema and mismatched-source primary states; backup health and the empty/matching/conflicting quarantine states. It checks parity against the live recovery method on cloned stable storage, including 60 matrix combinations, zero preview writes, observed races and thrown read errors.
- Read `docs/CORRUPT_PRIMARY_PREFLIGHT_V0.7.7.md`. F3/F4 are still NOT FIXED, nor is there destructive UI or user consent/export confirmation.

## Required adversarial probes

1. Compare the preview's blocking priority with the static live mutator, especially schema/version mismatch **even if backup is good**, healthy primary refusal, backup corruption, occupied different quarantine, matching quarantine reuse, and **missing primary with an old occupied quarantine**.
2. Confirm exact keyset and enum-only output, no raw bytes or derived identifiers exposed; Standard-only keys, other-edition isolation, zero writes. Quarantine must never be silently cleared by preview.
3. Assert no false-safe status for stable storage in a broader independently built matrix, and record any over-conservative cases separately. Check protected data is preserved when a recoverable primary is corrupt and primary writes fail; note non-atomic races and quota failures are NOT guaranteed by preview.
4. Independently run all Node source tests and strict TS at the exact head. Verify **both push and PR GitHub CI** at identical head; provide counts and links.
5. Confirm no changes to authentic earning/unlocks/rewards/save formats and no imported copyrighted game assets. This remains a synthetic source-only prototype.

Return exact reviewed SHA/base/merge-base, test count, CI links/results, blocking/nonblocking findings, **APPROVE or REQUEST CHANGES**, and explicit **MERGE YES or NO**. Do not modify the repo during review.
