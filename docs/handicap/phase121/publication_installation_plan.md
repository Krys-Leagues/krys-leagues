# Phase 121 publication installation plan

Status: **PREPARATION ONLY — DRAFT / QUARANTINED / UNPUBLISHED**.

This package is the deterministic successor-run preparation for 78 KWT-only
rating candidates and 166 revised numeric player-index candidates. It changes
no Production rows and does not itself approve or publish any rating or index.

## Package identity

- Calculation run: `19777bdb-8c2d-5c39-80fa-55a7b429fe93`
- Source scope: `KWT_ONLY` for personal indexes; THE_WEEKLY remains excluded
  from every personal-index row.
- Differential: `(score - course rating) * 8.515 / course slope`
- Model: `krys-handicap-candidate-a-v1`; chronology: `OFFICIAL_KWT_SEQUENCE`
- Effective period: verified KWT Season/Week descriptors only; unsupported
  calendar dates remain `NULL`.
- Candidate state: all rows remain DRAFT / QUARANTINED / UNPUBLISHED.

## Required approval gates

1. **Five owner approvals are already recorded and must not be reopened absent
   new evidence.** On 2026-10-21 Krys approved these exact rating values for
   initial publication preparation: Bogey's Bonanza Hard `-22.444 / 13.355`,
   Forgotten Fairyland Easy `-28.917 / 8.127`, Original Gothic Easy
   `-20.591 / 4.363`, Raptor Cliff's Hard `-13.895 / 12.197`, and Shangri-La
   Easy `-29.810 / 7.342`. The package records the owner name and decision date,
   while `reviewer_uuid` and `recorded_at` remain `NULL` because they were not
   supplied.
2. The other **73 rating snapshot candidates** remain pending formal human
   rating approval. They are numerically `READY_CANDIDATE` rows with
   `ACCEPT_FOR_FORMAL_REVIEW` dispositions; this is a procedural review state,
   not evidence of a failed calculation. The companion report
   `rating_approval_report.md` lists every row and its dependent indexes.
3. Keep Hollywood Easy and Hard provisional, and Gloop Lair Easy and Hard
   unrated. They are not part of the 78 rating-candidate batch.
4. Obtain explicit approval for all 166 index candidates after rating
   dispositions are settled. Krys and Tricky's numeric-fairness acceptance is
   recorded as fairness input only, not publication authorization.
5. Preserve Candidate A, reference slope `8.515`, canonical UUIDs, signed
   values, `OFFICIAL_KWT_SEQUENCE`, KWT-only personal evidence, and the
   existing quarantine/publication gates.

## Why the 73 are still pending

The package generator intentionally maps only the five owner-supplied decisions
to `PENDING_EXPLICIT_PUBLICATION_APPROVAL`. The remaining 73 rows retain
`PENDING_HUMAN_RATING_REVIEW` even though their numeric diagnostics satisfy
the already approved statistical thresholds. This prevents statistical
readiness from becoming an unrecorded human approval. No formula, score,
identity, or historical snapshot is being changed to resolve this state.

## Safe batch-approval shape

The 73 may be approved as one separately named and checksummed batch only if
the approval record contains one explicit decision per snapshot (or an
explicit batch decision whose manifest enumerates every snapshot ID and hash),
the five existing approvals remain linked, and any exception is listed as
`HOLD` rather than silently omitted. If a rating is held, every dependent
player index listed in the report must remain unpublished and the package must
be regenerated or filtered deterministically. A batch approval is therefore a
review convenience, not automatic approval by this artifact.

## Future installation shape

Use one PostgreSQL session and an advisory transaction lock. A read-only
preflight must confirm the project, schema, grants, RLS, append-only guards,
package hashes, canonical UUIDs, source fingerprints, and absence of the
deterministic run and snapshot IDs. Then insert a new DRAFT/QUARANTINED run
and unpublished successor snapshots only. No `UPDATE`, `DELETE`, `TRUNCATE`,
legacy-table writes, or rebuild functions are permitted. Any failed assertion
must abort the whole transaction.

The reviewed `production_preflight.sql` and `production_postflight.sql` are
read-only checks. The player-read RPC remains the separate Phase 107 proposal
referenced by `player_read_rpc_installation.md`; it is not installed here.

## Post-installation boundary

Even after a successful append-only installation, the rows must remain
unpublished until separate formal rating and index approvals are recorded and
the guarded identity-bound player-read RPC is reviewed for installation. No
Phase 121 artifact authorizes Production publication or website release.
