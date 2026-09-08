# Full public Monthly score recovery

This evidence area contains a fresh read-only crawl of the public Krys Monthlies Oracle APEX results application. It is intentionally separate from the retained `website-recovery` CSV and manifest.

## Scope

Only periods whose rendered Monthly hero said `Completed` were included in the score extraction. The resulting finalized scope is January 2024 through August 2026 inclusive (32 periods). September 2026 was observed as `In Progress` and excluded. October 2026 was not encountered in the public navigation chain and was not guessed or included.

The crawl tested these exact source division values: 21 Master, 22 Elite, 23 Pro 1, 24 Pro 2, 25 Pro 3, 113 Semi Pro 1, 81 Beginner, 62 Welcome, 114 Semi Pro 2, and 115 Semi Pro 3. Semi Pro 4 and Amateur 1/2/3 were not assigned guessed source values.

## Request and extraction model

Period navigation followed the public Previous links and recorded the period identifier from `g_currently_month_id`. Each division view was requested through the APEX page route using page item `P1_LEAGUE_ID`. The rendered page supplied the period item `P1_PREPARED_MONTHLY`, the overall leader report `#report_table_leagueLeaders`, and course reports under `.scoreRegion table.t-Report-report`.

Each visited cell has unchanged rendered HTML and text captures plus a structured JSON capture under `raw/`. The TSV extraction retains exact source player names, source player IDs, course headings, score text, placement, HN1, points, and the raw JSON SHA-256.

## Score semantics

A numeric score is `PLAYED/SCORED`. An empty score cell is `UNPLAYED/BLANK`; it is preserved as an observation and never converted to zero. A numeric zero remains a valid played score. Completeness is based on capture of the rendered leader/course tables and player rows, not on every player having played every course. A source response with no leader or course rows is `UNKNOWN_NO_ROWS` because the public response does not distinguish a nonexistent division from an existing division with no results.

See `full-public-score-recovery-report.md` for the audit and `coverage-matrix.tsv` for the exact period-by-division matrix.
