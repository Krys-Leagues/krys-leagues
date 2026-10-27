# Phase 108 — Golf Handicap display and final admin review

This phase is local preparation only. It does not publish a rating or player
index, execute a migration, or read/write Production rows.

## Display contract

`lib/handicap/indexDisplay.ts` is the single shared formatter:

- stored `-2.15` displays `+2.15`;
- stored `4.27` displays `4.27`;
- stored `0` displays `0.00`;
- values are rounded for display only;
- the underlying signed number remains authoritative for sorting and future
  strokes-given calculations.

`PlayerHandicapDisplay` now carries both `index` (the signed number) and
`displayIndex` (golf notation). No unpublished candidate is treated as a
published player result.

## Protected review table

The site-admin-protected `/admin/handicaps` page reads the committed local
Phase 104 candidate package through the server-only loader in
`lib/handicap/adminIndexReviewServer.ts`.

Source:

`docs/handicap/phase104/index_snapshot_import_rows.csv`

The parser and review builder verify the package contains 157 candidates and
render, for each row:

- canonical player UUID;
- stored signed index and golf-style display index;
- qualifying course-round count;
- latest-ten and best-five counts;
- rating snapshot/version reference count;
- `OFFICIAL_KWT_SEQUENCE` chronology;
- unpublished status and review flags.

The Phase 104 package does not contain original screen names. Every loaded row
therefore receives `ORIGINAL_SCREEN_NAME_NOT_IN_PACKAGE` and remains
`REVIEW_REQUIRED`; no name is guessed. The table is read-only and is not a
publication approval surface.

The loader fails closed when the local package is unavailable. It does not
fall back to legacy tables, simulated indexes, or a client-side data source.

## Approval workflow

The existing Phase 107 `buildPublicationPlan` remains the only local
publication-plan builder. It requires:

1. 72 explicit rating approvals;
2. explicit dispositions for all four diagnostic ratings;
3. 157 independent index approvals;
4. SHA-256 values for the overall, rating, diagnostic, and index manifests;
5. KWT-only source rounds and `OFFICIAL_KWT_SEQUENCE` chronology;
6. valid rating references, positive slopes, and unpublished source rows.

Statistical readiness, a draft row, or a review-table display never substitutes
for those approvals. The 44 blocked players and six provisional ratings remain
excluded, and the 844 Weekly rows remain outside personal Handicap histories.

## Release boundary

The next safe step is human review of the 157 rows and the explicit approval
manifests. Only after those manifests are independently signed and checked
against the Phase 107/105 source hashes may a separate controlled Production
publication operation be considered.
