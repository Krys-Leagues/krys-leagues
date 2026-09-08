# Repaired Historical Monthlies Source Package

Review date: 2026-09-08. This is a local, non-Production preparation artifact. No Production SQL, import, deployment, identity write, or source-site mutation was performed.

## 1. Scope and provenance

The package merges two named sources without overwriting either:

- website-recovery/monthly-website-score-observations.csv: original retained recovery, 7,285 rows.
- completeness-recovery/full-public-score-recovery/all-completed-monthly-score-observations.tsv: fresh public rendered recovery, 15,664 rows.
- Repaired finalization: finalizedThrough = **2026 August**; currentIncompletePeriod = **2026 September**.
- September 2026 is the active Monthly and is not finished; no September scores are present in the repaired package. The old manifest’s July/August gate remains historical provenance only.

The logical key is period_id | division_id | source_player_id with exact source-name fallback, course_name, and difficulty. The repaired merge is 384 EXACT_BOTH, 6,660 OLD_ONLY, 240 LEGACY_AUGUST_EXCLUDED, 15,279 NEW_ONLY, one BLANK_TO_SCORED_REVIEW, zero scored-to-blank reviews, and zero numeric conflicts. Legacy August rows remain provenance-only; finalized August is sourced from fresh finalized recovery evidence. The numeric import payload contains 254 EXACT_BOTH, 5,736 OLD_ONLY, and 11,472 NEW_ONLY rows.

## 2. Corrected score-only package

A Monthlies player who did not play a course has no historical score observation for that course. Blank slots are preserved as evidence only and are not in the score import payload.

| Measure | Count |
| --- | ---: |
| Numeric import-ready logical observations | 17,462 |
| Played/scored import rows | 17,462 |
| Blank/unplayed evidence rows excluded | 4,909 |
| Zero-score played rows | 95 |
| Negative-score played rows | 16,916 |
| Positive-score played rows | 451 |
| EXACT_BOTH numeric rows included once | 254 |
| OLD_ONLY numeric rows included | 5,736 |
| NEW_ONLY numeric rows included | 11,472 |
| Quarantined rows excluded | 1 |
| Pending Amateur 1–3 rows included | 0 |
| January–July 2024 rows included | 0 |
| Malformed rows | 0 |
| Duplicate logical keys | 0 |
| Duplicate repaired fingerprints | 0 |

Every row in repaired-monthly-observations.tsv has played_state=PLAYED and a nonblank numeric score_numeric. Numeric 0 is retained as a played even-par score. Negative and positive scores are retained unchanged. repaired-monthly-unplayed-evidence.tsv contains the 4,909 blank slots with played_state=UNPLAYED and blank score text.

## 3. Quarantine and exclusions

2025 August / Elite / PETERK9FLORIDA / Atlantis / period 221 / division 22 remains QUARANTINED_SOURCE_DRIFT_REVIEW and is absent from the import payload. The old source is blank, the full-crawl artifact is -23, and three reproductions are -26; no value was selected.

Amateur 1–3 remain pending source-ID verification and are absent. Semi Pro 4 has no proven participation and is non-blocking. January–July 2024 remain UNKNOWN — NO OBSERVATIONS IMPORTED.

## 4. Identity preview

The existing Global Players matcher and read-only preview route are prepared, but no local Global Players directory snapshot or local Supabase configuration exists in this worktree. No Production identity read was run. Therefore exact, mapped/alias, ambiguous, and unresolved totals are not determined.

The known scored placeholder names are recorded in repaired-monthly-identity-review.tsv without canonical assignments:

- Merged into 8588 — source player ID 8550, 12 numeric rows.
- Merged into 8648 — source player ID 3184, 78 numeric rows.
- Merged into 8708 — source player ID 8508, 16 numeric rows.

Merged into 8189 appears only in 54 blank/unplayed evidence rows and is not an import identity.

## 5. Migration safety

historical_monthly_repaired_source_package.sql is unexecuted and additive. It retains historical_monthly_score_observations.score NOT NULL, adds explicit played_state=PLAYED, exact score text, logical observation keys, and source provenance. The commit function accepts only numeric signed integer score rows; it rejects blank rows. Zero is valid because validation checks for numeric text rather than truthiness. Blank/unplayed slots remain local evidence and are not inserted into the score table.

The migration does not destructively replace tables. Its unique logical-key index, source fingerprint checks, provenance table, and idempotent source-SHA path protect against duplicate import. Canonical identity still resolves through public.players.id; historical names remain separate provenance.

## 6. Reader and preflight compatibility

The public Monthlies API filters played_state=PLAYED, so score readers remain score-only after the migration. Player Profile Monthlies consumes that API. The local repaired preview filters the score payload through the explicit numeric/PLAYED predicate and reports blank evidence separately. The existing legacy Monthly importer already uses row.score !== null, so zero is not filtered as falsy.

## 7. Verification

- Package row count: 17,462 numeric rows.
- Blank/unplayed evidence count: 4,909.
- Zero-score verification: 95 rows, all score_text=0, score_numeric=0, played_state=PLAYED.
- Negative-score verification: 16,916 rows.
- Positive-score verification: 451 rows.
- Malformed rows: 0.
- Duplicate logical keys/fingerprints: 0.
- SHA-256: manifest contains source and derived-file hashes; local verification is required after each regeneration.
- Focused tests cover negative, zero, positive, blank exclusion, dedupe, quarantine, pending divisions, and reader/migration wiring.
- TypeScript and ESLint are not run when dependencies are unavailable; package files were not modified.

## 8. Gate

IDENTITY REVIEW GATE

The corrected numeric score package is prepared, but identity classification has not been run against an approved Global Players directory. No import or Production SQL is authorized by this artifact.

## 9. One next action

Run the read-only identity preview against an approved Global Players directory, then review the unexecuted SQL migration before Production preflight.