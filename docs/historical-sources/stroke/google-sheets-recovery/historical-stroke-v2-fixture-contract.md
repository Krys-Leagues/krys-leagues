# Historical Stroke V2 fixture contract

Read-only contract prepared from the preserved Google Sheets evidence on 2026-08-26.

This file is a specification fixture, not parser code and not an import payload. The
raw source snapshots, font-color export, malformed-row evidence, and manifest remain
preserved unchanged; the normalized dataset below reflects the approved source-state
correction.

## Common V2 output contract

Every normalized observation must preserve these fields:

| Field | Required behavior |
| --- | --- |
| `season` / `division` | Preserve source season and division exactly. |
| `historical_player_name` | Preserve exact source spelling, case, spacing, and markers. |
| `canonical_player_id` | UUID or `null`; only an explicit/verified Global Player resolution may populate it. |
| `source_era` | One of the verified era identifiers, never inferred from a fixed Season 60 layout. |
| `course_order` / `course_name` | Preserve the source course count and source course name/order. |
| `score_state` | Distinguish numeric played, blank unplayed, dash unplayed, malformed, and current/incomplete. |
| `played` / `score` | Numeric `0` is `played: true, score: 0`; blanks/dashes have `played: false, score: null`. |
| `raw_score_token` | Preserve the original token, including blank versus `-`. |
| `outcome` | Preserve source W/L/D marker where present; do not infer an opponent from it. |
| `published_placement` | Preserve the source-published placement/rank; never substitute row order. |
| `P/W/D/L/PTS/STROKES` | Preserve the source-published aggregate values exactly. |
| `workbook` / `tab` / `source_row` | Preserve workbook, tab, and one-based source row. |
| `source_cells` / `source_range` | Preserve the exact score-entry cells and source range. |
| `source_url` / `source_sha` | Preserve source URL and exact source snapshot SHA-256. |
| `raw_source_values` | Preserve the original row/cell values for audit. |
| `pairing_evidence_type` | Preserve source-color, ambiguous, partial, unknown, or later admin-confirmed state. |
| `importable` | False for current/incomplete and malformed evidence; true only for eligible completed observations. |

The source workbook URLs are:

- `CURRENT SEASON STROKE PLAY`: `https://docs.google.com/spreadsheets/d/13MFYiA-5YpJn7o-ed6gHzbGHNNdllocVhYKgfNmIbQk/edit`
- `PAST SEASONS`: `https://docs.google.com/spreadsheets/d/1FfwU3FeJxaG6JzRKp5kkAnRQh_orpTlifnAIyE-6UJA/edit`

## Representative fixtures

The following fixtures use the real preserved normalized, malformed, manifest,
and pairing evidence. UUIDs are intentionally `null` because identity review has
not been run.

### F01 — legacy 9-course aggregate

- Source: `PAST SEASONS`, tab `S1`, row `2`, cell `I2`, range `'S1'!A1:T54`.
- Source SHA: `470807255cfdc177708287d76f6fbcbbca8c142dc71c8d687601628e6a2fb78e`.
- Era: `legacy_9_course_aggregate_s1`.
- Expected fields: `season=1`, `division=1`, `historical_player_name=Amberwave`,
  `course_order=1`, `course_name=SSH`, `score_state=PLAYED / NUMERIC`,
  `played=true`, `score=-14`, `raw_score_token=-14`, `importable=true`.
- The complete player standing must retain all nine course observations and the
  source-published P/W/D/L/PTS/STROKES values from the same source row.
- Pairing evidence: `UNKNOWN — NO SOURCE EVIDENCE`; no opponent is guessed.

### F02 — one-sided 5-course layout

- Source: `CURRENT SEASON STROKE PLAY`, tab `10`, row `5`, score range `I5:L5`.
- Source SHA: `c1a793f32a51d81ca639fa03775d3605dd2d71cfa265893cc3ba2182790bc59a`.
- Era: `one_sided_5_course_s10_s18`.
- Expected fields: `season=10`, `division=1`,
  `historical_player_name=MASTERDOMINATOR`, `course_order=1`,
  `course_name=20E`, `score_state=PLAYED / NUMERIC`, `played=true`,
  `score=-17`, `raw_score_token=-17`, `source_cells=I5:L5`,
  `importable=true`.
- The parser must emit five courses, not three or nine.

### F03 — one-sided 3-course layout

- Source: `CURRENT SEASON STROKE PLAY`, tab `19`, row `5`, score range `I5:L5`.
- Source SHA: `1edaa335bd9725cf93e6757be7359d37a180be555f5c35da6764dfaec55ebcc6`.
- Era: `one_sided_3_course_s19_s42`.
- Expected fields: `season=19`, `division=1`,
  `historical_player_name=KRYS`, `course_order=1`, `course_name=80E`,
  `score_state=PLAYED / NUMERIC`, `played=true`, `score=-16`,
  `source_cells=I5:L5`, `importable=true`.
- No right-side duplicate may be invented.

### F04 — mirrored 3-course layout, left side canonical

- Source: `CURRENT SEASON STROKE PLAY`, tab `43`, row `5`, score range `I5:L5`.
- Source SHA: `ef6370856e89cb521519f307ee7642d8720d12f2d280e16312b74db9b1b734ea`.
- Era: `mirrored_3_course_s43_s61`.
- Expected fields: `season=43`, `division=1`,
  `historical_player_name=BIGJA33`, `course_order=1`,
  `course_name=UPSIDE TOWN EASY`, `score_state=PLAYED / NUMERIC`,
  `played=true`, `score=-20`, `source_cells=I5:L5`, `importable=true`.
- The left-side aggregate is canonical; the mirrored right-side display is
  provenance/duplicate evidence, not a second standing.

### F05 — legitimate numeric zero

- Source: `PAST SEASONS`, tab `S1`, row `8`, cell `Q8`, source era
  `legacy_9_course_aggregate_s1`.
- Exact name: `Power25`; course: `TTH`; course order `9`.
- Expected fields: `score_state=PLAYED / NUMERIC`, `played=true`, `score=0`,
  `raw_score_token=0`, `importable=true`.
- This must never be classified as blank or unplayed.

### F06 — blank unplayed score

- Source: `PAST SEASONS`, tab `S2`, row `41`, cell `K41`, range `'S2'!A1:Z1000`.
- Source SHA: `bef7c18dc885fb2728fc966fef08b8666d0056241f22a261444045f70403c55e`.
- Exact name: `Roach`; season `2`, division `4`, course `EDE`, order `1`.
- Expected fields: `score_state=UNPLAYED / BLANK`, `played=false`, `score=null`,
  `raw_score_token=""`, `importable=true` as an evidence row.
- Blank must remain distinct from dash and must not become zero.

### F07 — dash unplayed score

- Source: `PAST SEASONS`, tab `S7`, row `31`, range `'S7'!A1:AR40`.
- Source SHA: `4e3de7c6f006f122fb3c5a0b160250d652cf906faac66475d9187f7082cd1945`.
- Exact name: `WICKEDSHACK`; season `7`, division `3`, course `BBH`, order `3`.
- Expected fields: `score_state=UNPLAYED / DASH`, `played=false`, `score=null`,
  `raw_score_token=-`, `source_score_range=Q31:T31`, `importable=true` as an
  evidence row.
- Dash must remain distinct from blank and must not become zero.

### F08 — Season 5 malformed row

- Source: `PAST SEASONS`, tab `S5`, row `20`, range `'S5'!A1:CX31`.
- Source SHA: `c270033ad9db6713738e42298b3a9b7597812d66889ad55147903bcee3cf3fa1`.
- Exact name: `Badwolff`; season `5`, division `2`.
- Expected fields: `score_state=MALFORMED SOURCE`,
  `import_status=BLOCKED / NEEDS KRYS REVIEW`, `importable=false`.
- The complete `raw_source_row_json` remains attached. No aggregate totals,
  course count, player identity, or missing context may be guessed.

### F09 — current/incomplete Season 62

- Source: `CURRENT SEASON STROKE PLAY`, tab `Current`, range
  `'Current'!A1:T49`.
- Source SHA: `3eccd08e66481c6cef6fd11b1319ab97529af4c2fe2e745fc4afea3815ac4f79`.
- Source status: `CURRENT / INCOMPLETE / NOT IMPORTABLE`.
- Source era: `Current season 62 active layout`.
- Expected fields: `season=62`, `importable=false`,
  `score_state=CURRENT / INCOMPLETE / NOT IMPORTABLE` for its observations.
- The source remains preserved and reviewable, but no score, placement, rank,
  or standings value is treated as final or committed.

### F10 — source-color confirmed played pairing

- Source: `PAST SEASONS`, tab `S3`, range `'S3'!A1:AU75`.
- Source SHA: `c9c2a4baf79165dc3539027d3fcbf1f27f2b2a475c5c757f98f9a4c3234997e6`.
- Season `3`, division `1`, game `1`.
- Player A: `Yuk1N `, cells `L4:O4`.
- Player B: `Awkward3Sauce`, cells `L8:O8`.
- Exact source color: `rgb(1,0,0,1)`.
- Expected pairing type: `SOURCE COLOR CONFIRMED — PLAYED`.
- The exact names and cells are retained; no pairing is inferred from score,
  rank, W/L/D, or row order.

### F11 — ambiguous color group

- Source: `PAST SEASONS`, tab `S3`, range `'S3'!A1:AU75`.
- Season `3`, division `2`, game `2`; color `rgb(0.6,0,1,1)`.
- Source cells: `P17:S17`, `P18:S18`, and `P24:S24`.
- Exact source names represented: `Ocolus310`, `Rich8523`, `Skorpzz`.
- Expected pairing type: `AMBIGUOUS — NEEDS REVIEW`.
- No two-player opponent is selected automatically.

### F12 — partial pairing

- Source: `PAST SEASONS`, tab `S3`, range `'S3'!A1:AU75`.
- Season `3`, division `2`, game `3`; color `rgb(1,0,0,1)`.
- Player A: `Ocolus310`, cells `T17:W17`.
- Player B: `MikeHenn`, cells `T19:W19`.
- Expected pairing type: `PARTIAL — NEEDS REVIEW`.
- The color evidence is preserved, but incomplete game state remains unresolved.

### F13 — unknown/no-evidence pairing

- Source: `PAST SEASONS`, tab `S1`, range `'S1'!A1:T54`.
- Source SHA: `470807255cfdc177708287d76f6fbcbbca8c142dc71c8d687601628e6a2fb78e`.
- Season `1`, division `1`, game `1`, course `SSH`.
- Player A: `Amberwave`, source cell `I2`; Player B is unavailable.
- Expected pairing type: `UNKNOWN — NO SOURCE EVIDENCE`.
- No opponent is guessed from standings, score, or adjacent rows.

### F14 — source zero placeholder, unplayed

- Source: `CURRENT SEASON STROKE PLAY`, tab `10`, row `21`, cell `I21`, range
  `'10'!A1:BB55`.
- Exact name: `OCULUS310`; season `10`, division `2`, course `20E`.
- The source cell contains literal `0`, but its course W/L/D marker cells are
  blank and the aggregate participation is incomplete for the five-course era.
- Expected fields: `score_state=UNPLAYED / SOURCE TOKEN`, `played=false`,
  `score=null`, `raw_score_token=0`, `importable=false` until the source-token
  state is supported by the installed database schema.
- The literal source token remains preserved; it is not rewritten as blank, dash,
  or numeric zero.

### F15 — source zero with W/L/D evidence, played

- Source: `CURRENT SEASON STROKE PLAY`, tab `10`, row `17`, cell `Y17`, range
  `'10'!A1:BB55`.
- Exact name: `CHIPNPUTT`; season `10`, division `2`, course `BBH`.
- The source cell contains literal `0` and the adjacent course result marker is
  present, proving this is a played zero.
- Expected fields: `score_state=PLAYED / NUMERIC`, `played=true`, `score=0`,
  `raw_score_token=0`, `importable=true`.

### F16 — unsupported dash-prefixed source token

- Sources: `PAST SEASONS`, tab `S5`, row `12`, cell `AQ12`, and tab `S6`, row
  `39`, cell `AK39`.
- Exact names/courses: `Rich8523` / `EDH` / `--5`, and `SavRuby` / `AMH` /
  `--2`.
- Expected fields: `score_state=MALFORMED SOURCE`, `played=false`, `score=null`,
  `raw_score_token` preserved exactly, `importable=false`.
- These tokens are not interpreted as a score, blank, dash, or unplayed state.

## Contract assertions

The future V2 parser tests must assert that these fixtures preserve:

- All seven historical layout/era families.
- Exact names and source spelling.
- Negative, positive, and numeric-zero scores.
- Blank and dash as distinct unplayed states.
- Current and malformed evidence as non-importable.
- Published rank separately from display/row order.
- All workbook/tab/row/cell/range/URL/SHA provenance.
- All five pairing evidence classifications represented above.
- No canonical player UUID is invented.
- No opponent is guessed for ambiguous or unknown evidence.

The corrected full-package counts are 5,740 observations, 4,767 played numeric
(165 legitimate numeric-zero observations), 971 unplayed, and 2 unsupported
source-token observations blocked as malformed,
alongside 1,312 exact color-confirmed pairings, 13 ambiguous groups, 48 partial
groups, 2,976 unknown rows, and 10 separately blocked Season 5 malformed rows.

## Next step

Review this fixture contract against the complete stash-only evidence package.
Only after approval should the controlled `historical-stroke-v2` parser and its
single additive database migration be designed and implemented.
