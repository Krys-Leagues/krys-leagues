# Monthlies old-crawl versus fresh authoritative evidence

## View inventory

- Old manifest: 246 division views across 32 periods, including current August 2026.
- Old finalized scope: 238 retained division views across January 2024 through July 2026.
- Fresh finalized scope: 248 selector views across 31 periods.
- Fresh selector labels: Master, Elite, Pro 1, Pro 2, Pro 3, Semi Pro 1, Beginner, Welcome.
- No unexpected label was exposed by the fresh selector.

## Old views absent from the retained finalized crawl

2024 December — Pro 1; 2024 November — Pro 1; 2024 September — Pro 3; 2025 August — Master; 2025 May — Master; 2025 September — Beginner; 2025 September — Master; 2026 April — Welcome; 2026 July — Pro 3; 2026 May — Pro 3.

The fresh source rendered those ten selector views. Their fresh rendered totals are 681 observations: 522 scored and 159 missing-score. These are observed current-source additions to cells absent from the old manifest; they are not silently declared historical repairs because the live source has changed.

## Known divisions not exposed by the fresh selector

The six independently proven historical cells—March 2026 Semi Pro 2, March 2026 Semi Pro 3, April 2026 Semi Pro 2, May 2026 Semi Pro 2, May 2026 Semi Pro 3, and June 2026 Semi Pro 2—remain absent from the visible selector, but the underlying APEX page accepted retired values `114` and `115` and rendered all six cells. The targeted source extraction contains 320 additional course observations: 198 scored and 122 missing-score. Exact request state and counts are preserved in `targeted-recovery-inventory.tsv`; raw HTTP/HTML export remains blocked.

## Old leader-only captures rechecked

- August 2025 — Welcome: fresh source now has 90 rows, 2 scored, 88 missing-score, and 6 course tables; resolved from leader-only but still INCOMPLETE.
- November 2025 — Welcome: remains leader-only: 10 leader rows and zero course rows; INCOMPLETE.
- February 2026 — Pro 2: fresh source now has 50 rows, 41 scored, 9 missing-score, and 5 course tables; resolved from leader-only but still INCOMPLETE.
- April 2026 — Pro 3: fresh source has 96 rows across 8 course tables; resolved.
- May 2026 — Master: fresh source has 80 rows across 8 course tables; resolved.
- June 2026 — Master: fresh source has 80 rows across 8 course tables; resolved.

## Fresh incomplete states

The fresh crawl has 2 leader-only views and 16 views with fewer than eight rendered course tables. The complete list is preserved by period/division/count in `authoritative-coverage-inventory.tsv`; no blank score was treated as malformed.

## Totals and conflicts

Fresh rendered totals are 12,167 observations, 9,468 scored, 2,699 missing-score, 9,266 negative-score, and zero malformed rows. Fresh rendered row fingerprints have zero duplicate groups and zero conflicting score groups. Adding the six newly recoverable retired cells gives an observed authoritative-source total of 12,487 observations, 9,666 scored, and 2,821 missing-score, before resolving any still-UNKNOWN historical cells.

The old finalized source contains 7,045 observations, 5,990 scored, and 1,055 missing-score. Relative to the old finalized source, the current fresh exposed-view delta is +5,122, +3,478, and +1,644; the six retired-cell recovery adds a further +320, +198, and +122. The targeted retired cells have zero old retained rows and therefore zero old-vs-recovered row conflicts. Exact row-level disagreement counts for overlapping old/fresh exposed views remain UNKNOWN because the current source is changed.

## Local cell-level capture

On 2026-09-05, local Edge CDP evidence was captured for the six retired cells and the ten previously omitted visible cells. The capture preserves rendered DOM, exact body text, structured rows, screenshots, request URLs, and SHA-256 hashes under `raw/` and the companion evidence files.

The captured set contains 1,144 rows: 320 retired-cell rows (194 scored, 126 missing) and 824 visible-cell rows (613 scored, 211 missing). The earlier expected visible-cell total was 681 (522 scored, 159 missing). The difference is attributable to 2024 September Pro 3: earlier fresh evidence recorded 9 rows (8 scored, 1 missing), while the current capture rendered 152 rows (99 scored, 53 missing). This is preserved as a source-state conflict.

The six retired cells also changed scored/missing splits between captures: March 2026 Semi Pro 2 and Semi Pro 3 are unchanged; April 2026 Semi Pro 2 is now 54/10 rather than 57/7; May 2026 Semi Pro 2 is now 28/28 rather than 29/27; May 2026 Semi Pro 3 is now 10/46 rather than 11/45; June 2026 Semi Pro 2 is now 25/23 rather than 24/24. Row totals remain 320.
