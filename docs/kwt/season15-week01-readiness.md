# Season 15 Week 01 — 14-player local readiness

This is a local, read-only staging note. It is not a Production import or a publication approval.

## Verified source package

- File: `C:\Users\kryst\Downloads\kwt15w01_ful_results (3).csv`
- SHA-256: `8C9A20EFB45B6399AD4F7DBCFB3633B8C63A6F9F5C6A7A5385069B1A8A0D8D7D`
- Parsed data rows: **14**
- Event: `KWTS15W01`
- Course: Raptor Cliffs (`RCE` / `RCH`)
- Hole evidence: 18 Easy + 18 Hard values per row
- Source score invariant: `Easy + Hard = Total Score`
- Identity state: **14/14 resolved** to existing canonical Global Players; no ambiguous rows remain.
- BIGJA33 resolves through the verified BIGJA alias; the Laurent row preserves the invalid `BF BF` source bytes and resolves to the sole active LAURENT identity; MAXFROM-FR matches exactly.
- The four added rows resolve to ROKNHORSEBRAT, lynniebodd, ALYSSA38, and Dandnt65 through verified active Global Player identities.
- Canonical identity evidence is recorded in `season15-week01/identity-resolution-updated.json`.

## Comparison with the previous 10-player source

- Added players: **ROKNHORSEBRAT, lynniebodd, ALYSSA38, Dandnt65**.
- Existing 10 players: Easy, Hard, and Combined Gross scores are unchanged.
- Existing KILLERBEE, ULTRAFOX_LYNNE, and Sj_76 scores are unchanged; their overall placements and points changed because the four additional players are now included in the authoritative field.
- The `(2)` source is superseded by `(3)` and cannot be used by the regenerated activation package.

## Authoritative event evidence

The verified KWT source identifies the event as **KWTS15W01**, dated **October 24, 2026**, with the current courses **Raptor Cliff's / Raptor Cliff's - Hard** and course codes **RCE / RCH**. The owner-approved Week 01 freeze is **2026-10-23T04:00:00Z**, representing Friday midnight in **America/New_York**. The activation package records the verified one-day official date as `2026-10-24`; it does not invent a weekend range.

The event remains **pending protected Week Setup activation** in Production. No Production rows were created.

## Provisional NET results

The calculation uses the existing frozen published rolling-20 Indexes, 100% allowance, approved KWT-specific Raptor Cliffs rating references, reference slope `8.515`, and approved half-up rounding. The full result artifact is `season15-week01/verified-net-results.json`.

| NET rank | Player | Easy NET | Hard NET | Combined NET | Points | Handicap status |
|---:|---|---:|---:|---:|---:|---|
| 1 | ZANETTI | -24 | -22 | -46 | 25 | OFFICIAL |
| 2 | KILLERBEE | -26 | -15 | -41 | 21 | OFFICIAL |
| 2 | Sj_76 | -26 | -15 | -41 | 21 | OFFICIAL |
| 4 | CHIPNPUTT | -27 | -13 | -40 | 16 | OFFICIAL |
| 4 | JESUNET | -22 | -18 | -40 | 16 | PROVISIONAL |
| 4 | NUTTYGRANDPA | -24 | -16 | -40 | 16 | OFFICIAL |
| 4 | ROKNHORSEBRAT | -21 | -19 | -40 | 16 | OFFICIAL |
| 8 | MAXFROM-FR | -24 | -15 | -39 | 12 | PROVISIONAL |
| 9 | Dandnt65 | -25 | -13 | -38 | 11 | OFFICIAL |
| 9 | ULTRAFOX_LYNNE | -23 | -15 | -38 | 11 | OFFICIAL |
| 11 | LAURENT | -23 | -12 | -35 | 9 | OFFICIAL |
| 11 | lynniebodd | -22 | -13 | -35 | 9 | OFFICIAL |
| 13 | ALYSSA38 | -23 | -10 | -33 | 7 | OFFICIAL |
| 14 | BIGJA | -22 | -10 | -32 | 6 | PROVISIONAL |

The numerical rank sequence is intentionally `1, 2, 2, 4, 4, 4, 4, 8, 9, 9, 11, 11, 13, 14`; no `T` prefix is used. Historical KWT placement formatting uses the same numeric-only rule.

## Activation package status

Production currently has zero `kwt_operational_results` and no active Week Setup, so the event is not active there. The guarded local activation proposal at `season15-week01/activation_transaction.proposed.sql` now expands only the existing `kwt_public_content` type check to admit the protected `kwt_week_setup` record, creates the verified Season 15 anchor and Week Setup, and inserts **14** canonical operational summaries. It reuses the two approved KWT-only Raptor Cliffs snapshots and does not insert or publish ratings or Handicaps.

The original activation checksum `92AC01AF66920EC055D46F5E31FBFA6D2118800F9569E739FC872BC9CBF764CC` is **SUPERSEDED**. The corrected package also performs a narrowly scoped replacement of `kwt_feature_image_required`: `calendar_week` and `kwt_week_setup` may have a NULL image URL, while every other content type, including `weekly_feature`, still requires an image URL. No unrelated content type is exempted.

Corrected package checksums:

- Activation SQL: `D2B7B210C3A1FB36352B5F5C13F6FE67EA4BB4DE53BB1ED5F9F1F039E19844FC`
- Preflight SQL: `9139ABAC4D584265F2B838279B7EBA85E9CFFD0DDD75B4D4A1F3AF959AA11542`
- Postflight SQL: `00AA68541101D25663DDAACF5C0D32B5B465C2B693D92115234AB49FFB4503AC`
- Production-compatible local harness: `32A5D6405B39AAA546BB572AD780B8657A151C9234B9FF2E67455A07C85ADE44`

The corrected disposable PostgreSQL 17.11 transaction passed with both Production content constraints present: one Week Setup, 14 canonical operational rows, two approved rating references, preserved existing content types, required weekly-feature images, optional calendar-week/setup images, duplicate rejection, and atomic rollback.

The prepared activation package is guarded by the new `(3)` source hash, exact canonical UUIDs, the approved rating snapshot IDs/values, duplicate/conflict checks, and an atomic transaction. No Production rows, snapshots, trophies, Discord roles, or finalization records were created.

## Production schema adapter

The NET loader reads the actual `kwt_operational_results` contract (`easy_score`, `hard_score`, course codes, status, source type, and canonical `player_id`) and resolves screen names and published rolling-20 Handicaps server-side. It requires a protected `kwt_week_setup` record plus two eligible rating references before producing NET rows. It does not read or return private rating values, source evidence, or Gross provenance.
