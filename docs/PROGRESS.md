# Development progress — Project Pokemon

**Updated:** 2026-10-30 (America/Chicago)  
**Release target:** standalone Android app with earned progression (not unlock-all)  
**Evidence baseline:** PR #1, v0.2 source branch `setup/offline-progression-v0.2`

> All percentages below are **rough engineering estimates** for the full playable APK, **not** automated test coverage or verified feature-completion measurements. Re-estimate as requirements and testing change.

## Completion dashboard

```text
OVERALL             ██░░░░░░░░░░░░░░░░░░  10% (estimate)
Source / CI         ███████████░░░░░░░░░  55% (estimate)
Progression engine  ██████░░░░░░░░░░░░░░  30% (estimate)
Original rules      ████░░░░░░░░░░░░░░░░  20% (estimate)
Gameplay connected  ░░░░░░░░░░░░░░░░░░░░   0%
Android app build   ░░░░░░░░░░░░░░░░░░░░   0%
Device validation   ░░░░░░░░░░░░░░░░░░░░   0%
Rights clearance   ░░░░░░░░░░░░░░░░░░░░   0%
```

**Asset inventory (separate research finding):** 755/755 expected entries across five Kanto resource families appeared in the separately inspected community builder snapshot for upstream v0.8.80 (151 regular animation sheets, shiny sheets, portraits, icons, and cries). This is **inventory observation only**: not independent content integrity validation, proof of usage permission, or assets included in this repo. It is intentionally **not counted as an APK-complete milestone**.

## Verified milestones

- [x] Public GitHub repository created.
- [x] v0.2 prototype code and synthetic test fixtures committed in PR #1.
- [x] 17/17 local progression and catalog tests reported passing in the v0.2 development session.
- [x] Local strict TypeScript check reported passing before upload.
- [x] Source-only GitHub Actions workflow committed.
- [ ] **GitHub CI green on latest PR head:** queued as of this update; do not mark complete based on local tests alone.
- [ ] Original server run Stardust calculations and safety rules verified.
- [ ] Genuine League unlock requirements and claims replicated.
- [ ] Progression integrated with actual game client under appropriate permissions.
- [ ] Playable Android APK successfully assembled.
- [ ] Offline device test, complete progression loop, and safe upgrade/install validated.
- [ ] Rights and redistribution permissions for any original client/assets resolved.

## Current blockers and priority order

1. **CI gate:** verify exact-head source tests; merge only after successful checks.
2. **Economy/entitlements:** measure or obtain authoritative reward formulas, achievement eligibility, and League character unlock validation. Client catalogs do not establish server semantics.
3. **Licensing:** acquire rights to package original-game assets and code or replace with appropriately licensed/original components.
4. **Integration:** build a testable starter → run → Stardust → upgrade → save/reload gameplay loop.
5. **Android:** only then wire the Android shell, build an APK, and run device tests.

## Reporting convention (for future updates)

Every future development status should show **one overall estimated completion bar**, **smaller category milestone bars**, the **latest verified milestone**, **current blockers**, and **next priorities**. Update estimates dynamically, and always distinguish prototype/source tests from playable APK and physical Android testing.

**Status:** source-only proof of concept; no playable APK or Android device certification yet.
