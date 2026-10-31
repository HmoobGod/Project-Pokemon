# v0.7.10 — Opt-in monotonic run ticket IDs (source-only candidate)

**No APK or upstream client integration.** This opt-in strategy stops **future growth** of `processedRuns`; it deliberately does **not** delete, truncate or compress any historical ID. F3/F4 user-facing recovery issues remain open.

## Motivation and safety boundary

Legacy schema-1 Standard saves persist each consumed run ID forever in `processedRuns` to reject accidental replay, including abandoned runs. Truncating that list would allow a historical ID to be generated again. No fixed-size exact deduplication structure can represent an unbounded set of arbitrary old IDs without compromises. Therefore this change **does not erase the legacy history**.

New optional `runSequence: {namespace, next}` is absent in old saves; schema remains 1. `enableMonotonicRunIds({backupConfirmed:true})` explicitly activates it, only after choosing a starter and finishing/abandoning all pending legacy tickets. The caller must first export and safely retain an independent save backup: `backupConfirmed` is only a caller acknowledgment, **not cryptographic proof**. No UI invokes this in the repository.

- The namespace seed comes from the existing injected ID factory (default crypto.randomUUID), restricted to 1–128 ASCII letters/digits/`_`/`-`. Namespace format `r2:<seed>:` is rejected if any historical processed ID begins with it.
- Each new ticket ID is exactly `<namespace><next>`; `next` increments and persists **when the ticket is created**, never after an award. Completing or abandoning that ticket removes it from pending **without appending to `processedRuns`**, as the consumed sequence number can never be minted again.
- Pending monotonic IDs are validated as canonical decimal suffixes strictly lower than persisted `next`; malformed metadata and reuse of a legacy namespace refuse loading. Rejected or stale writes preserve the existing profile. Reopening preserves `next`, and a counter at `Number.MAX_SAFE_INTEGER` refuses new tickets without silently wrapping.
- Existing saves without `runSequence` retain their prior semantics and replay checks. Previously processed legacy IDs remain byte-for-byte in the list; it **does not reduce already-large lists**. The optional migration changes primary save JSON, and an older source build that rejects extra fields cannot read it. Retain a backup before explicit opt-in.

## Still open

This is a reversible development checkpoint, not a general compact/archival import UI, no clean automatic downgrade, no protection against deliberate manual rollback/import of older saves, and no transactional browser storage. If a fully compact v2 profile is ever desired, it needs an explicit reviewed migration and verified rollback/export flow. The prototype does not authenticate local save edits, and the original PokéBonk game rules, assets and device behavior are not verified.

## Testing and release gate

`test/monotonic-run-ids.test.ts` covers opt-in confirmation, retained legacy replay IDs, normal and abandoned new tickets, reload, pending migration refusal, seed collisions, malformed metadata, counter exhaustion and stale-instance guard. Claude v0.7.9 N1 test fix also checks all six emergency recovery slots including real NUL, genuine lone surrogate and missing-vs-empty data. Exact-head CI and Claude independent review required before merge.

**F3/F4 NOT FIXED; no import/consent UX, no APK; overall estimate ~14%.**
