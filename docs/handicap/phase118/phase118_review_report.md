# Phase 118 updated KWT course-rating and player-index review

## Verified inputs

- Production postflight: **4 calculation runs, 28,672 provenance rows, 410 rating snapshots, 157 index snapshots, 844 THE_WEEKLY rows, zero publishable rows**.
- Historical corrected KWT source: **13550** rows from Phase 68.
- Phase 117 Season 14 Weeks 5–12 KWT source: **728** rows; **728** unique fingerprints; zero overlap with Phase 68.
- Combined KWT observations used: **14276**.
- Weekly observations used for course-rating-only simulations: **844**; duplicate fingerprints excluded: **0**; personal-index rows used: **0**.
- Complete KWT player-week pairs: **7138**; incomplete/duplicate pairs excluded from personal indexes: **2**.

## Revised KWT-only readiness

- READY_CANDIDATE: **78**.
- PROVISIONAL: **2**.
- UNRATED/BLOCKED_CONFIDENCE: **1**.
- These are local simulations, not formal approvals. The six historically provisional entries remain ineligible unless the revised evidence independently satisfies all thresholds.

## Player-index comparison

- Baseline Phase 105 candidates: **157**.
- Revised local numeric candidates: **166**.
- Blocked or ineligible players: **0**.
- Numeric movements at or above 0.01: **92**.
- Movements at or above 1.00 index point requiring human review: **33**.
- All revised calculations use Candidate A with reference slope **8.515**, KWT only, and Season → Week → Easy → Hard ordering. Weekly rows used: **0**.

## Interpretation

The comparison CSVs separate KWT-only, Weekly-only, and KWT+Weekly course models. Weekly source populations are never merged into personal identity or index calculations. A changed rating or index is a local evidence effect, not an approval decision. Any candidate with incomplete chronology, invalid rating, near-zero slope, concentration failure, unresolved identity, or missing qualifying rounds remains blocked.

## Formal status

**PARTIAL — LOCAL REVIEW READY, NOT PUBLISHABLE.** The corrected evidence is sufficient for deterministic local comparison, but formal rating approval, diagnostic dispositions, effective-period approval, and index publication remain separate gates. No Production rows were changed and no DRAFT/QUARANTINED package was installed.
