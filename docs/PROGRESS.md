# Project Pokemon — Development Progress

**Last local verified source milestone:** v0.4, October 30, 2026 (America/Chicago).  
**Target:** fully offline Android game preserving earned progression, not unlock-all.

```text
OVERALL APK          ███░░░░░░░░░░░░░░░░░  14%  rough estimate
Source + CI         ████████████░░░░░░░░  60%  local tests pass; exact-head CI pending
Progression logic   █████████░░░░░░░░░░░  45%  synthetic and source-only
Client rule audit   ██████░░░░░░░░░░░░░░  30%  client metadata, not server validation
Playable integration░░░░░░░░░░░░░░░░░░░░   0%
Android APK         ░░░░░░░░░░░░░░░░░░░░   0%
Phone/device tests  ░░░░░░░░░░░░░░░░░░░░   0%
Content permissions ░░░░░░░░░░░░░░░░░░░░   0%
```

## Verified local milestones

- v0.4: **36/36 local automated tests** and strict TypeScript pass.
- Manual export/import format: tagged, pinned-version JSON with SHA-256 integrity check; overwrite requires explicit opt-in.
- Validated imported item/upgrade/counter/roster IDs; stale writer detection and storage-write failure protections.
- v0.3: audited 40 client League character definitions (including four compound objectives). No actual unlock entitlement granted.
- v0.2: catalog observations: 3 starters, 24 Lab upgrades, 59 shop entries, 71 achievements; asset entries inventoried separately.
- All original game resources are excluded from this public repository.

## Remaining blockers

1. **GitHub Actions** must complete successfully on the exact current PR head before merge. Earlier commits were successful; that does not certify later code.
2. Original server Stardust formulas, unlock entitlement/claim logic and maps/modes must be verified rather than guessed.
3. No original game integration, Android build, device tests, or APK yet.
4. No permission confirmed for redistributing Charcher's client or third-party Pokémon assets.

## Next steps

- Obtain exact-head GitHub CI pass and merge PR #1 when green.
- Audit original server-visible reward and profile contracts; leave unknown rules inactive.
- Create authorized client adapter; validate starter → run → earned Stardust → purchase → save/reload.
- Integrate import/export UI and isolate Standard Android package identity, then build and test APK when rights allow.

**All percentages are subjective engineering estimates; update them as real gates pass.**
