# Targeted Amateur recovery package report

Generated: 2026-09-08T12:14:14.754Z

This derived package extends the existing repaired package without overwriting it. Recovery used only the public server-rendered Monthlies APEX page. No admin site or Production SQL was used.

## Proven source IDs

| Division | Source ID | Discovery evidence |
|---|---:|---|
| Amateur 1 | 26 | September 2024 period 55 rendered heading `Amateur 1 Leaders` |
| Amateur 2 | 27 | September 2024 period 55 rendered heading `Amateur 2 Leaders` |
| Amateur 3 | 28 | September 2024 period 55 rendered heading `Amateur 3 Leaders` |

## Targeted cells

| Period | Period ID | Division | Division ID | Course observations | Played/scored | Blank/unplayed evidence |
|---|---:|---|---:|---:|---:|---:|
| 2024 August | 54 | Amateur 2 | 27 | 75 | 55 | 20 |
| 2024 August | 54 | Amateur 3 | 28 | 67 | 54 | 13 |
| 2024 September | 55 | Amateur 1 | 26 | 98 | 67 | 31 |
| 2024 September | 55 | Amateur 2 | 27 | 106 | 71 | 35 |
| 2024 September | 55 | Amateur 3 | 28 | 74 | 56 | 18 |
| 2024 October | 56 | Amateur 2 | 27 | 90 | 42 | 48 |
| 2024 October | 56 | Amateur 3 | 28 | 90 | 55 | 35 |
| 2024 November | 57 | Amateur 2 | 27 | 138 | 80 | 58 |
| 2024 November | 57 | Amateur 3 | 28 | 74 | 12 | 62 |
| 2024 December | 58 | Amateur 2 | 27 | 82 | 44 | 38 |
| 2024 December | 58 | Amateur 3 | 28 | 82 | 55 | 27 |
| 2025 January | 81 | Amateur 1 | 26 | 114 | 69 | 45 |
| 2025 January | 81 | Amateur 2 | 27 | 90 | 63 | 27 |
| 2025 January | 81 | Amateur 3 | 28 | 98 | 59 | 39 |
| 2025 February | 101 | Amateur 2 | 27 | 66 | 30 | 36 |
| 2025 March | 121 | Amateur 2 | 27 | 42 | 32 | 10 |
| 2025 March | 121 | Amateur 3 | 28 | 82 | 30 | 52 |
| 2025 April | 141 | Amateur 1 | 26 | 90 | 54 | 36 |
| 2025 April | 141 | Amateur 2 | 27 | 82 | 72 | 10 |
| 2025 May | 161 | Amateur 1 | 26 | 58 | 44 | 14 |
| 2025 May | 161 | Amateur 2 | 27 | 50 | 40 | 10 |
| 2025 May | 161 | Amateur 3 | 28 | 58 | 22 | 36 |
| 2025 June | 181 | Amateur 1 | 26 | 58 | 43 | 15 |
| 2025 June | 181 | Amateur 2 | 27 | 50 | 18 | 32 |
| 2025 June | 181 | Amateur 3 | 28 | 50 | 32 | 18 |
| 2025 July | 201 | Amateur 1 | 26 | 74 | 34 | 40 |
| 2025 July | 201 | Amateur 2 | 27 | 90 | 35 | 55 |
| 2025 August | 221 | Amateur 1 | 26 | 98 | 61 | 37 |
| 2025 August | 221 | Amateur 2 | 27 | 34 | 13 | 21 |
| 2025 September | 241 | Amateur 2 | 27 | 50 | 30 | 20 |
| 2025 October | 261 | Amateur 1 | 26 | 58 | 29 | 29 |
| 2025 October | 261 | Amateur 2 | 27 | 74 | 31 | 43 |
| 2025 November | 281 | Amateur 1 | 26 | 82 | 72 | 10 |
| 2025 December | 301 | Amateur 1 | 26 | 42 | 20 | 22 |
| 2025 December | 301 | Amateur 2 | 27 | 50 | 29 | 21 |

## Counts

- Targeted Amateur course observations: **2,616** (1,553 played/scored plus 1,063 blank/unplayed evidence slots).
- Targeted numeric scores: **1,553** (Amateur 1: 493; Amateur 2: 685; Amateur 3: 375).
- Targeted blank/unplayed evidence: **1063**. No blank score row is in the import-ready score payload.
- Targeted numeric sign counts: **1256 negative, 44 zero/even-par, 253 positive**.
- Extended import-ready numeric payload: **19015**.
- Extended blank/unplayed evidence: **5972**.
- Extended duplicate logical keys/fingerprints: **0 / 0**.

## Identity preview — newly introduced scored names

- New names: **21**; exact: **8**; existing alias/mapped: **5**; ambiguous: **4**; unresolved: **4**.
- New blocked scores: **46**.
- The full combined set is 192 scored historical names; 8 names are review-blocked for 46 scores.

## Semantics and exclusions

- Numeric scores, including zero, are importable played observations; negative scores are preserved unchanged.
- Blank/unplayed course slots are preserved only as evidence and are not score-import rows.
- Atlantis remains quarantined.
- January–July 2024 remain UNKNOWN with no observations fabricated.
- September 2026 and later remain excluded.
- Semi Pro 4 remains non-blocking because no participation is proven.

## Reproducibility artifacts

- Raw HTML/TXT/JSON and per-cell hashes: `completeness-recovery/amateur-recovery/public-targeted-http-v2/`.
- Derived package SHA-256 values are in `repaired-monthly-manifest.json`.
- Identity preview snapshot SHA-256 is in `amateur-identity-preview.json`.

## Gate

**IDENTITY REVIEW GATE** — 46 newly recovered numeric scores belong to four ambiguous or four unresolved source names. No import was run.
