# Phase 121 — Final Handicap Publication Package

Status: `PARTIAL — LOCAL PACKAGE READY FOR FORMAL REVIEW`

This is a deterministic, unpublished successor-run package. It is not a Production import and it does not approve or publish any rating or player index.

## Package identity

- Project: `jfbndcwdsvsjgnzwvexp`
- Calculation run: `19777bdb-8c2d-5c39-80fa-55a7b429fe93`
- Policy: `krys-handicap-approved-policy-v1`
- Model: `krys-handicap-candidate-a-v1`
- Formula: `(score - course rating) * 8.515 / course slope`
- Chronology: `OFFICIAL_KWT_SEQUENCE` (`Season → Week → Easy → Hard`)
- Scope: `KWT_ONLY`; Weekly rows used by personal indexes: `0`
- Run status: `DRAFT`; publication eligibility: `QUARANTINED`

## Counts

- 82 course review dispositions
- 78 KWT-only rating candidates
- 166 named player-index candidates
- 166 distinct canonical players
- 166 indexes reference only ratings approved for initial publication preparation
- 5 diagnostic ratings have explicit Krys owner approval dated `2026-10-21`
- 0 indexes retain a diagnostic rating blocker
- 2 provisional ratings remain `HOLD_PROVISIONAL`
- 2 unrated entries remain `HOLD_UNRATED` (including Gloop Lair Hard)
- Owner numeric-fairness acceptance: Krys and Tricky; no invented signature, UUID, or timestamp

The five rating approvals are explicit owner decisions for initial publication preparation. They are not publication authorization, RPC authorization, or a Production data-write authorization. Numeric fairness acceptance by Krys and Tricky remains separately recorded and is not broadened.

## Rating dispositions requiring human review

The following ratings remain held and are not eligible for publication in this package:

- `Hollywood_easy` (provisional)
- `Hollywood_hard` (provisional)
- `Gloop Lair_easy` (unrated under KWT-only evidence)
- `Gloop Lair_hard` (unrated)

The 166 numeric results remain unpublished pending explicit index approval, guarded player-read installation, and the final publication transaction.

## Identity and evidence boundaries

Canonical `public.players.id` UUIDs and current canonical screen names are retained in the candidate rows. Historical source names remain in the underlying provenance packages. Only verified KWT observations feed personal indexes. THE_WEEKLY remains course-rating evidence only and is never included in index source rounds or differential inputs.

Negative scores remain signed internally. The player-facing notation is prepared separately: a stored `-2.15` displays as `+2.15`, a stored `4.27` displays as `4.27`, and zero displays as `0.00`.

## Approval and installation boundaries

The package is append-only in design and does not modify the 4 existing runs, 28,672 provenance rows, 410 rating snapshots, or 157 old unpublished index snapshots. The local successor run is not eligible for publication. No Production SQL, RPC, migration, deployment, or data write was performed in Phase 121.

Before any future installation, the following must be separately completed:

1. Keep the four provisional/unrated entries excluded; no missing ratings may be fabricated.
2. Explicit approval of each of the 166 indexes and confirmation that the five owner-approved rating values are the exact reviewed values.
3. Review and separate authorization of the guarded player-read RPC proposal.
4. Read-only Production preflight against the current schema, grants, RLS, append-only guards, and publishable views.
5. One atomic append-only installation transaction with deterministic IDs, manifest hashes, and read-only postflight.
6. A separately approved application release that reads only the guarded publishable path.

See [publication_installation_plan.md](<C:/Users/kryst/krys-leagues/.local-worktrees/phase121-handicap-publication/docs/handicap/phase121/publication_installation_plan.md>), [production_preflight.sql](<C:/Users/kryst/krys-leagues/.local-worktrees/phase121-handicap-publication/docs/handicap/phase121/production_preflight.sql>), and [player_read_rpc_installation.md](<C:/Users/kryst/krys-leagues/.local-worktrees/phase121-handicap-publication/docs/handicap/phase121/player_read_rpc_installation.md>).

The quarterly review proposal is [quarterly_rating_review_policy.md](<C:/Users/kryst/krys-leagues/.local-worktrees/phase121-handicap-publication/docs/handicap/phase121/quarterly_rating_review_policy.md>); it is not installed or active.

## Checksums

The full deterministic package and installation-artifact hashes are in [package_checksums.json](<C:/Users/kryst/krys-leagues/.local-worktrees/phase121-handicap-publication/docs/handicap/phase121/package_checksums.json>). The approval and review manifest hashes are:

- Approval manifest: `2CEBA012BE6927767CD3E942D3696FA2EA5F0869F37D97E7071689F4B9A676AC`
- Rating review: `0D6437EB689DB514261E5F6507377A969AA0D4CB82ACDC5C8ADFFA4267E501AC`
