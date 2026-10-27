# Phase 113 — OFFICIAL_KWT_CSV contract review

## Result: PARTIAL — local contract passes; Production import remains blocked

The Phase 112 package uses the existing five-part outer KWT fingerprint shape while carrying a separate `OFFICIAL_KWT_CSV` namespace. It does not claim to recover original numeric KWT player or round IDs.

### Read-only Production compatibility

Verified against Supabase project `jfbndcwdsvsjgnzwvexp`:

- `handicap_source_provenance.source_fingerprint` has a unique constraint and unique index.
- `canonical_player_id` references `public.players(id)`.
- RLS is enabled.
- `anon` and `authenticated` have no direct SELECT privilege.
- Existing `OFFICIAL_KWT_CSV` rows: 0.
- Existing append-only UPDATE/DELETE trigger remains installed.
- `service_role` retains the existing restricted INSERT/SELECT/REFERENCES/TRIGGER privileges; no grants were changed.

### Local contract results

- 648 candidate observations.
- 648 unique fingerprints.
- 0 collisions with Phase 68 fingerprints.
- 0 duplicate fingerprints within the candidate.
- 324 candidate player-week pairs resolved.
- 47 pairs / 94 observations quarantined.
- Negative scores preserved.
- No `THE_WEEKLY` rows included.
- Re-running the generator produces the same package and checksums.

### Import safety decision

The package is not yet Production-importable under the historical importer contract because the CSV exports do not provide original numeric `source_player_id` and round IDs. The generated participant and row-evidence keys are deterministic and auditable, but they are a distinct evidence identifier kind.

Before import, a separately reviewed additive contract must explicitly decide whether `source_player_id_kind=CSV_PARTICIPANT_KEY_NOT_KWT_NUMERIC_ID` and `round_id_kind=CSV_ROW_EVIDENCE_KEY_NOT_KWT_NUMERIC_ID` are accepted for official KWT evidence. That review must preserve the existing unique fingerprint, canonical-player foreign key, append-only, publication, and Weekly-exclusion safeguards.

## Append-only import plan — not executed

1. Read-only preflight the exact ZIP, manifest, package checksums, Production schema, existing fingerprints, and current Season 14 counts.
2. Abort if any Phase 112 package hash or row count differs.
3. Validate every resolved row against a canonical player UUID and every quarantined row remains excluded.
4. Acquire the existing recovery advisory lock in one PostgreSQL session.
5. Insert a new DRAFT/QUARANTINED calculation run, provenance rows, and dependent unpublished artifacts in one transaction only after the contract is approved.
6. Reject duplicate fingerprints, missing foreign keys, invalid namespace metadata, Weekly source rows, and any partial dependency set.
7. Verify exact inserted counts, unchanged prior counts, empty publication views, and unchanged invalid batches.
8. Commit only after all assertions pass; otherwise roll back the entire transaction.

No Production SQL, migration, import, approval, publication, or deployment was performed in Phase 113.
