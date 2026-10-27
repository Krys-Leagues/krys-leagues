# Phase 101 final KWT rating approval readiness

Status: **PARTIAL — statistically ready and source-compatible locally; formal approval and a narrow effective-period gate change remain.**

## Production compatibility

The verified Production project is `jfbndcwdsvsjgnzwvexp`. The current database has the `effective_period` text column, but the installed publishable-rating view still requires `effective_from IS NOT NULL`. Production currently has 338 unpublished snapshots with NULL calendar dates and a generic historical period label. No Production row was changed.

The Phase 100 package instead carries exact per-snapshot Season/Week ranges. These are authoritative competition periods under `OFFICIAL_KWT_SEQUENCE`, not invented calendar dates. A future approved run must carry those values and explicit run-level opt-in; the existing quarantined runs must remain excluded.

## Approval recommendations

- 72 ratings meet the approved sample, distinct-player, concentration, positive-slope, and provenance requirements.
- 68 are recommended `APPROVE_PENDING_FORMAL_REVIEW`.
- Four are recommended `APPROVE_AFTER_DIAGNOSTIC_REVIEW`; their values reproduce from valid corrected KWT distributions with no source or formula defect.
- Six remain `HOLD_PROVISIONAL` and cannot support official indexes.
- 157 numeric player-index candidates remain unpublished and dependent on approved ratings.

The complete 78-row review is in `rating_approval_manifest.md` and `rating_approval_manifest.csv`. The four diagnostic rows are Shangri-La Easy, Forgotten Fairyland Easy, Bogey's Bonanza Hard, and Original Gothic Easy.

## Source exceptions

The 806 unresolved-identity and 2 invalid-score rows remain preserved in the Phase 100 exception ledger, excluded from the corrected KWT package, and unchanged. They do not invalidate the 72 rating samples because none of their fingerprints is referenced by those snapshots.

## Proposed effective-period compatibility change

The separate proposal `supabase/proposals/20261020_handicap_kwt_effective_period_publication_gate.proposed.sql` preserves the existing calendar-date path and adds a strictly gated period-only path requiring:

1. `COMPLETED` run status and `ELIGIBLE` publication eligibility;
2. `PUBLISHED` snapshot status;
3. `chronology_policy = OFFICIAL_KWT_SEQUENCE`;
4. explicit run metadata opt-in `allow_official_kwt_sequence_publication = true`;
5. a validated per-snapshot KWT Season/Week period string; and
6. valid slope and complete source provenance.

It changes no tables, rows, grants, RLS, or existing publication status. It is not executed in this phase.

## Remaining controlled steps

1. Krys explicitly approves the 72 rating recommendations, including the four diagnostic dispositions.
2. Review and approve the effective-period proposal.
3. Build a new append-only eligible calculation run with exact per-snapshot periods; do not update the existing 338 immutable rows.
4. Run the production preflight and import/publish only the approved rating subset.
5. Generate and review the 157 index candidates, then publish only after the existing OFFICIAL_KWT_SEQUENCE gate and all player-level safeguards pass.
