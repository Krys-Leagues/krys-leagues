# Monthlies Historical Completeness — Final Review Before Source Repair

Capture date: 2026-09-07 (America/New_York)

This review is read-only. No Production SQL, Production write, historical import, deployment, identity change, or Monthly-site mutation was performed. The existing old CSV and manifest were not overwritten.

## 1–4. Remaining division IDs and targeted participation

The authenticated admin Leagues grid exposed these exact inactive labels and admin `Order` values. The grid did not expose a source-ID column. The preserved rendered Overall Leaders evidence was then checked for month-specific participation.

| division | admin order | source ID | proven participating months | current repair requirement |
|---|---:|---|---:|---|
| Semi Pro 4 | 45 | UNRESOLVED | None proven | Not required for current scope; do not infer that it never existed |
| Amateur 1 | 50 | UNRESOLVED | 10 months: 2024 Sep; 2025 Jan, Apr, May, Jun, Jul, Aug, Oct, Nov, Dec | Required; source ID must be resolved |
| Amateur 2 | 60 | UNRESOLVED | 16 months: 2024 Aug–Dec; 2025 Jan–Oct except Nov; 2025 Dec | Required; source ID must be resolved |
| Amateur 3 | 70 | UNRESOLVED | 9 months: 2024 Aug–Dec; 2025 Jan, Mar, May, Jun | Required; source ID must be resolved |

Participation is proven by exact `LEAGUE_NAME` rows in the saved Overall Leaders HTML. Repeated captures were deduplicated by period ID and label. Semi Pro 4 has no saved Overall Leaders row, trophy/result artifact, or tested division view proving participation in the preserved finalized scope. Details are in `participation-review.md` and `analysis/unresolved-division-participation.tsv`. No order value was treated as a source ID, and no ID was guessed.

Previously proven public/source IDs remain 21 Master, 22 Elite, 23 Pro 1, 24 Pro 2, 25 Pro 3, 113 Semi Pro 1, 114 Semi Pro 2, 115 Semi Pro 3, 81 Beginner, and 62 Welcome.
## 5–12. Recovery totals

No new rows were added in this review because the three required participating division IDs remain unresolved; Semi Pro 4 has no proven participation in scope. The public read-only recovery totals therefore remain:

- Total historical observations: **15,664**
- Played/scored: **11,727**
- Blank/unplayed: **3,937**
- Negative scores: **11,311**
- Malformed rows: **0**
- Duplicate fingerprints: **0**

The four unresolved divisions each have **0 observations recovered**, which means “not tested/recovered,” not “no data.”

## 13. PETERK9FLORIDA / Atlantis conflict

Cell: 2025 August, period 221, Elite, source division 22, `PETERK9FLORIDA`, source player ID 8108, Atlantis/easy.

- Old retained CSV: blank/unplayed; overall placement 5; courses played 8; total strokes -153.
- Durable earlier public capture: numeric **-23**.
- Three fresh independent public/APEX sessions: numeric **-26** in all three; each had 8 course tables and the same extracted course-table text hash.
- Fresh captures were started from separate in-memory web sessions, navigated to period 221, then requested the read-only Elite view. Session-specific HTML hashes differed as expected; structured target rows were equivalent.

Determination: **SOURCE CHANGED — REVIEW REQUIRED**. The current repeated snapshot is reproducible at `-26`; the earlier durable snapshot is preserved at `-23`; the old retained source is preserved as blank/unplayed. This is a substantive source discrepancy, not a reason to silently overwrite either source.

Evidence: `conflict-review.md`, `conflict-review/reproduction.tsv`, the three HTML/TXT/JSON captures, and `analysis/logical-comparison-changes.tsv`.

## 14–19. Logical old-vs-new reconciliation

The comparison uses period ID, source division ID, source player ID, course name, and difficulty as the logical key. Score semantics are compared separately; numeric zero remains scored, and blank remains blank/unplayed.

| classification | count |
|---|---:|
| Exact logical matches | **384** |
| Logical NEW rows | **15,279** |
| Logical OLD-only rows | **6,900** |
| Old blank → new scored | **1** |
| Old scored → new blank | **0** |
| Numeric score conflicts | **0** |

The apparent `384 exact / 15,280 new-not-in-old` result is fingerprint-oriented. Logical comparison moves one row out of NEW-only because the old and new rows share the same logical key but differ in score state. That one row is the Atlantis conflict above. Old rows not exactly represented are 6,901 = 6,900 old-only + 1 changed logical row.

- Player-name disagreements: **0**
- Division disagreements: **0**
- Duplicate fingerprints: **0** in old source and **0** in fresh source
- Malformed rows: **0**

No additional four-division rows can be claimed until source IDs are resolved.

## 20. January–July 2024

Periods 47–53 remain **UNKNOWN — NO OBSERVATIONS IMPORTED**. Existing public evidence shows zero rendered leader/course rows, but that is not affirmative evidence of no results. No new evidence in this review proves those months empty or recovers records.

## 21–24. Remaining UNKNOWN coverage and evidence

Remaining UNKNOWN coverage includes:

- January–July 2024: seven periods, with no observations imported.
- Amateur 1, Amateur 2, and Amateur 3: participation is proven for specific months, but source IDs remain unresolved and their targeted score recovery is not yet possible. Semi Pro 4 has no proven participation in the preserved scope and is not required for the current repair.
- The single Atlantis score conflict: current snapshot is reproducible, but the change from durable `-23` to current `-26` requires review.

New/changed review artifacts:

- `analysis/unresolved-division-id-resolution.tsv`
- `analysis/unresolved-division-participation.tsv`
- `analysis/unresolved-division-participation-summary.tsv`
- `participation-review.md`
- `analysis/logical-comparison-summary.tsv`
- `analysis/logical-comparison-changes.tsv`
- `conflict-review.md`
- `conflict-review/reproduce-conflict-http.ps1` (local parser/session fix; read-only)
- `conflict-review/repro-1-period-221-division-22.html`, `.txt`, `.json`
- `conflict-review/repro-2-period-221-division-22.html`, `.txt`, `.json`
- `conflict-review/repro-3-period-221-division-22.html`, `.txt`, `.json`
- `conflict-review/reproduction.tsv`
- `conflict-review/reproduction-summary.json`
- this report

SHA-256: all three fresh HTML captures have recorded hashes; all three extracted text hashes are identical; the local evidence ledger was regenerated after this report was written and verified with zero failures. No authentication credential, cookie, or session token was preserved.

## 25. Source-merge policy audit

The current analysis can preserve OLD-only, NEW-only, exact, blank/scored, and numeric-disagreement categories externally. The current importer/table cannot safely implement the complete policy without change: the table requires `score integer not null`, commit validation excludes blank/unplayed rows, fingerprints are globally unique, and each import stores one source SHA rather than an explicit multi-source provenance set. Therefore OLD-only rows can be preserved in a repaired evidence package, and NEW-only scored rows can be added only after review, but the existing import path must not be used for a merged package until schema/import design is approved. See `source-merge-policy-audit.md`.

## 26. Git status

Branch: `codex/monthlies-historical-completeness`

The dedicated worktree contains the uncommitted Monthlies evidence area only. `package.json` and `package-lock.json` are unchanged. No commit was made.

## 27. Process-corrected forward scope

Safe source-repair preparation may proceed using the preserved 15,664-observation package with explicit exclusions. Amateur 1–3 remain `TARGETED PENDING RECOVERY` and must be excluded from import until source IDs are verified. The old source, OLD-only rows, NEW-only rows, blank/unplayed slots, and the quarantined Atlantis drift must remain preserved. This does not authorize import or change the completeness review gate. See `process-correction.md`.

## 28. Final gate

**REVIEW GATE**

The gate cannot move to READY FOR SOURCE REPAIR because three required participating division source IDs remain unresolved and the Atlantis row has a preserved durable-versus-current score change. The logical comparison is documented and has no unresolved numeric disagreement within the current fresh source, but source recovery is not yet proven complete.

## 29. One next action

Obtain authoritative source IDs for Amateur 1–3 from a preserved admin LOV/source metadata response, then run only the proven participating month cells and review the Atlantis `-23` → `-26` provenance before source repair.








