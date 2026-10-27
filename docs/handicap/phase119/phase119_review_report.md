# Phase 119 Handicap fairness diagnostics

## Status

**PARTIAL — deterministic local fairness review complete; no approval or publication.**

All outputs are local-only diagnostics. Existing Phase 105, Phase 117, and Phase 118 Production records were not modified.

## Evidence and calculation boundary

- Corrected historical KWT rows: **13550**.
- Phase 117 Season 14 rows: **728**.
- Combined KWT rows loaded: **14278**; rows used after excluding incomplete groups: **14276**; complete official pairs: **7138**; incomplete groups excluded: **2**.
- Verified THE_WEEKLY rows: **844**; Weekly rows used in personal indexes: **0**.
- Index calculation remains Candidate A: `(score - course rating) × 8.515 / course slope`.
- Chronology remains **OFFICIAL_KWT_SEQUENCE**: Season → Week → Easy → Hard.

## Large player movements

- **YUK1N** (21be1be9-9b32-4f82-9c48-b0811e0f975e): -0.46 → 4.94 (+5.4); counterfactual with old ratings 1.712; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **LAKE** (235b5480-f2fe-4c81-b843-ff34743e882b): 3.51 → 2.191 (-1.319); counterfactual with old ratings 3.509; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 0; recommendation **ACCEPT FOR REVIEW**.
- **The Real JB** (55d9c7f0-ba6b-4245-91de-a90189276744): 4.4 → 3.088 (-1.312); counterfactual with old ratings 3.697; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **BEARDED_DRIVER** (5f293732-47a3-4407-a8a6-887d8d885c61): 12.93 → 14.248 (+1.318); counterfactual with old ratings 12.618; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 6; recommendation **ACCEPT FOR REVIEW**.
- **ROKNHORSEBRAT** (6d74f565-dc1d-41e3-81e5-fd7e6b38e28d): 7.88 → 10.028 (+2.148); counterfactual with old ratings 7.633; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **TRICKYDICKY** (6f38b6b4-46bf-4ae6-9bb5-2230be6fb3f4): 2.1 → 4.204 (+2.104); counterfactual with old ratings 1.927; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **awesome_kris** (706ba7c0-9efd-4b2c-9366-94b6354a82ce): 6.16 → 7.679 (+1.519); counterfactual with old ratings 6.102; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **Jennem** (72bd3518-f11a-458c-a37f-3fb90cf0c5c8): 3.7 → 7.046 (+3.346); counterfactual with old ratings 5.867; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **EARTHLING** (78b95430-f473-41a2-b770-5bb5c36545e4): 8.77 → 11.328 (+2.558); counterfactual with old ratings 11.237; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **KD** (83343490-426d-4275-a557-b1fab48b76f0): 8.03 → 9.681 (+1.651); counterfactual with old ratings 9.444; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **KCROB** (85409f47-fd51-4c66-b0e5-b8964c15e0a7): 3.74 → 4.885 (+1.145); counterfactual with old ratings 4.885; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 2; recommendation **ACCEPT FOR REVIEW**.
- **EL JORGE** (8832eacf-2433-4ea3-b97e-5d0d25da3099): -0.82 → 0.928 (+1.748); counterfactual with old ratings 1.143; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **freitag68** (af550593-9ec2-4530-9b5c-757d9b6b3774): 4.49 → 7.032 (+2.542); counterfactual with old ratings 4.492; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 0; recommendation **ACCEPT FOR REVIEW**.
- **Nic79** (b48d4e30-de56-4864-b31d-e9b2880cee01): 10.01 → 8.123 (-1.887); counterfactual with old ratings 10.026; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **deebee** (b77d2644-31eb-4b82-9f76-f124a25b9a06): 2.49 → 5.341 (+2.851); counterfactual with old ratings 3.666; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **5.0JIM** (b9150f7d-f024-4f56-9af8-a66fe99cf7a8): 1.62 → 0.071 (-1.549); counterfactual with old ratings 0.423; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **Dandnt65** (bed410dd-2b89-4db3-8fe4-8226c21c3f5f): 8.54 → 11.017 (+2.477); counterfactual with old ratings 10.409; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **Neo Impossible** (c19d0b98-ed0b-462c-8b31-6b54221127d9): 4.44 → 2.867 (-1.573); counterfactual with old ratings 2.724; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **MUSICAL_ATV �** (c4198d7c-dbe7-442f-bc89-908b3b1803d0): 7.77 → 6.613 (-1.157); counterfactual with old ratings 7.664; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 6; recommendation **ACCEPT FOR REVIEW**.
- **PLUCKY�** (c7c85811-6bb8-4824-a288-2f3ae0af89c9): 4.06 → 5.49 (+1.43); counterfactual with old ratings 3.471; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **PRINCESS_BANKSHOT** (cb01e4af-b57b-4424-a00f-7697f1c5f90f): 4.27 → 2.612 (-1.658); counterfactual with old ratings 2.978; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **FAR CANAL** (cfcd0387-84ad-417b-92fc-b4653574e66d): 5.77 → 4.687 (-1.083); counterfactual with old ratings 5.769; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 4; recommendation **ACCEPT FOR REVIEW**.
- **CHIPNPUTT** (d38c0220-8a80-45a6-86e8-d495f523d5ab): 2.84 → 5.187 (+2.347); counterfactual with old ratings 3.274; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **Shaggy960** (d435277d-c5dd-4a23-8edc-bea2729d7673): 9.05 → 7.488 (-1.562); counterfactual with old ratings 8.307; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **INDY** (d4e37778-8a69-4878-9ec3-6b6fddb03425): -1.19 → -2.319 (-1.129); counterfactual with old ratings -2.227; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **SERENITYMOON** (db88e65e-5b26-4627-9331-b07738276116): 6.76 → 7.906 (+1.146); counterfactual with old ratings 6.604; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **BUBBAFRAME** (dede8d19-e92b-4e3e-8af3-4050b8e40fd2): 0.68 → 4.034 (+3.354); counterfactual with old ratings 0.675; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 0; recommendation **ACCEPT FOR REVIEW**.
- **StoneyMan69** (dfdd9e81-01ff-4284-b910-acdf41ee7bdd): 7.22 → 6.009 (-1.211); counterfactual with old ratings 4.976; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **ULTRAFOX_LYNNE** (e249815d-ac23-4ef7-9c20-7ed9ba0c57c4): 10.05 → 14.529 (+4.479); counterfactual with old ratings 12.879; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **KILLERBEE** (e2741a95-19e9-440c-a605-f1c1498aa5c1): 10.23 → 15.374 (+5.144); counterfactual with old ratings 14.707; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **Chelle�** (e2af01d7-90d5-4963-9d9f-0493df9fefb2): 6.61 → 4.258 (-2.352); counterfactual with old ratings 7.314; cause **RATING_OR_ELIGIBILITY_CHANGE**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **Sj_76** (ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0): 12 → 14.583 (+2.583); counterfactual with old ratings 15.626; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.
- **D3BB13** (f1bab752-d5cf-4001-b2ad-bafd6af83d8b): 8.13 → 5.985 (-2.145); counterfactual with old ratings 5.81; cause **NEW_S14_SCORES_OR_LATEST_WINDOW**; new Season 14 rounds in revised latest ten 10; recommendation **ACCEPT FOR REVIEW**.

Cause counts: {"RATING_OR_ELIGIBILITY_CHANGE":17,"NEW_S14_SCORES_OR_LATEST_WINDOW":16}. Every flagged player's round-level membership, exact score, course, rating, slope, differential, source, season/week, and window transition is in `phase119_movement_rounds.csv`.

The three named movements requested for attention are preserved exactly in the summary: YUK1N, KILLERBEE, and ULTRAFOX_LYNNE. A large movement is not treated as a calculation defect solely because its magnitude is large; it is flagged for human fairness review.

## Course evidence review

- Phase 118 modeled entries: **81**.
- Official catalog: **82** entries.
- Missing modeled entry: **GLH — Gloop Lair hard**.
- The missing entry explains the prior 78 + 2 + 1 = 81 reconciliation: the remaining catalog entry is unrated/missing evidence, so it is not a fourth modeled status row.
- All course-level recommendations are in `phase119_course_fairness_review.csv`.

### Raptor Cliff's Hard

KWT and Weekly are reported separately. Current KWT+Season 14 evidence is 152 rounds, rating -13.895, slope 12.197; Weekly-only evidence is 79 rounds, rating -16.3, slope 9.363. The cohorts differ and are not interchangeable. Recommendation: **INVESTIGATE**, not automatic blending or hardest-course designation.

### Diagnostic outliers

- **Bogey's Bonanza_hard**: rating -22.444, slope 13.355, sample 224, distinct players 112; no arithmetic or source-boundary failure was found in this local run; recommendation **INVESTIGATE**.
- **Forgotten Fairyland_easy**: rating -28.917, slope 8.127, sample 100, distinct players 71; no arithmetic or source-boundary failure was found in this local run; recommendation **INVESTIGATE**.
- **Original Gothic_easy**: rating -20.591, slope 4.363, sample 180, distinct players 109; no arithmetic or source-boundary failure was found in this local run; recommendation **INVESTIGATE**.
- **Shangri-La_easy**: rating -29.81, slope 7.342, sample 171, distinct players 100; no arithmetic or source-boundary failure was found in this local run; recommendation **INVESTIGATE**.

### Gloop Lair Easy

Weekly-only evidence is 92 rounds from 92 source players, with simulated rating -28.25 and slope 7.63. That satisfies the proposed sample-size and distinct-player diagnostics for a **course-rating-only ACCEPT FOR REVIEW** candidate, but it is not eligible to enter personal Handicap indexes. Gloop Lair Hard is the missing official catalog entry and remains **HOLD / UNRATED**.

## Safety checks

- Quarantined Season 14 player-week pairs used: **0**.
- Weekly rows used in player indexes: **0**.
- Unapproved rating references used in revised indexes: **0**; only revised READY_CANDIDATE KWT ratings were used.
- Negative scores were retained as numeric scores.
- Existing records and snapshots were not changed.

## Decision requested from Krys

1. Review the 33 named movement rows and their round-level evidence; accept only those that are explainable after human review.
2. Keep Raptor Cliff's Hard in **INVESTIGATE** until KWT versus Weekly cohort comparability is decided.
3. Treat Gloop Lair Easy as **course-rating-only ACCEPT FOR REVIEW**, never a personal-index rating until a permitted KWT/policy path exists.
4. Keep the missing **GLH — Gloop Lair hard** unrated.
5. Do not publish any rating or index from these diagnostics.

## Generated artifacts

- `docs/handicap/phase119/phase119_movement_summary.csv`
- `docs/handicap/phase119/phase119_movement_rounds.csv`
- `docs/handicap/phase119/phase119_course_fairness_review.csv`
- `docs/handicap/phase119/phase119_coverage_reconciliation.csv`
