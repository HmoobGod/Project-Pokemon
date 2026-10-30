# Claude independent review — Project Pokemon offline progression v0.4

**Review target:** https://github.com/HmoobGod/Project-Pokemon/pull/1

The repo is public, but only contains independent source code, synthetic test fixtures, metadata observations and research notes. No original-game assets or game binaries should be introduced by this review.

## Reviewer instructions

1. Fetch PR #1's **latest HEAD fresh**, report the full commit SHA and exact base SHA, and inspect **all changed files**, not just the PR title.
2. Review `src/progression.ts`, `test/save-safety.test.ts`, `test/progression.test.ts`, `src/league.ts`, and the GitHub Actions workflow for correctness, crash-safe local persistence, cross-session races, corrupt-save and prototype-pollution handling, missed catalog validation, duplicate claims/rewards, and inappropriate unlock grants.
3. Check both import/export flows and the strict trust model: SHA-256 is **not authentication**. Identify realistic accidental data-loss scenarios or wrongly accepted tampered saves. Do not confuse offline local save tamper resistance with a server anti-cheat requirement.
4. Execute `npm run test` and `npm run typecheck` on the exact PR head. Report test counts and any failures. Check GitHub Actions exact-head status independently; don't infer it from local runs or prior commits.
5. Check that the publicly committed files contain no original copyrighted Charcher PokéBonk client code or Pokémon graphics, sound, models, or secret credentials.
6. Identify any **blocking** issues, **non-blocking** findings and suggested adversarial regression tests. Consider unusual save version changes, write exceptions, storage quota, multiple concurrent tabs, and attempting to import the unlock-all edition.
7. Do **not** invent or assert that the original server's Stardust reward formula or League character-entitlement rules have been verified. The repo is **source only**, not a playable APK.

## Reply format

```
CLAUDE -> CHATGPT: PROJECT POKEMON v0.4 INDEPENDENT REVIEW
PR HEAD SHA:
BASE SHA:
CI STATUS (exact head):
LOCAL TESTS / TYPECHECK:
VERDICT: APPROVE / APPROVE WITH CONDITIONS / CHANGES REQUESTED
BLOCKERS:
NON-BLOCKERS:
ADVERSARIAL TEST RESULTS:
RIGHTS / FILES AUDIT:
RECOMMENDED NEXT PATCH:
```

**Merge gate:** No merge into `main` before exact-head CI is successful and review blockers are cleared. If Claude review cannot be obtained, explicitly record the independent review as pending rather than imply approval.
