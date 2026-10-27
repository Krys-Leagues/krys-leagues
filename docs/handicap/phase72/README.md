# Phase 72 — controlled provenance recovery preparation

Status: **PREPARED ONLY — NOT AUTHORIZED FOR PRODUCTION EXECUTION**

This package prepares the append-only recovery of the invalid Phase 67
Handicap provenance batch. It does not change Production and contains no
automatic cleanup of the invalid rows.

## Verified Production baseline

- Supabase project: `jfbndcwdsvsjgnzwvexp`
- Current website alias at verification: `krysleagues.com` →
  `dpl_FFhaRXdqWXEUxMg3AnQkKFFvJ3`
- Invalid calculation run: `5a57560c-3548-54a8-879c-8fc516a85f26`
- Invalid run status: `DRAFT`
- Current provenance rows: `14,394`
- Current rating snapshots: `169`, all `UNPUBLISHED`
- Current player-index snapshots: `0`
- Current review evidence/decisions: `0` / `0`
- Current legacy counts: `handicap_rounds=10,274`, `course_ratings=32`,
  `handicap_differentials=5,518`, `handicap_index=182`

The Production review-scope correction is already present. The rating snapshot
table has `review_scope`, the allowed-value check, and the five-column identity
constraint. This is a required Phase 72 baseline condition, not a change made
by this package.

## Phase 67 defect

The invalid batch contains 13,550 KWT provenance rows with missing canonical
player UUIDs and malformed fingerprints. This was caused by the Phase 67
temporary dictionary encoder using original input positions after deduplicating
dictionary values. The 844 Weekly rows remain external, canonical-player-null,
and personal-Handicap-ineligible.

The committed Phase 68 package corrects the KWT rows without changing their
scores or source identity. Its verified hashes are:

| Artifact | SHA-256 |
| --- | --- |
| `handicap_source_provenance_import.csv` | `8440A1D1DCB4C09283F64235F5A85567E59D677DC6494EAB58E1FFB5EE2499CE` |
| `rating_snapshot_import_manifest.json` | `4EDF8E2248030383BDA1D2DAEF028122CE53DD4A212A529C5491D7BA3CA88D53` |
| `recovery_manifest.json` | `ED62C5896D40F4A0394634E5BB670BC617E9C64FFAD008D03B36D4B583832BF2` |

## Safety boundary

`production_recovery_transaction.sql` is a reviewable transaction template.
It requires a same-session, parameterized load into temporary staging tables;
it must not be run by pasting CSV values into SQL or by using server-side
`COPY`. It performs inserts only: quarantine evidence/decision, one corrected
DRAFT run, corrected KWT provenance, and corrected UNPUBLISHED snapshots.
It never updates, deletes, truncates, republishes, or rewrites the invalid
batch, Weekly rows, legacy Handicap tables, or player identities.

The current Production schema has no dedicated `quarantined` column on
`handicap_calculation_runs`. The package therefore records quarantine in the
append-only review evidence/decision tables and in corrected-run metadata.
Because this is not a database-enforced selection rule, any future reader must
apply that quarantine decision and the DRAFT/UNPUBLISHED gates. The Phase 71
local reader implements those gates, but it is not deployed by this phase.
This remains an explicit release blocker for execution until the authorized
executor confirms that every Production reader applies the same gate.

## Files

- `production_recovery_transaction.sql` — prepared insert-only transaction;
  not executed.
- `production_recovery_postflight.sql` — SELECT-only verification after a
  separately authorized execution.
- `production_recovery_preflight.sql` — SELECT-only execution gate.

No Production recovery, migration, deployment, push, or data change was made
for Phase 72.
