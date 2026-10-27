# Phase 135 rating lineage recovery

Status: **READY FOR LOCAL DATABASE VALIDATION; PRODUCTION BLOCKED**

## Recovered lineage

- 16 successor rating snapshots prepared: 14 previously missing ratings plus 2 approved-value mismatches.
- Every recovered source set matches its Phase121 sample size and distinct-player count exactly.
- All source rows are KWT; no Weekly evidence is included.
- Venice Easy remains quarantined because the verified ledger contains 217 refs while the candidate expects 215. The other affected ratings use the existing Phase68 plus Phase117 KWT provenance ledgers.
- No dates, identities, scores, or Production rows were invented or changed.

## Mapping

- Phase130 pending ratings: 58 existing Production IDs + 14 deterministic successors + 1 quarantined.
- Earlier five approvals: 3 existing Production IDs + 2 deterministic successors.
- Complete rating mapping: 77/78.
- New calculation run: `8f135000-0000-5000-8000-000000000135`, DRAFT / QUARANTINED only.

## Rolling-20 revalidation

- 138/166 candidates revalidated against the complete available rating mapping; 28 remain blocked by missing lineage.
- 138 required ID remapping; numeric calculation values are unchanged.
- 98 OFFICIAL_ELIGIBLE and 40 PROVISIONAL candidates retained.
- Weekly personal-index inputs: 0.

## Production boundary

The installation package is prepared but not executed. It inserts only one quarantined run and 16 unpublished successor rating snapshots; it does not insert indexes, decisions, or provenance. Existing snapshots remain untouched.

Hollywood remains provisional, Gloop Lair remains unrated, and rating/index publication remains separately gated.

- Lineage exceptions: 1; see lineage_exceptions.csv.
