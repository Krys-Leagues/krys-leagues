# Monthlies source-drift and reproducibility review

Review date: 2026-09-05. Scope: the five cells named in the review request,
with three independent fresh Edge/APEX sessions per cell. No Production SQL,
Production write, import, identity change, or deployment was performed.

## Provenance boundaries

These observations are kept separate:

1. **Original Aug 2026 retained crawl:** the existing
   `website-recovery/monthly-website-score-observations.csv` and manifest. It
   has no rows for any of the five cells reviewed here.
2. **Transient completeness crawl:** the earlier browser pass that supplied
   the prior aggregate counts. It did not preserve row-level cells for the
   four scored/missing discrepancies and recorded only 9 course rows for
   September 2024 Pro 3.
3. **Durable local capture:** the 2026-09-05 rendered-DOM capture under
   `raw/`, including 1,144 rows across 16 cells. Its five reviewed cells are
   the same current row data used for comparison below.
4. **Reproduction captures:** the 15 fresh sessions saved under
   `raw/reproduction/`. Session HTML and structured JSON hashes vary because
   of session state and timestamps; the row-data hash is the comparison hash.

## Reproduction results

`reproduction-inventory.tsv` contains the exact request URL, all 15 DOM
hashes, all 15 structured-JSON hashes, the exact player-name set, course
headings, per-course player counts, and row-data hash. Every cell has three
captures, one unique row-data hash, and identical substantive rows.

| Cell | Source value | Leaders | Course tables / players per table | Observations | Scored / missing | Row-data SHA-256 | Result |
|---|---:|---:|---|---:|---:|---|---|
| April 2026 — Semi Pro 2 | 114 | 8 | 8 / 8 | 64 | 54 / 10 | `B08B70CC68068610F2638F383791B20D192B58C1410EEF6DD6840BBCB50F624C` | REPRODUCIBLE CURRENT AUTHORITATIVE SNAPSHOT |
| May 2026 — Semi Pro 2 | 114 | 7 | 8 / 7 | 56 | 28 / 28 | `F34B1801DA23902A20407882ED80C7967A0718A229982F3A4D2F7E796A6BA946` | REPRODUCIBLE CURRENT AUTHORITATIVE SNAPSHOT |
| May 2026 — Semi Pro 3 | 115 | 7 | 8 / 7 | 56 | 10 / 46 | `75E3FE76D4284CFB0D7751ABC67D3D1A0A920A02B83220A53E9EFD3A6415801B` | REPRODUCIBLE CURRENT AUTHORITATIVE SNAPSHOT |
| June 2026 — Semi Pro 2 | 114 | 6 | 8 / 6 | 48 | 25 / 23 | `7DD60200B4C5AEF1BC6FB346DEBF7795F44359A3C82479A93BFA1AA32339AF43` | REPRODUCIBLE CURRENT AUTHORITATIVE SNAPSHOT |
| September 2024 — Pro 3 | 25 | 19 | 8 / 19 | 152 | 99 / 53 | `6284A50B1AA6DF7F1C56CC5DDD4E09FB60D9477BD6231298BD190EF9CADDAA17` | REPRODUCIBLE CURRENT AUTHORITATIVE SNAPSHOT |

The five cells contain 376 reproducible current-authoritative observations:
216 scored and 160 missing-score. There are zero unstable cells and zero
unstable observations in these repetitions. The exact current player/course/
score cells are in each reproduction JSON; historical screen names and
negative score text are unchanged.

## Four retired-cell scored/missing discrepancies

| Cell | Earlier transient aggregate | Durable and all three reproductions | Difference |
|---|---:|---:|---:|
| April 2026 — Semi Pro 2 | 57 / 7 | 54 / 10 | -3 scored, +3 missing |
| May 2026 — Semi Pro 2 | 29 / 27 | 28 / 28 | -1 scored, +1 missing |
| May 2026 — Semi Pro 3 | 11 / 45 | 10 / 46 | -1 scored, +1 missing |
| June 2026 — Semi Pro 2 | 24 / 24 | 25 / 23 | +1 scored, -1 missing |

The four prior observations were aggregates only. No prior player/course/score
cells were saved, so the individual observations responsible for each change
cannot be identified. The current exact rows are reproducible in the JSON
captures, but they must not be presented as reconstructed prior values. The
available evidence proves a stable current snapshot; it does not prove
whether the earlier aggregate difference was a source backfill, incomplete
rendering, session/navigation contamination, or a counting/parsing issue.
The discrepancy therefore remains a provenance-level unresolved drift, not
an unstable current source.

## September 2024 Pro 3: 9 to 152

All three fresh captures returned:

- period ID 55 and the page heading `Pro 3 Leaders`;
- 19 leader rows and exactly 19 unique players;
- eight course tables, each with 19 player rows;
- the eight course headings `Tethys Station`, `Tethys Station - Hard`,
  `Sweetopia`, `Sweetopia - Hard`, `Shangri-La`, `Shangri-La - Hard`,
  `Temple at Zerzura`, and `Temple at Zerzura - Hard`;
- 152 observations = 19 players × 8 course tables = 99 scored + 53
  missing-score rows.

All eight tables are labeled by the same September 2024 Pro 3 page state. No
row is duplicated from another period or division in the current structured
data. The earlier value 9 was a course-observation count from one partially
captured course table; it was not the 19 leader-row count. The evidence is
consistent with the earlier crawler failing to wait for or extract all course
reports (incomplete rendering/counting), not with a demonstrated source
change. The three current captures make the 152-row snapshot reproducible.

## January–July 2024

Period IDs 47–53 still render the normal page shell but zero leader and course
rows in the available evidence. The prior recovery also had zero rows, and no
independent trophy/result evidence affirmatively proves a tournament result.
These seven months remain **UNKNOWN**, not confirmed empty. No rows were
invented.

## Old-source comparison and conflicts

The retained old CSV contains zero rows for all five reviewed cells. Therefore
the exact old-vs-reproduction row conflict count for these cells is zero by
non-overlap; it is not evidence that the old source was complete. The prior
transient aggregates are preserved above as provenance discrepancies.

## Evidence files

- `reproduction-inventory.tsv` — one row per repetition, including full
  request URL, counts, exact player set, and all hashes.
- `reproduction-summary.json` — structured reproduction results.
- `raw/reproduction/repro-*.html` — rendered DOM for each fresh session.
- `raw/reproduction/repro-*.txt` — exact rendered body text.
- `raw/reproduction/repro-*.json` — exact structured leader/course rows,
  player IDs, score text, and played/missing state.
- `raw/reproduction/repro-*.png` — full-page rendered screenshots.
- `reproduce-source-drift.ps1` — reproducible local capture helper.

These HTML files are rendered-DOM captures obtained through the browser; they
are not claims that a raw HTTP response body or APEX network trace was
exported. The existing `raw/` evidence and `request-discovery.md` document
the same limitation for the earlier local capture.

## Gate impact

Current repeated rows are stable enough for source-repair review, but the
four aggregate-only historical discrepancies and the seven January–July 2024
months remain unresolved. No repair/import decision is made by this report.
