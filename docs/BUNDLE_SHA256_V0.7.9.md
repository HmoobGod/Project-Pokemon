# v0.7.9 — Checksummed raw emergency recovery export (source only)

This release candidate **does not import, recover, clear, overwrite, grant, spend or change saved-game bytes**. No official PokéBonk client/assets, playable APK or Android device tests exist.

## Existing format is preserved

`exportRawRecoveryBundle` and `parseRawRecoveryBundle` (v0.7.3) keep their earlier unchecksummed wire format and read-only behavior. The new `src/recovery-bundle-integrity.ts` adds `exportChecksummedRecoveryBundle(storage)` and `parseChecksummedRecoveryBundle(text)`. **No existing save format or recovery mutator is changed.**

New envelope:
```json
{
  "kind": "project-pokemon.standard.raw-recovery.sha256",
  "schema": 1,
  "sha256": "<lowercase 64-digit hex SHA-256>",
  "payload": "<the exact serialized v0.7.3 raw recovery bundle JSON>"
}
```

SHA-256 is computed over the UTF-8 encoded payload string. Verification checks the hash and then validates the raw bundle's six-slot structural schema. It rejects missing/extra envelope fields, wrong versions, invalid digests, broken payload structures and altered payload bytes. This is **integrity detection, not authentication or tamper-proof signing**: someone with write access can calculate a new hash. No UI should offer bundle import until explicit consent and safe rollback paths exist.

## Safety behavior

- The exporter reads only the six Standard storage keys. It retains exact slot text, including corrupt data and incompatible future versions; absent `null` is distinct from the present empty string.
- The original two-pass raw snapshot catches observed changes. After the async digest, a third six-key pass detects any **observed** mutation while hashing. Browser `localStorage` is not atomic: later writes and ABA changes are not guaranteed to be detected.
- The parser requires no StorageLike, never mutates any saved state and does not validate upstream game rules.
- All preview and recovery constraints remain in place. Existing `F3/F4` conflict recovery UX remains **NOT FIXED**; import, versioned migration and bounded `processedRuns` remain future work.
- PR #12 Claude N1/N2 test-only follow-up is bundled here: dual-invalid primary `schema:2` plus future `sourceVersion` (schema refusal takes precedence), and unknown live recovery errors fail the regression rather than falling back into a backup-unreadable bucket.

## Verification and merge gates

Full source Node tests and strict TypeScript including the new integrity module must pass on exact PR HEAD. Claude independently reviews meaningful code diff and the relevant regression tests; **APPROVE / MERGE YES** at the unchanged exact HEAD is required before merging. A PR CI success is not a mobile gameplay or content-provenance certification.

**Overall APK estimate remains ~14% engineering; Android/gameplay/device ~0%.**
