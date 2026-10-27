# Quarterly Handicap Rating Review Policy — Proposal

Status: `PROPOSAL ONLY — NOT INSTALLED`

## Purpose

Review every published or publication-eligible Course Rating and Slope Rating at least quarterly while preserving immutable historical versions and published Handicap snapshots.

## Review inputs

Each quarterly review should examine:

- New verified KWT scoring evidence by course and Easy/Hard difficulty.
- Eligible course-rating-only evidence from THE_WEEKLY, kept separate from KWT personal rounds.
- Sample size, distinct-player count, player concentration, score distribution, elite benchmark, rating, and slope stability.
- Source fingerprints, duplicate/correction history, chronology confidence, and provenance completeness.
- Changes since the prior approved rating version and the player indexes affected by those changes.

## Decision rules

- Do not automatically change an approved rating or slope.
- A rating adjustment requires a new immutable version, deterministic calculation-run lineage, evidence references, and explicit human approval.
- Easy and Hard remain independent ratings.
- Missing evidence, invalid scores, unresolved source conflicts, and slope values at or below `0.01` fail closed.
- A course below 20 qualifying rounds remains unrated; 20–49 remains provisional; 50+ still requires distinct-player and concentration checks.
- Diagnostic outliers require a documented disposition even when the owner accepts the current numeric result.
- Weekly evidence may support course-rating analysis only and never enters personal Handicap indexes.

## Required audit record

Every quarterly review must preserve:

1. Review period descriptor without invented calendar dates.
2. Prior and proposed rating/slope version identifiers.
3. Source and provenance checksums.
4. Affected player-index count and signed-value comparison.
5. Reviewer decision and rationale.
6. Explicit publication status for each version.

Approved historical versions and published indexes are never overwritten. A later approved change affects only a new calculation run and explicitly selected future publication scope.
