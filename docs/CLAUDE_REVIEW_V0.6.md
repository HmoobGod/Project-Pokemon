# Claude independent source-only review — v0.6

**Repo:** https://github.com/HmoobGod/Project-Pokemon
**Review PR:** #3 (after creation)
**Base:** main `04c476d7c1d115c6054a5afc40e7477a53ad7784` (merged PR #2)
**Head:** use the exact head shown by PR #3, and report its 40-character SHA.

Please independently evaluate the changes since v0.5, with emphasis on the issues in the original v0.5 review (`project-pokemon-v0.5-review.md`):

1. **V5-1**: Recovery quarantine must preserve newly invalid-but-readable save bytes, and not overwrite an existing distinct quarantine. Inspect quota failure, recovery with an invalid backup, and another session changing the primary.
2. **V5-2**: `abandonRun` removes tickets without crediting a run, Stardust, map victory, counters or achievements, never lets reused ticket IDs be credited, and frees capacity below 128.
3. **V5-3**: Imported pending tickets pointing at locked maps must be refused before mutation; no starter with map victory must fail.
4. Verify local `npm run test` (expected 70 tests), `npm run typecheck` and GitHub Actions at exact PR HEAD. Test that legitimate v0.5 saves and ongoing non-abandoned runs still work.
5. Investigate new blockers and remaining N18/N19. These are **pre-UI gates** and do not imply v0.6 source-only merge readiness depends on fully implementing a UI.
6. Check PR for copyrighted game resources, secrets, and executable untrusted source material.

Return **EXACT HEAD SHA, tests, detailed blocking/nonblocking findings, verdict (APPROVE / APPROVE WITH CONDITIONS / REQUEST CHANGES), and MERGE YES/NO** for a **source-only milestone**. Please do not modify the repository.
