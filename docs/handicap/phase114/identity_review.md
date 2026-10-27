# Phase 114 — corrected Season 14 identity review

## Result

The Phase 113 exact-name search was too strict. This correction used the owner-supplied mappings, existing canonical identity links, verified aliases, and unique encoding-normalized Global Player evidence. It does not create accounts, use Discord-only identifiers as KWT identifiers, or merge on name similarity alone.

| Original KWT name | Weeks affected | Pairs / observations | Ranked canonical candidate | Evidence | Confidence | Local action |
|---|---|---:|---|---|---|---|
| `BadWolff¿` | S14W05, S14W09 | 2 / 4 | `BadWolff�` — `9976197b-dc3d-4cf6-9200-603a3d1acbf9` | Unique verified screen-name evidence after encoding normalization | HIGH | AUTO-RESOLVED LOCALLY |
| `Chelle¿` | S14W05–S14W08, S14W10, S14W12 | 6 / 12 | `Chelle�` — `e2af01d7-90d5-4963-9d9f-0493df9fefb2` | Unique verified screen-name evidence after encoding normalization | HIGH | AUTO-RESOLVED LOCALLY |
| `Honeybee1998` | S14W07 | 1 / 2 | None | No authoritative canonical candidate | NONE | QUARANTINE |
| `Laurent¿¿` | S14W05–S14W12 | 8 / 16 | `LAURENT` — `fbd60e4a-9d17-4556-9062-dc005a0c5723` | Unique verified alias after encoding normalization | HIGH | AUTO-RESOLVED LOCALLY |
| `PaulV-PPP ¿¿` | S14W05–S14W09, S14W11 | 6 / 12 | `PAULV-PPP ��` — `eb95bd85-5cee-437b-b458-abedf5a368d3` | Unique verified screen-name evidence after encoding normalization | HIGH | AUTO-RESOLVED LOCALLY |
| `Spicy - DawnSophia` | S14W05, S14W06, S14W08, S14W09, S14W12 | 5 / 10 | `Spicy - DawnSophia` — `95b55b59-45bc-4eaa-a3fe-8c89ab150488` | Exact verified alias | HIGH | AUTO-RESOLVED LOCALLY |
| `Stephen1D47` | S14W07, S14W08, S14W10, S14W11 | 4 / 8 | `Stephen1d47` — no player UUID | Discord member name only; `player_id` is NULL | NON-AUTHORITATIVE | QUARANTINE |
| `musical_atv ¿` | S14W07, S14W10, S14W11 | 3 / 6 | `MUSICAL_ATV �` — `c4198d7c-dbe7-442f-bc89-908b3b1803d0` | Unique verified screen-name evidence after encoding normalization | HIGH | AUTO-RESOLVED LOCALLY |
| `peach¿` | S14W05, S14W07 | 2 / 4 | `PEACH` — `d74bba7c-a0a8-4976-b7f7-1b9deb23b8b5` | Unique verified alias after encoding normalization | HIGH | AUTO-RESOLVED LOCALLY |
| `plucky¿` | S14W05–S14W12 | 8 / 16 | `PLUCKY�` — `c7c85811-6bb8-4824-a288-2f3ae0af89c9` | Unique verified screen-name evidence after encoding normalization | HIGH | AUTO-RESOLVED LOCALLY |
| `¿¿¿¿¿¿` | S14W11, S14W12 | 2 / 4 | `JULIAN` — `57d7ddc3-1cd4-4e17-97cf-30343e26ced0` | Owner-supplied lead; exact Discord ID is linked to canonical `JULIAN` and verified `JULIAN`/`JULIAN1830` aliases, but no KWT source evidence links the corrupted value | LEAD_NOT_CONFIRMED | QUARANTINE |

## Reconciliation of the nine earlier resolutions

The nine Phase 113 resolutions remain resolved, but three canonical IDs are corrected through authoritative identity links or owner evidence:

| Historical name | Correct canonical player | Basis | Correction |
|---|---|---|---|
| `Andrew_Holmes` | `WILMA_FINGERDOO` — `797063d6-62f9-414f-bd92-e18780ed8e52` | Owner-supplied mapping plus archived identity link | Replaces archived `ANDREW_HOLMES` ID |
| `bigja33` | `BIGJA` — `69c0daa5-70b8-481b-94e5-a9d033bc75fb` | Owner-supplied mapping plus archived identity link | Replaces archived `BIGJA33` ID |
| `WendyW(Wyndemere2020)` | `Wendyw` — `7befb54f-6eec-4c7c-9881-c75d1acfb8d8` | Existing verified identity link | Replaces archived historical ID |

The other six earlier resolutions remain supported by unique case-insensitive canonical screen-name evidence. `Raccoons Whisker` remains linked to its exact canonical player; conflicting Discord identifiers were not used.

## Counts

- Total official Season 14 pairs: **371**.
- Resolved locally: **364 pairs / 728 observations**.
- Remaining quarantine: **7 pairs / 14 observations** across **3 names**.
- Reconciled identity names: **17 resolved, 3 unresolved**.
- The Julian candidate is recorded as a ranked lead only; it is not applied to the import package.
- Candidate fingerprints: **728 unique**, with **0** collisions against Phase 68.
- Weekly rows in this package: **0**; THE_WEEKLY remains course-rating-only.

The Phase 112 package and existing Production data are unchanged. This Phase 114 package is local-only and still requires schema-contract review, a disposable PostgreSQL transaction test, and separate Production authorization before any import.
