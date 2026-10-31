# Monthlies historical completeness recovery

Fresh browser-rendered evidence crawl performed 2026-09-04 for finalized January 2024 through July 2026. The crawl followed the authoritative site's rendered historical navigation and selected every non-empty `P1_LEAGUE_ID` option for each period.

Files:

- `authoritative-coverage-inventory.tsv`: one row per audited month with all eight observed division records encoded as `label:value:leaderRows:courseTables:courseRows:scored:missing:malformed:selectionAttempts`.
- `crawl-summary.json`: scope, totals, state counts, evidence hashes, and known source limitations.
- `crawl-methodology.md`: browser method, reproduction request state, and preservation rules.
- `old-vs-fresh-diff.md`: exact old/fresh view and count comparison currently supportable.

Targeted endpoint recovery on 2026-09-05 found accepted APEX values `114` (Semi Pro 2) and `115` (Semi Pro 3), and rendered all six proven cells. `targeted-recovery-inventory.tsv` preserves the earlier browser request state; `retired-division-player-names.tsv` preserves the exact source screen names observed; `structured-extraction-index.json` records the later local capture totals (320 observations, 194 scored, 126 blank-score) and its source-state difference from the earlier 198/122 observation.

`request-discovery.md` records the APEX page/item/region mechanism and the seven 2024 diagnostic results. A local Edge headless CDP capture subsequently preserved rendered-DOM HTML, exact visible text, structured JSON, and full-page PNG evidence for all six retired cells and all ten previously omitted visible cells under `raw/`. `local-capture-method.md`, `local-capture-inventory.tsv`, `recovered-observations.tsv`, `row-level-diff.json`, and `evidence-sha256.tsv` document the capture and validation. These are rendered-DOM captures, not claims of raw HTTP response-body capture.

The current capture contains 1,144 observations: 320 retired-cell rows (194 scored, 126 missing) and 824 visible-cell rows (613 scored, 211 missing). It also records live-source state changes from the earlier crawl; source repair remains blocked pending review of those conflicts and unresolved 2024 coverage.
