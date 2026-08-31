# Historical Stroke Google Sheets recovery

Read-only source inventory captured from the authorized native Google Sheets account on 2026-08-25.

## Canonical sources

- CURRENT SEASON STROKE PLAY: https://docs.google.com/spreadsheets/d/13MFYiA-5YpJn7o-ed6gHzbGHNNdllocVhYKgfNmIbQk/edit
  - Historical tabs 9 through 61 are available.
  - `Current` is Season 62 and is CURRENT / INCOMPLETE / NOT IMPORTABLE.
- PAST SEASONS: https://docs.google.com/spreadsheets/d/1FfwU3FeJxaG6JzRKp5kkAnRQh_orpTlifnAIyE-6UJA/edit
  - Tabs `S1`, `S2`, `S3`, `S4`, `S5`, ` S6`, `S7`, and `S8` are available.

## Verified source eras

- Season 1: four sequential legacy aggregate blocks; nine course columns; no usable score-cell font-color evidence.
- Season 2: three league-block aggregate scorecards; nine course columns; no usable score-cell font-color evidence.
- Seasons 3–8: marker-based aggregate scorecards with nine course columns. Font colors are exposed on score-entry cells; groups that are not exactly two are ambiguous.
- Season 5 additionally contains a score-only block with unreliable aggregate P/W/D/L/PTS/STROKES fields. It must remain blocked for review.
- Season 9: one-sided nine-course layout.
- Seasons 10–18: one-sided five-course layout.
- Seasons 19–42: one-sided three-course layout.
- Seasons 43–61: mirrored three-course layout; the left-side aggregate is the canonical row and the right-side display is a duplicate view.
- Season 62: active/current and excluded from historical import.

## Verified counts

- Historical coverage: Seasons 1–61.
- Canonical standings/player rows: 1,230, excluding the 10 malformed Season 5 score-only rows.
- Course observations: 5,740 across the preserved historical rows.
- Played numeric score observations: 4,767.
- Legitimate played numeric-zero observations: 165.
- Unplayed observations: 971.
- Unsupported source-token observations: 2, preserved and blocked.
- Exact historical screen names, preserving case/spacing/asterisk variants: 246.
- Season 5 malformed score-only rows preserved separately: 10 rows and 80 score cells.
- Exact font-color pairing evidence is available in the original Sheets. Seasons 1–2 have none; Seasons 3–8 and 30–61 have usable evidence in varying completeness. A color group is source-confirmed only when exactly two players share the same score-cell font color within the same season/division/course.
- Identity matching has not been run in this read-only source phase. No canonical player was guessed or created; all 246 exact names remain pending Global Player review.

## Preserved normalized artifacts

- `historical-stroke-normalized.csv` contains 5,740 era-aware course observations. It preserves the exact source name, raw score token, numeric score where present, aggregate standings, source row/cell/range, source SHA-256, workbook/tab, source URL, era, and review/import status.
- `historical-stroke-pairings.csv` is the corrected parser-ready row-level pairing artifact. It preserves all 5,740 source-side records, exact historical names, source cells, exact font colors, workbook/tab/range/SHA provenance, and played/scheduled/partial/ambiguous/unknown state. The authoritative reconciliation is 1,312 confirmed color pairings (1,168 played and 144 scheduled/unplayed), 13 ambiguous color groups representing 44 source-side rows, 48 partial groups representing 96 source-side rows, 2,976 unknown rows, and 4,380 deduplicated endpoint records.
- `historical-stroke-season5-malformed.csv` contains all 10 malformed Season 5 score-only rows and their complete raw row JSON. They remain `BLOCKED / NEEDS KRYS REVIEW`.
- `raw/stroke-source-font-colors.json` preserves the read-only RGB foreground-color values observed on score-entry cells. Background colors and standings-cell colors were not used as pairing evidence.

The corrected manifest records 4,767 played numeric observations, 971 unplayed observations, and 2 unsupported source-token observations. Fifteen source cells containing literal `0` were confirmed played by course W/L/D evidence, while fourteen previously played `0` rows were confirmed unplayed placeholders by absent course result markers and incomplete participation. The raw `0`, `--2`, and `--5` tokens remain preserved; no source value was rewritten.

The two unsupported source tokens are `--2` (Season 6 / SavRuby / AMH) and `--5`
(Season 5 / Rich8523 / EDH). They remain `MALFORMED SOURCE` and non-importable until
the installed V2 schema supports a dedicated source-token state or an explicit admin
decision is recorded.

The authoritative pairing deduplication key is `Season | Division | Game/Course | sorted(Player A source cell, Player B source cell) | exact font color | Workbook | Tab | Source range | Source SHA`. Sorting the two endpoints collapses only mirrored A/B representations of the same source evidence; it never infers an opponent. The approved counts are 1,312 confirmed pairings (1,168 played and 144 scheduled/unplayed), 13 ambiguous color groups, 48 partial-state groups, 2,976 unknown rows, 5,740 raw row-level records, and 4,380 deduplicated endpoint records. Older summaries such as 718/9/38 are not authoritative.

## Historical Stroke v1 compatibility gaps

The installed `historical-stroke-v1` parser/RPC is not compatible with this complete evidence package. It hard-codes the three-course mirrored layout and a 20-column left/right structure, recognizes only the newer `SEASON n* ENDS ...` header shape, and has no era field, source workbook/tab/cell provenance, font-color pairing evidence, scheduled/unplayed provenance, malformed Season 5 score-only classification, or opponent-assignment payload. It therefore cannot safely parse Seasons 1–42, the legacy nine-course blocks, the five-course Seasons 10–18, or the row-level pairing artifact. The existing SQL tables can hold variable course counts, but the commit RPC still accepts only parser version `historical-stroke-v1`; any future importer change needs one deliberate, reviewed migration/RPC version rather than bypassing the installed path.

## Safety

No Google Sheet was edited. No SQL was run. No Production rows were changed. No scores were imported. No identities, Pro, Monthly, KWT, Match, PYP, Doubles, Solo, or UI files were changed.
