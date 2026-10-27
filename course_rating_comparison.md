# Weekly evidence comparison (Phase 54 local evidence completion)

This is a local, provisional evidence comparison. It is not a Production rating publication and it cannot feed personal Handicap histories.

## Archive and manifest

- The preserved package contains 56 manifest entries: 52 event screenshots plus four supplementary context images.
- The original package hashes were verified 56/56 before Phase 53. The 52 event screenshots remain available in phase52-input/weekly_screenshots.
- Every manifest entry is classified in weekly_manifest_status.csv. Supplementary captures are SUPERSEDED/context-only and are not additional observations.
- The S20W07 replacement Elite screenshot is retained. The superseded capture containing the incomplete row and tournament penalty 99 is excluded.

## Phase 54 admitted evidence

- Phase 52's 23 verified S20W07 BHH rows were reconciled into the complete S20W07 transcription; the superseded Elite capture containing the penalty 99 remains excluded.
- S19W10 LBE/RCH contributes 158 verified course rows from 79 visually verified players across Amateur, Semi-Pro, Pro, and Elite blocks.
- Three S19W10 rows remain quarantined because the exact screen name is not recoverable from the supplied image: one ambiguous, one unreadable, and one truncated.
- S21W05 GLE/HWH contributes 184 verified course rows from 92 visually transcribed players; four visible names remain quarantined.
- S20W05 MGE/ZZH contributes 172 verified course rows from 86 visually transcribed players; two visible names remain quarantined.
- S20W06 BHE/QVH contributes 170 verified course rows from 85 visually transcribed players; three visible names remain quarantined.
- S20W07 ALE/BHH contributes 160 verified course rows from 80 visually transcribed players; three visible names remain quarantined.
- Other accessible screenshots were reviewed and classified, but their remaining rows are not silently admitted until each name, course column, and score is visually confirmed. Their exact files and reason are in weekly_manifest_status.csv and weekly_evidence_exceptions.csv.

## Source separation

Weekly rows have personal_handicap_eligible=false and are eligible only for course-rating/slope evidence. No Weekly identity is merged with a Krys Leagues player. KWT data remains a separate source. Mighty Cocobot/personal-best evidence is not imported as ordinary rounds.

## Provisional calculations

The existing legacy simulation is used unchanged: Course Rating is the mean of the lowest 12% of observed scores and Slope is field mean minus elite mean. Under 20 rounds is insufficient, 20–49 is provisional, and 50+ is potentially ready for simulation only. These thresholds and formulas are not approved for Production.

Raptor Cliff's Hard is materially different in the admitted populations: KWT-only mean -1.859, elite benchmark -13.900, slope 12.041; Weekly-only mean -6.937, elite benchmark -16.300, slope 9.363. The Weekly field is lower-scoring and smaller, so combining it changes the provisional distribution but does not by itself prove greater fairness. The combined read-only comparison is -3.517 mean, -15.067 elite benchmark, and 11.550 slope over 242 observations.

The newly expanded BHE, GLE/HWH, ALE/BHH, and MGE/ZZH Weekly samples are course-rating-only simulations. BHE has 85 Weekly rounds and is potentially ready under the provisional sample threshold; its KWT+Weekly row is withheld because the local package does not contain the raw KWT scores needed to recompute the combined elite benchmark after the Weekly sample changed. GLE has 92 Weekly rounds and is potentially ready as a Weekly-only simulation. ALE has 80 Weekly rounds and BHH has 80 Weekly rounds, both potentially ready under the provisional sample threshold. BHH's KWT+Weekly row is withheld for the same raw-KWT reason.

LBE/RCH combined rows use a read-only Production aggregate comparison plus the locally admitted Weekly rows; the raw KWT export is not copied into the evidence package. This is explicitly labeled in course_rating_comparison.csv and is not an import.

For KWT + Weekly rows, distinct_players is the sum of source-population counts, not a cross-source identity merge.

## Remaining evidence gap

The supplied screenshots are readable as images, but full row-level transcription is not complete for the remaining event groups. No uncertain names or scores were invented. Gloop Lair Hard remains unsupported by supplied Weekly evidence.
