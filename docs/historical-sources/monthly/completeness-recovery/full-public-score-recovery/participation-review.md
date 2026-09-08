# Targeted Historical Division Participation Review

Date: 2026-09-07

Scope: preserved Monthlies evidence only; no new broad crawl and no source mutation.

Method: scanned the 320 preserved finalized-scope rendered division HTML captures in `raw/`. For each file, the saved Overall Leaders table was inspected for exact `LEAGUE_NAME` cells. Repeated captures of the same period were deduplicated by period ID and label. Admin grid/order values were not treated as source IDs. Trophy evidence was searched as corroboration; no Semi Pro 4 trophy/result artifact was found.

## Proven participation

| division | proven months | period IDs | participation evidence |
|---|---|---|---|
| Semi Pro 4 | none | none | No saved Overall Leaders `LEAGUE_NAME` row, trophy/result artifact, or tested division view proves participation in the preserved finalized scope. |
| Amateur 1 | 2024 September; 2025 January; 2025 April; 2025 May; 2025 June; 2025 July; 2025 August; 2025 October; 2025 November; 2025 December | 55, 81, 141, 161, 181, 201, 221, 261, 281, 301 | Exact Overall Leaders `LEAGUE_NAME` rows in saved rendered HTML. |
| Amateur 2 | 2024 August; 2024 September; 2024 October; 2024 November; 2024 December; 2025 January; 2025 February; 2025 March; 2025 April; 2025 May; 2025 June; 2025 July; 2025 August; 2025 September; 2025 October; 2025 December | 54, 55, 56, 57, 58, 81, 101, 121, 141, 161, 181, 201, 221, 241, 261, 301 | Exact Overall Leaders `LEAGUE_NAME` rows in saved rendered HTML. |
| Amateur 3 | 2024 August; 2024 September; 2024 October; 2024 November; 2024 December; 2025 January; 2025 March; 2025 May; 2025 June | 54, 55, 56, 57, 58, 81, 121, 161, 181 | Exact Overall Leaders `LEAGUE_NAME` rows in saved rendered HTML. |

Each proven month had ten repeated saved division captures in the crawl set, so the participation finding is not based on a single accidental page. The representative evidence file for each cell and the maximum observed Overall Leaders row count are recorded in `analysis/unresolved-division-participation.tsv`; the summarized month lists are in `analysis/unresolved-division-participation-summary.tsv`.

## Scope consequence

- Semi Pro 4 source ID is **not required for the current repair scope**, because no finalized month in the preserved evidence proves that division participated.
- Amateur 1, Amateur 2, and Amateur 3 source IDs **are required** for the current repair scope because participation is proven in the month lists above.
- This is evidence-bounded: “NO PROVEN PARTICIPATION” does not assert that Semi Pro 4 never existed; it means no participation was proven in the preserved finalized-month evidence.
- January–July 2024 remain `UNKNOWN — NO OBSERVATIONS IMPORTED`; the participation findings above do not manufacture course rows for those periods.
