# Phase 99 KWT course-rating approval review

Status: **REVIEW ONLY — NO RATINGS APPROVED OR PUBLISHED**

Source checkpoint: `75da6c9d5d01e7849bb2caa04397ef17cc555faf`
Calculation package: `e2f53406-75b7-5acb-a3e9-9bec0d39421b`

## Decision summary

- KWT-only ratings reviewed: **78**
- Statistically ready: **72**
- Provisional and excluded from personal indexes: **6**
- Recommended HOLD: **74**
- Recommended INVESTIGATE: **4**
- Recommended APPROVE: **0**
- Unpublished index candidates depending on these ratings: **157**

The 72 ready ratings meet the approved sample, distinct-player, concentration, and positive-slope requirements. They are not formally publishable because every row still carries the common blockers **UNRESOLVED_SOURCE_EXCEPTIONS**, **MISSING_APPROVED_EFFECTIVE_DATE**, and **EXPLICIT_REVIEW_APPROVAL_REQUIRED**. The six provisional ratings remain on HOLD because they have fewer than 50 qualifying rounds.

## Formula and version checks

- Differential: `(score - course_rating) * 8.515 / course_slope`
- Differential model: `krys-handicap-candidate-a-v1`
- Reference slope: **8.515**
- Negative scores: preserved by the existing engine and source package.
- Easy and Hard: reviewed independently.
- Source: corrected KWT provenance only; Weekly evidence contributes zero personal-index rows.
- Effective dates: none fabricated; all remain unset.

## Diagnostic findings

The following are statistical review diagnostics only, not new policy gates:

- Course-rating values outside two sample standard deviations: Shangri-La Easy, Forgotten Fairyland Easy, Alice's Adventures in Wonderland Hard.
- Slope values outside two sample standard deviations: Hollywood Hard, Bogey's Bonanza Hard, Original Gothic Easy.
- These rows are marked INVESTIGATE. They remain unpublished and do not enter Production.

## Complete review table

| Course | Difficulty | Rating | Slope | Rounds | Players | Max player share | Confidence | Index candidates | Recommendation | Diagnostic flags |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|---|
| 20,000 Leagues Under The Sea | easy | -23.364 | 5.85 | 177 | 100 | 1.70% | READY | 7 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| 20,000 Leagues Under The Sea | hard | -19.182 | 8.741 | 177 | 100 | 1.70% | READY | 6 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| 8-Bit Lair | easy | -21.8 | 9.34 | 163 | 94 | 1.80% | READY | 5 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| 8-Bit Lair | hard | -18.75 | 12.572 | 163 | 94 | 1.80% | READY | 7 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Alfheim | easy | -21.185 | 6.502 | 221 | 117 | 1.80% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Alfheim | hard | -21.667 | 9.065 | 221 | 117 | 1.80% | READY | 7 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Arizona Modern | easy | -27.381 | 5.571 | 174 | 97 | 1.70% | READY | 11 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Arizona Modern | hard | -22.714 | 9.289 | 174 | 97 | 1.70% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Atlantis | easy | -25.148 | 6.444 | 223 | 110 | 1.80% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Atlantis | hard | -17.556 | 10.327 | 223 | 110 | 1.80% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Around The World | easy | -23.048 | 7.461 | 174 | 103 | 1.70% | READY | 14 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Around The World | hard | -15.762 | 10.371 | 174 | 103 | 1.70% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Bogey's Bonanza | easy | -25.37 | 7.96 | 224 | 112 | 1.80% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Bogey's Bonanza | hard | -22.444 | 13.355 | 224 | 112 | 1.80% | READY | 8 | INVESTIGATE | SLOPE_2SD_DIAGNOSTIC;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Cherry Blossom | easy | -27.519 | 5.932 | 220 | 104 | 1.80% | READY | 20 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Cherry Blossom | hard | -21.704 | 11.208 | 220 | 104 | 1.80% | READY | 25 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Crystal Lair | easy | -24.538 | 9.123 | 101 | 67 | 2.00% | READY | 4 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Crystal Lair | hard | -20.692 | 11.692 | 101 | 67 | 2.00% | READY | 4 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| El Dorado | easy | -23.862 | 8.024 | 234 | 111 | 1.70% | READY | 5 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| El Dorado | hard | -18.172 | 11.048 | 234 | 111 | 1.70% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Viva Las Elvis | easy | -21.158 | 7.431 | 154 | 85 | 1.90% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Viva Las Elvis | hard | -19.895 | 11.167 | 154 | 85 | 1.90% | READY | 4 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Forgotten Fairyland | easy | -28.75 | 8.234 | 62 | 62 | 1.60% | READY | 2 | INVESTIGATE | COURSE_RATING_2SD_DIAGNOSTIC;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Forgotten Fairyland | hard | -15.75 | 10.089 | 62 | 62 | 1.60% | READY | 1 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Gardens of Babylon | easy | -26.143 | 8.037 | 226 | 110 | 1.80% | READY | 31 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Gardens of Babylon | hard | -19.5 | 11.204 | 226 | 110 | 1.80% | READY | 29 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Holiday Hideaway | easy | -19.053 | 7.072 | 154 | 88 | 1.90% | READY | 3 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Holiday Hideaway | hard | -14.158 | 11.405 | 154 | 88 | 1.90% | READY | 3 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Hollywood | easy | -21.167 | 7.754 | 46 | 46 | 2.20% | PROVISIONAL | 0 | HOLD | PROVISIONAL_SAMPLE;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Hollywood | hard | -16.667 | 13.428 | 46 | 46 | 2.20% | PROVISIONAL | 0 | HOLD | PROVISIONAL_SAMPLE;SLOPE_2SD_DIAGNOSTIC;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Ice Lair | easy | -20.828 | 6.739 | 236 | 103 | 2.10% | READY | 25 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Ice Lair | hard | -16.69 | 9.829 | 236 | 103 | 2.10% | READY | 26 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Journey to the Center of the Earth | easy | -21.6 | 6.046 | 204 | 106 | 2.00% | READY | 13 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Journey to the Center of the Earth | hard | -18.24 | 9.318 | 204 | 106 | 2.00% | READY | 13 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Labyrinth | easy | -23.455 | 8.195 | 270 | 113 | 1.90% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Labyrinth | hard | -18.727 | 11.235 | 270 | 113 | 1.90% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Laser Lair | easy | -25.414 | 7.144 | 241 | 114 | 1.70% | READY | 11 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Laser Lair | hard | -22.793 | 10.756 | 241 | 114 | 1.70% | READY | 12 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Mars Gardens | easy | -21.895 | 6.85 | 156 | 96 | 1.90% | READY | 13 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Mars Gardens | hard | -16.842 | 10.579 | 156 | 96 | 1.90% | READY | 14 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Mount Olympus | easy | -24 | 7.165 | 115 | 78 | 1.70% | READY | 7 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Mount Olympus | hard | -17.857 | 8.875 | 115 | 78 | 1.70% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Meow Wolf | easy | -21.889 | 5.728 | 149 | 85 | 2.00% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Meow Wolf | hard | -18.889 | 10.453 | 149 | 85 | 2.00% | READY | 6 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Myst | easy | -25.379 | 6.451 | 237 | 108 | 1.70% | READY | 6 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Myst | hard | -20.172 | 9.012 | 237 | 108 | 1.70% | READY | 12 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Original Gothic | easy | -20.591 | 4.363 | 180 | 109 | 1.70% | READY | 13 | INVESTIGATE | SLOPE_2SD_DIAGNOSTIC;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Original Gothic | hard | -19.955 | 8.543 | 180 | 109 | 1.70% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Quixote Valley | easy | -17.615 | 5.046 | 209 | 106 | 1.90% | READY | 6 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Quixote Valley | hard | -19.385 | 9.806 | 209 | 106 | 1.90% | READY | 7 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Raptor Cliff's | easy | -22.211 | 9.053 | 152 | 78 | 2.00% | READY | 6 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Raptor Cliff's | hard | -13.895 | 12.197 | 152 | 78 | 2.00% | READY | 5 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Shangri-La | easy | -30.067 | 7.985 | 122 | 89 | 1.60% | READY | 5 | INVESTIGATE | COURSE_RATING_2SD_DIAGNOSTIC;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Shangri-La | hard | -23 | 12.328 | 122 | 89 | 1.60% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Seagull Stacks | easy | -21.821 | 4.969 | 231 | 117 | 1.70% | READY | 12 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Seagull Stacks | hard | -16.679 | 9.497 | 231 | 117 | 1.70% | READY | 15 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Sweetopia | easy | -19.909 | 6.699 | 176 | 99 | 1.70% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Sweetopia | hard | -19.045 | 10.125 | 176 | 99 | 1.70% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tiki à Coco | easy | -20.333 | 6.721 | 49 | 49 | 2.00% | PROVISIONAL | 0 | HOLD | PROVISIONAL_SAMPLE;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tiki à Coco | hard | -16.333 | 9.844 | 49 | 49 | 2.00% | PROVISIONAL | 0 | HOLD | PROVISIONAL_SAMPLE;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tokyo | easy | -22.462 | 6.471 | 105 | 72 | 1.90% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tokyo | hard | -15.846 | 10.418 | 105 | 72 | 1.90% | READY | 3 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tethys Station | easy | -25.15 | 7.351 | 164 | 93 | 1.80% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tethys Station | hard | -19.6 | 11.466 | 164 | 93 | 1.80% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tourist Trap | easy | -22.321 | 4.882 | 230 | 110 | 1.70% | READY | 29 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Tourist Trap | hard | -18.714 | 7.514 | 230 | 110 | 1.70% | READY | 31 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Upside Town | easy | -22.667 | 7.708 | 144 | 78 | 2.10% | READY | 12 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Upside Town | hard | -19.667 | 11 | 144 | 78 | 2.10% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Venice | easy | -19.519 | 6.265 | 217 | 101 | 1.80% | READY | 9 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Venice | hard | -17.769 | 9.797 | 215 | 101 | 1.90% | READY | 7 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Wallace & Gromit | easy | -24.731 | 7.614 | 215 | 98 | 1.90% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Wallace & Gromit | hard | -15.538 | 9.943 | 215 | 98 | 1.90% | READY | 10 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Alice's Adventures in Wonderland | easy | -21.5 | 7.092 | 49 | 49 | 2.00% | PROVISIONAL | 0 | HOLD | PROVISIONAL_SAMPLE;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Alice's Adventures in Wonderland | hard | -13 | 11.224 | 49 | 49 | 2.00% | PROVISIONAL | 0 | HOLD | PROVISIONAL_SAMPLE;COURSE_RATING_2SD_DIAGNOSTIC;QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Widow’s Walkabout | easy | -24.75 | 6.762 | 160 | 89 | 1.90% | READY | 12 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Widow’s Walkabout | hard | -18.5 | 9.888 | 160 | 89 | 1.90% | READY | 8 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Temple at Zerzura | easy | -25.269 | 8.147 | 212 | 103 | 1.90% | READY | 26 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |
| Temple at Zerzura | hard | -16.808 | 10.081 | 212 | 103 | 1.90% | READY | 26 | HOLD | QUARANTINED_EVIDENCE_REQUIRES_REVIEW |

Provenance for every row is the corrected Phase 68 KWT package. Each source reference was recovered in the committed manifest; quarantined evidence counts remain visible for review rather than being silently discarded.

## Safe next step

Review the 72 ready rows and the six provisional rows through the approval ledger. Resolve source exceptions and choose approved effective-period metadata without inventing historical dates. Only after explicit rating approval should a separate controlled transaction be prepared for rating publication and the 157 unpublished index snapshots. No Production change is authorized by this package.
