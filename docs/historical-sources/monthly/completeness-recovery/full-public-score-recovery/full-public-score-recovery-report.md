# Full Public Monthly Score Recovery Report

Capture date: 2026-09-07
Authority used: public Krys Monthlies Oracle/APEX results application, read-only
Evidence root: `docs/historical-sources/monthly/completeness-recovery/full-public-score-recovery/`

## 1. Scope and finalized periods

The crawl followed the public Monthly navigation chain and included only periods whose rendered hero/status said `Completed`.

- Finalized periods audited: **32**
- Exact finalized scope: **January 2024 through August 2026 inclusive**
- Completed period IDs: 47–58; 81, 101, 121, 141, 161, 181, 201, 221, 241, 261, 281, 301; 321, 341, 361, 381, 401, 421, 441, 461
- Excluded current/in-progress period: **September 2026 / 481**, rendered `In Progress`
- October 2026 was not reached in the public navigation chain and was not guessed or included
- Period inventory: `period-inventory.tsv`

The public page therefore establishes August 2026 as completed for this capture. This is preserved as a separate current public snapshot and does not overwrite the old recovery manifest, which had treated August differently.

## 2. Underlying request mechanism

The public page used Oracle APEX page 500. Period navigation was through the public Previous link carrying `g_currently_month_id=<period_id>` and `clear=1`. Division data was retrieved by navigating to the APEX page route with page item `P1_LEAGUE_ID=<source division value>`.

Observed page/data anchors:

- period item: `P1_PREPARED_MONTHLY`
- division item: `P1_LEAGUE_ID`
- overall leaders report: `#report_table_leagueLeaders`
- course reports: `.scoreRegion table.t-Report-report`
- rendered source rows: player ID in `data-id`, exact player text, score text, HN1, points, placement
- request method: browser page navigation/GET; the per-cell raw JSON retains the exact request URL and session state locally, while period inventory URLs redact session values

No administrative mutation, Production SQL, import, deployment, or identity change was performed.

## 3. Division inventory and view coverage

Known source division values tested exhaustively for all 32 finalized periods (320 views):

| Source value | Division | Views with course data | Rows | PLAYED/SCORED | UNPLAYED/BLANK |
|---:|---|---:|---:|---:|---:|
| 21 | Master | 25 | 1,992 | 1,937 | 55 |
| 22 | Elite | 25 | 1,976 | 1,834 | 142 |
| 23 | Pro 1 | 25 | 1,976 | 1,783 | 193 |
| 24 | Pro 2 | 25 | 1,920 | 1,621 | 299 |
| 25 | Pro 3 | 25 | 2,656 | 2,129 | 527 |
| 113 | Semi Pro 1 | 16 | 1,152 | 931 | 221 |
| 114 | Semi Pro 2 | 15 | 928 | 701 | 227 |
| 115 | Semi Pro 3 | 12 | 720 | 482 | 238 |
| 62 | Welcome | 21 | 1,984 | 126 | 1,858 |
| 81 | Beginner | 6 | 360 | 183 | 177 |

Historical labels confirmed elsewhere but without a reliable public source value in this crawl: **Semi Pro 4, Amateur 1, Amateur 2, Amateur 3**. Their values were not guessed, so no rows were manufactured for them.

All 195 populated views returned eight course tables. There were zero leader-only views. Course-row totals matched the structured extraction exactly. One legitimate structural exception is 2025 September Welcome: the overall leader report had 31 rows while each of the eight course tables had 25 players (200 course observations); this is not an incomplete course capture.

The exact 320-row matrix is `coverage-matrix.tsv`. `COMPLETE_DATA_RECOVERED` means the full rendered course-table/player-row structure was captured. `UNKNOWN_NO_ROWS` means the authoritative page returned no leader or course rows, but the public response does not prove whether the division was absent or simply had no results. Blank/unplayed cells do not downgrade a populated view.

## 4. Totals from the new completed-period capture

- Course observations: **15,664**
- PLAYED/SCORED observations: **11,727**
- UNPLAYED/BLANK observations: **3,937**
- Negative numeric scores: **11,311**
- Numeric zero scores: **72**
- Malformed rows: **0**
- Exact duplicate fingerprints: **0**
- Rendered course tables: **1,560** (195 populated views × 8)
- Unique source player IDs: **202**
- Unique exact source screen names: **202**
- Raw per-cell artifacts: **960** (320 HTML, 320 text, 320 JSON)

The structured TSV is `all-completed-monthly-score-observations.tsv`. It preserves score text exactly; negative scores remain negative, zero remains numeric zero, and blank score text remains `UNPLAYED/BLANK` through `played_state=False`.

## 5. January–July 2024

The seven completed periods 47–53 were each visited for all 10 tested division values: 70 views total. Every response rendered a completed hero but returned zero leader rows, zero course tables, and zero course observations. The saved January example is `raw/period-47-division-21.json`.

This is **not** classified as confirmed no results. The public response does not distinguish an empty/nonexistent division from unavailable historical result rows, and no affirmative independent result artifact was used to invent or exclude data. These 70 known-ID cells remain **UNKNOWN**. The four unresolved historical labels add further untested UNKNOWN scope.

## 6. Retired divisions and known omitted cells

The new public capture directly retrieved rows for source values 114 and 115; these were not removed because the current visible selector omits them.

The six previously proven omitted cells are present in the new evidence:

| Period | Period ID | Division | Source value | Rows | PLAYED/SCORED | UNPLAYED/BLANK |
|---|---:|---|---:|---:|---:|---:|
| March 2026 | 361 | Semi Pro 2 | 114 | 56 | 56 | 0 |
| March 2026 | 361 | Semi Pro 3 | 115 | 40 | 21 | 19 |
| April 2026 | 381 | Semi Pro 2 | 114 | 64 | 54 | 10 |
| May 2026 | 401 | Semi Pro 2 | 114 | 56 | 28 | 28 |
| May 2026 | 401 | Semi Pro 3 | 115 | 56 | 10 | 46 |
| June 2026 | 421 | Semi Pro 2 | 114 | 48 | 25 | 23 |

These are captured from rendered course tables, not inferred from trophy assets. Trophy files remain corroboration only.

## 7. Comparison with the retained old source

Comparison fingerprints use period ID, source division value, source player ID, course name, difficulty, and exact score text. The new `- Hard` course heading is compared to the old source's `difficulty=hard`; this avoids treating easy/hard rows with the same base course name as duplicates.

- Old retained source rows: **7,285**
- Old PLAYED/SCORED rows: **6,182**
- Old UNPLAYED/BLANK rows: **1,103**
- New rows exactly represented in old: **384**
- New rows not present in old exact-fingerprint set: **15,280**
- Of those new-only rows, retired 114/115 contribute **1,648**; other tested divisions contribute **13,632**
- Old rows without an exact new match: **6,901**
- Logical observation keys overlapping regardless of score text: **385**
- Exact score conflicts: **1**
- Player-name conflicts on overlapping source IDs: **0**
- Division conflicts: **0**
- Old exact duplicate fingerprints: **0**
- New exact duplicate fingerprints: **0**

The one preserved conflict is:

- 2025 August / period 221 / Elite 22 / PETERK9FLORIDA / Atlantis / easy
- old retained score text: blank/unplayed
- current public score text: `-23`
- old source row: 1881
- current raw JSON SHA-256 is recorded in `analysis/old-vs-new-conflicts.tsv`

This is a provenance conflict requiring review; the current public row was not silently substituted into the old source.

The complete machine-readable comparison is in `analysis/comparison-summary.tsv`, `analysis/old-vs-new-conflicts.tsv`, `analysis/division-summary.tsv`, and `analysis/period-summary.tsv`.

## 8. Evidence and hashes

Created/preserved:

- `README.md`
- `extract-full-public-score-recovery.ps1`
- `period-inventory.tsv`
- `coverage-inventory.tsv`
- `coverage-matrix.tsv`
- `all-completed-monthly-score-observations.tsv`
- `extraction-checkpoint.json`
- `raw/period-<period_id>-division-<source_value>.html`
- `raw/period-<period_id>-division-<source_value>.txt`
- `raw/period-<period_id>-division-<source_value>.json`
- `analysis/comparison-summary.tsv`
- `analysis/old-vs-new-conflicts.tsv`
- `analysis/division-summary.tsv`
- `analysis/period-summary.tsv`
- `evidence-sha256.tsv`

The checkpoint is `COMPLETE`, with 32 finalized periods and 320 completed known-ID combinations. The hash ledger covers all evidence files except the ledger itself; its own SHA-256 can be calculated after any future evidence addition.

## 9. Gate

**REVIEW GATE**

The public recovery is complete for the 10 source values that were tested and the 32 periods marked completed. It is not yet sufficient to claim ALL recoverable historical scores because Semi Pro 4 and Amateur 1/2/3 have no reliable public source values in this evidence set, and 125 known-ID zero-row cells (including all January–July 2024 cells) remain UNKNOWN rather than confirmed empty.

No source repair, import, Production SQL, deployment, identity change, or commit was performed.

## 10. One next action

Resolve the authoritative source IDs or an independent database-backed read-only artifact for Semi Pro 4 and Amateur 1/2/3, then revisit only those unresolved cells and the 125 UNKNOWN no-row cells before building a repaired source.
