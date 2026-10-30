# Project Pokemon — offline progression research

A **source-only, experimental** Android game-port research project targeting an *earned-progression* experience. The immediate milestone is a tested, isolated local progression core. **There is no playable APK here yet.**

## Current milestone: v0.4.1 (source-only recovery hotfix)

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
- **44/44 local tests** and strict TypeScript checks pass on CI-pinned local tool versions; GitHub Actions verification for the new hotfix head is pending.
- [Save integrity research](docs/SAVE_INTEGRITY_V0.4.md) · [Progress dashboard](docs/PROGRESS.md).
- [Claude independent v0.4 review](docs/CLAUDE_REVIEW_REQUEST_V0.4.md) returned **REQUEST CHANGES** (B1/B2).
- **v0.4.1:** Fixed both recovery data-loss blockers with durable pre-import and pre-restore slots. [Fix documentation](docs/RECOVERY_FIXES_V0.4.1.md) · [Claude delta review request](docs/CLAUDE_DELTA_REVIEW_V0.4.1.md). Merge still gated on new exact-head CI and a fresh Claude review.

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
