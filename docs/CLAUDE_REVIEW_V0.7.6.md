# PR #10 v0.7.6 — Exact-head independent review

**Source-only tests, no APK or production source changes.**

- Base: merged v0.7.5 main `83f6f298d025ea12d5239eebaeb62ab4693e6da8`.
- PR: https://github.com/HmoobGod/Project-Pokemon/pull/10
- Fetch `refs/pull/10/head` fresh; report exact full SHA and merge-base. Never reuse prior pre-review heads.
- Review `test/recovery-parity.test.ts` and compare to the merged baseline `test/recovery-parity.test.ts`.

## Specific audit
1. Validate every preflight result has exactly `slots` and `restores`, each containing only the expected six/four keys and only predefined enum values. Verify a leaked length, count, digest, prefix, raw string or unexpected nested object cannot pass.
2. In all 3,125 five-slot combinations and 12,500 restore actions, verify the preview never reports safe when live restoration refuses; additionally verify that blocked-when-live-succeeds mismatches occur only with **missing primary and missing backup**, and that their fixture count remains **225**. Look for a false test assumption when normal new-profile initialization occurs.
3. No writes from the preview, no external edition keys, no raw save leaks, no reward/unlock bypasses. Note quarantine, multi-tab races and quota failures are NOT covered by this synthetic matrix.
4. Run full source tests and strict TypeScript on the exact head. Check push and PR GitHub Actions runs at same complete SHA. Clearly distinguish the 100-test Node suite from the 12,500 internal parity assertions.
5. **F3/F4 still NOT FIXED**. No player-facing conflict resolution, export consent UX, data migrations, gameplay integration or Android APK.

Return blockers/nonblocking findings, exact head and base SHAs, test count, CI links and explicit **APPROVE / REQUEST CHANGES** plus **MERGE YES / NO**. Do not modify the repo as part of independent review.
