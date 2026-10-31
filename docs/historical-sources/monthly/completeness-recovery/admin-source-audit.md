# Monthlies authenticated admin-source audit

Capture date: 2026-09-07 (America/New_York)

This is a read-only audit. The user supplied authentication interactively. No credential, session token, webhook value, or other secret is preserved. No Monthly-site mutation was submitted; no player, score, period, division, standings, or course result was changed.

## 1. Admin pages/reports discovered

The authenticated application menu exposed these Monthlies pages:

- `home`: current period navigation, public leaderboards, course result tables, current-courses report, and Submission Queue.
- `montly-admin`: period report plus Courses, Leagues, and Players APEX Interactive Grids.
- `all-players`: player report with exact displayed screen names, rank markers, country, timezone, player-detail links, and merge links.
- `search`: `P2_SEARCH` application search item; no query was submitted.
- `administration`: generic APEX configuration/activity/access-control links; no additional Monthlies score report was exposed.

From a current-period leaderboard `Edit` link, the authenticated application also exposed the read-only-inspected `Player League Maintenance` dialog. Its database-backed Scores report is documented in `admin-source/reports/player-score-maintenance.md`.

The Monthlies admin period report was `R19763479863368549_report`. The child grids were Courses (`R27920066730650719`), Leagues (`R28011591147538931`), and Players (`playersIG`).

## 2. Export mechanisms

The Courses and Leagues Interactive Grid Actions menus exposed read-only Download choices: CSV, HTML, PDF, and Excel. CSV was requested for both grids. APEX reported `File prepared. Starting download.` for the Leagues request; the Courses dialog closed after its download request. No resulting file appeared in the host Downloads directory available to this worktree, so no admin export bytes, filename, row count, or hash are claimed as locally preserved. The Players child grid was not exportable in the observed unselected-parent state and displayed `Select 1 row in the parent region`.

No bulk historical score export, score-history export, archived-score export, or all-period/all-division historical observation grid was discovered. A database-backed per-player/period/division Scores report was discovered through Player League Maintenance, but it is not a complete historical dataset by itself and no local raw response/export was obtained.

The revised extraction task was evaluated against that report. The available browser-control surface cannot safely automate the report exhaustively because it does not expose authenticated response bodies, session cookies, a local download path, or a DOM extraction interface. No direct report request was replayed outside the authenticated browser, and no combination was marked complete without captured rows.

## 3. Complete historical period range

The admin period report contained 34 rows, paginated 15 + 15 + 4, from 2024 January through 2026 October inclusive. 2026 September was explicitly marked `In Progress`; 2026 August and older displayed completion markers. The report did not expose a period-ID column in the observed accessibility tree. The Player League Maintenance Monthly selector additionally exposed November 2026, December 2026, and January 2027, so the complete admin option range is at least January 2024 through January 2027; status and source IDs for those additional selector options were not proven.

The final recovery must include only periods proven finalized by the authenticated source. September 2026 is explicitly `In Progress` and is excluded. October 2026 has an unclassified status marker and is excluded pending proof; later selector options are likewise excluded pending proof. August 2026 is unresolved: the current admin period list showed a completion marker, while the retained historical manifest explicitly says August 2026 was current/incomplete and not finalized. No admin score export was obtained to resolve that conflict. Therefore no August rows are counted as finalized recovered admin data in this audit. The previously scoped January 2024 through July 2026 interval remains the proven historical working scope for the existing public evidence, but the authenticated-source finalization boundary is not fully proven for August 2026.

## 4–6. Division inventory and status

The admin Leagues grid exposed 14 labels. Its `Order` column is reported as admin order, not silently treated as a source ID because no ID column was displayed.

| Admin order | Exact division label | Admin Active? | Independently evidenced public/source value |
|---:|---|---|---:|
| 1 | Master | Yes | 21 |
| 10 | Elite | Yes | 22 |
| 20 | Pro 1 | Yes | 23 |
| 30 | Pro 2 | Yes | 24 |
| 40 | Pro 3 | Yes | 25 |
| 42 | Semi Pro 1 | Yes | 113 |
| 43 | Semi Pro 2 | No | 114 |
| 44 | Semi Pro 3 | No | 115 |
| 45 | Semi Pro 4 | No | UNKNOWN |
| 50 | Amateur 1 | No | UNKNOWN |
| 60 | Amateur 2 | No | UNKNOWN |
| 70 | Amateur 3 | No | UNKNOWN |
| 80 | Beginner | Yes | 81 |
| 90 | Welcome | Yes | 62 |

The six trophy/provenance-proven retired cells remain valid. The admin application independently confirms that Semi Pro 2 and Semi Pro 3 are inactive labels. It also exposes inactive Semi Pro 4 and Amateur 1–3; their source selector IDs and historical usage are not proven by this audit.

## 7. January–July 2024

The admin period inventory proves that period rows for January–July 2024 exist. Because the requested safety boundary forbids changing periods and no historical parent period was selected, the admin child grids were not used to inspect those periods. No admin-backed player, division assignment, score, standings, or course record was obtained for IDs 47–53.

Classification remains `UNKNOWN` for all seven months. This is not `CONFIRMED NO RESULTS` and does not manufacture rows.

The period-status evidence and its conflict analysis are preserved separately in `admin-source/reports/finalized-scope.md`.

## 8–12. Authoritative counts

Admin-source counts are currently **0 observations, 0 scored, 0 missing-score, 0 negative-score, and 0 unique historical source players**, meaning no admin historical score export or selected historical child-grid evidence was locally preserved. These zeros mean “not recovered from admin,” not “the source contains none.”

The resumable extraction checkpoint therefore records 0 source players checked, 0 combinations checked, and an empty completed-combination set. The schema-only player inventory and derived score dataset contain headers only; they are not claims of an empty source.

For comparison, existing preserved non-admin evidence reports:

- fresh public finalized crawl: 12,167 observations; 9,468 scored; 2,699 missing-score; 9,266 negative-score; 0 malformed;
- six retired cells plus ten visible omitted cells in durable local capture: 1,144 observations; 807 scored; 337 missing-score; 0 malformed; 0 duplicate fingerprints;
- observed public snapshot including the six retired cells: 12,487 observations; 9,666 scored; 2,821 missing-score (current-source evidence, not an admin export);
- exact historical screen-name count in the fresh rendered public tables: 194; no canonical identity decisions were made.

The authenticated `All Players` report displayed current player records 15 at a time and did not expose a historical unique-player total. Its current-player data is not substituted for a historical source-player count.

## 13–15. Comparison against existing recovery

No admin score rows were recovered, so the exact admin-vs-old results are:

- rows already in old source: 0 proven from admin;
- rows missing from old source: 0 proven from admin;
- rows only recoverable through admin access: 0;
- admin score disagreements: 0 observed;
- admin player-name disagreements: 0 observed;
- admin division disagreements: 0 observed.

Existing public evidence remains separately attributed: the old finalized source has 7,045 observations (5,990 scored, 1,055 missing); the fresh exposed-view delta is +5,122 observations (+3,478 scored, +1,644 missing); durable retired-cell recovery adds 320 observations (+198 scored, +122 missing in the earlier targeted aggregate; the durable row-level capture is 194 scored and 126 missing). The six retired cells had no old retained rows, so their old-vs-durable logical conflict count is 0.

The prior transient-versus-durable count drifts are preserved in `source-drift-review.md`; they are not silently relabeled as admin conflicts.

## 16–17. Files and SHA-256 status

Created for this admin audit:

- `admin-source/README.md`
- `admin-source/metadata/admin-page-inventory.md`
- `admin-source/metadata/admin-file-sha256.tsv`
- `admin-source/reports/admin-export-attempts.md`
- `admin-source/reports/player-score-maintenance.md`
- `admin-source/reports/finalized-scope.md`
- `admin-source/player-inventory.tsv` (schema only; no source players captured)
- `admin-source/extraction-checkpoint.json` (blocked checkpoint; no combinations marked complete)
- `admin-source/raw-scores/README.md`
- `admin-source/derived/all-finalized-admin-score-observations.tsv` (schema only)
- `admin-source/derived/README.md`
- this report

The unchanged pre-existing public evidence has hashes recorded in `completeness-recovery/crawl-summary.json` and `evidence-sha256.tsv`. Hashes for the new text files are recorded in `admin-source/metadata/admin-file-sha256.tsv`. No admin export hash exists because no downloaded admin file was accessible locally; no binary or raw admin export is falsely represented as preserved.

## 18. Sufficient evidence for final repaired source?

**No.** The admin session confirms a broader inactive division inventory and a database-backed per-player Scores report, but it does not yet provide a preserved bulk or complete row-level historical admin dataset. The August finalization conflict and January–July 2024 UNKNOWN status also remain unresolved. The current evidence is insufficient to build the final repaired source without risking omission of additional inactive divisions or unsupported assumptions about finalized scope.

## 19. Git status

At capture, branch `codex/monthlies-historical-completeness` was at `fd429f322a3ca5403d15c4dbc07239e150c7ecbf`. The worktree had only the pre-existing untracked Monthlies completeness-recovery evidence area; no tracked application files, `package.json`, or `package-lock.json` were changed. No commit was made.

## 20. Final gate

**BLOCKED** — authenticated admin access was obtained, but no locally verifiable historical score export or historical child-grid capture was recovered. Source repair/import must not proceed.

## 21. One next action

Provide a browser-control path that exposes the authenticated Scores report response/rendered DOM to local capture, then resume from `admin-source/extraction-checkpoint.json` and traverse source player × finalized period × active/inactive division combinations.
