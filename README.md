# Project Pokemon — offline progression research

A **source-only, experimental** Android game-port research project targeting an *earned-progression* experience. The immediate milestone is a tested, isolated local progression core. **There is no playable APK here yet.**

## Current milestone: v0.6 (source-only review candidate)

- v0.5 approved by Claude and merged as main `04c476d7c1d115c6054a5afc40e7477a53ad7784` after successful exact-head CI.
- Recovery now quarantines newly invalid-but-readable raw profiles before falling back to a verified backup, rather than erasing old data.
- Added `abandonRun()` to free run slots **without rewards**; save validation now rejects pending tickets for locked maps and map victories before choosing a starter.
- **70/70 local automated tests** and strict TypeScript pass on Node 22.16.0 / tsc 5.8.3; independent review and exact-head CI still required.
- [v0.6 changes and limitations](docs/RECOVERY_AND_RUN_LIFECYCLE_V0.6.md) · [Claude review request](docs/CLAUDE_REVIEW_V0.6.md).

## Prior milestone: v0.5 (merged source prototype)

- Added cycle-checked map prerequisite chains and stricter imported map victory validation.
- Defensive bound of 128 pending run tickets and strict serialized ticket field checks.
- Forward run mode to reward policy without guessing original-game rewards.
- [v0.5 guard details](docs/PROGRESSION_GUARDS_V0.5.md) · [Claude review request](docs/CLAUDE_REVIEW_V0.5.md).

## Previous milestone: v0.4.2 (source-only recovery hotfix)

- New save data starts with zero Stardust; starters are selected normally.
- Earned rewards, Lab/item purchases, achievement claims, and backup recovery are implemented and tested **with synthetic fixtures**.
- A version-locked extractor reads client catalog metadata from a separately obtained, authorized upstream snapshot. It does **not** fetch or bundle the original game resources.
- The original game's real server reward rules, unlock logic, UI integration, and Android runtime are **not implemented**.

**Docs:** [v0.2 research/verification notes](docs/PROGRESSION_V0.2.md) · [Integration plan](docs/INTEGRATION.md) · [Version-pinned observed catalog](evidence/verified-client-catalog-v0.8.80.json)

## v0.3 milestones

- Client League objectives can be audited without unlocking characters; compound conditions and ambiguous counters are explicitly flagged.
- Per-run best counters now use an opt-in maximum rule rather than blindly adding across runs.
- [v0.3 League research](docs/LEAGUE_V0.3.md).

## v0.4 milestone — save safeguards

- Explicit manual JSON save export/import with version and edition tagging and SHA-256 integrity checking (not anti-cheat protection).
- Import requires an explicit overwrite option, validates catalog ownership, Lab levels and counters, and retains a recovery slot.
- Best-effort stale-session write guard rejects detected second-session conflicts. It is not a transactional database.
- **70/70 local tests** and strict TypeScript checks pass on the v0.6 source branch; v0.5 was approved and merged.
- [Save integrity research](docs/SAVE_INTEGRITY_V0.4.md) · [Progress dashboard](docs/PROGRESS.md).
- [Claude independent v0.4 review](docs/CLAUDE_REVIEW_REQUEST_V0.4.md) returned **REQUEST CHANGES** (B1/B2).
- **v0.4.1:** Fixed both recovery data-loss blockers with durable pre-import and pre-restore slots. [Fix documentation](docs/RECOVERY_FIXES_V0.4.1.md) · [Claude delta review request](docs/CLAUDE_DELTA_REVIEW_V0.4.1.md). v0.4.1 was superseded by the reviewed and merged v0.4.2 fix.

## v0.4.2 recovery safety patch

- Claude independently confirmed B1/B2 fixed but identified **B3: repeat restores overwrite pre-restore undo**.
- Repeating a restore to the already-active save now performs **zero writes**; a different restore is refused if it would destroy a protected undo. Explicit clearing is required.
- **N12:** future-schema saved progress cannot be mistaken for a corrupted current-version save.
- [v0.4.2 repair evidence](docs/RECOVERY_FIXES_V0.4.2.md) · [Claude delta re-review instructions](docs/CLAUDE_DELTA_REVIEW_V0.4.2.md).
- Claude approved v0.4.2 and PR #1 was merged to `main` as `5d97798c84147aacc4e32e66ebd691d9179bd0b9`.

## Develop / verify

Requires Node.js 22.16+ and TypeScript 5.8.3 (or install via `npm install --global typescript@5.8.3`).

```bash
npm run test
npm run typecheck
```

GitHub Actions runs the same source-only tests on pushes and pull requests. It is **not** an APK build workflow.

## Original content and intellectual property

This repository contains only original development code, synthetic test fixtures, factual catalog observations, and planning notes. It intentionally does **not** include the original PokéBonk client, Pokémon graphics, models, sound, account data, or any game asset bundles.

Game code and assets from Charcher/Pokémon have separate owners and license terms. Their being accessible on a website or another repository is **not** authorization to redistribute them. Permission and rights review remain required before packaging/distributing protected content. The tools here do not bypass logins or download restricted material.

This project is unofficial and has no affiliation with the PokéBonk creator or Pokémon rights holders.
