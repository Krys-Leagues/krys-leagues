# Phase 56 Handicap launch readiness

This is a local release-gate document. It does not activate Handicap, install
the proposed persistence schema, publish a rating, or change Production.

## Completed locally

- Candidate A is an explicit, configurable differential model:
  `(score - course rating) * reference slope / course slope`.
- The approved launch reference slope is `8.515`, versioned as
  `krys-handicap-candidate-a-v1`.
- Near-zero or missing slopes fail closed for Candidate A.
- Canonical UUID grouping, negative scores, source-fingerprint deduplication,
  latest-ten/best-five selection, and rating-version references remain in the
  existing engine.
- Weekly evidence can remain in course-rating projections but is excluded from
  personal differentials and indexes.
- Indexes retain deterministic preview values while exposing chronology confidence
  and an unpublished status whenever play chronology is not exact.
- Immutable rating/index snapshot constructors and append-only review decisions
  remain local-only.
- The player display contract is local-only and marks non-exact chronology as
  preview-only; no public route consumes it.

## Evidence boundary

The accepted Weekly package remains 844 verified individual course-score
observations. It is course-rating/slope evidence only. Remaining unreadable or
ambiguous rows remain quarantined and cannot enter personal Handicap history.
Gloop Lair Hard and any other insufficient course remain unrated. No simulated
value is an approved Production rating.

## Release gates

1. Review the proposed persistence schema against a fresh disposable local
   PostgreSQL database using PostgreSQL 17.11. The schema remains unapplied.
2. Install the reviewed schema transactionally only after Production preflight,
   explicit RLS/grant review, and a separate approval.
3. Load only reviewed rating snapshots and approved personal-round provenance;
   keep Weekly rows in the course-evidence path only.
4. Run protected admin review and privacy checks in the deployed environment.
5. Publish only exact-chronology player indexes and approved course versions;
   activate a public player display in a separate reviewed release.

## Current status

- No Production SQL, migrations, rebuilds, deployments, or data changes.
- No public Handicap route is activated.
- The remaining blockers are schema installation approval, reviewed
  Production evidence import, and authenticated release validation.
