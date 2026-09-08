# Monthlies Source-Merge Policy Audit

Date: 2026-09-07

## Intended categories

The planned repaired source must distinguish exact matches, OLD-only rows, NEW-only rows, old blank/unplayed versus new played/scored, old played/scored versus new blank/unplayed, and genuine numeric disagreements. Old-only rows must remain preserved unless authoritative evidence disproves them. A logical key must be evaluated independently of source fingerprints.

## Current code/schema findings

The current `monthlyWebsiteAdapter` can parse a blank score as `score: null` and `scoreState: NO SUBMISSION`, preserving that state in the in-memory preview. It also preserves exact historical name, source player ID, period ID, course, difficulty, source URL, placement, totals, and a source fingerprint.

The current commit path cannot safely implement the full merge policy:

- `historical_monthly_score_observations.score` is `integer not null`; blank/unplayed observations cannot be stored in the current table.
- The commit validation filters to `row.importable && row.score !== null`, so blank/unplayed rows are excluded from the future commit payload.
- The commit function requires an integer score for every applied row.
- `source_fingerprint` is globally unique, and the commit function rejects a fingerprint already present in another import. That supports idempotency, not parallel old/new provenance for one logical row.
- `historical_monthly_imports` stores one source filename/SHA/parser version per import. The current payload has one `raw_source` JSON object per stored row, not an explicit collection of source attestations for old and new evidence.
- The current server preflight reads scored production rows and compares the incoming scored source by source fingerprint and a logical key. It can report overlap/conflict signals, but it does not create a merge ledger containing OLD-only, NEW-only, blank/scored, and numeric-disagreement decisions.
- The current source validation is hard-bound to `monthly-website-score-observations.csv` and its existing manifest counts, so a repaired multi-source package cannot pass unchanged.

## Safe-policy result

| category | Can current source analysis preserve it? | Can current importer/table preserve it without change? |
|---|---|---|
| OLD + NEW exact logical match | Yes, in an external analysis/provenance ledger | No, not as dual provenance; only one source row is committed |
| OLD-only | Yes, preserved in old source and logical analysis | Only if represented as a scored row; no source-merge provenance field |
| NEW-only | Yes | Only as a new scored row after identity review; not as a complete merged source package |
| old blank/unplayed / new scored | Yes, current analysis identifies one such key | No, blank side cannot be stored and no review-decision field exists |
| old scored / new blank/unplayed | Yes, analysis can identify it | No, blank side cannot be stored |
| genuine numeric disagreement | Yes, analysis can identify and block it | No, current commit path rejects/requires a single fingerprint and has no conflict-resolution record |

## Conclusion

The existing importer/source schema is not sufficient to safely load a provenance-preserving merged source containing all requested categories. It can preserve provenance for individual scored rows through the import record, source fingerprint, source URL, and `raw_source`, but it cannot retain valid blank/unplayed course slots or both source versions for a logical row. Source repair must therefore remain blocked/review-gated until a reviewed merge package and an explicitly approved schema/import design exist. No implementation was made in this audit.
