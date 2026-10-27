# Phase 113 — Season 14 identity review

This ledger covers the 20 original names that were unresolved in the Phase 111 reconciliation. Phase 112 resolved nine of them using an exact case-insensitive match against the canonical `public.players.screen_name`; the Phase 112 exception file therefore contains the remaining 11 names only.

No fuzzy matching, Discord-ID matching, numeric-ID invention, or calendar-date inference was used.

| Original KWT name | Weeks affected | Pairs / observations | Potential canonical Global Player | Exact evidence and confidence | Decision |
|---|---|---:|---|---|---|
| `¿¿¿¿¿¿` | S14W11, S14W12 | 2 / 4 | None found | No exact canonical screen-name match; no authoritative source-player or round ID. | QUARANTINE |
| `Adamann` | S14W06 | 1 / 2 | `Adamann` — `f834c441-1e9a-4d72-b7cc-279cc3635b82` | Exact case-insensitive canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |
| `Andrew_Holmes` | S14W05, S14W08 | 2 / 4 | `ANDREW_HOLMES` — `941dfbd4-a394-417f-a942-d47ce09cee77` | Exact case-insensitive canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |
| `BadWolff¿` | S14W05, S14W09 | 2 / 4 | None found | No exact canonical screen-name match; replacement character prevents an authoritative alias decision. | QUARANTINE |
| `bigja33` | S14W05–S14W12 | 8 / 16 | `BIGJA33` — `e6d2e396-7aac-4f20-bf7b-f5a31c0d2c3b` | Exact case-insensitive canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |
| `Chelle¿` | S14W05–S14W08, S14W10, S14W12 | 6 / 12 | None found | No exact canonical screen-name match; no authoritative historical mapping. | QUARANTINE |
| `dandnt65` | S14W07–S14W12 | 6 / 12 | `Dandnt65` — `bed410dd-2b89-4db3-8fe4-8226c21c3f5f` | Exact case-insensitive canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |
| `Dickfor24-7` | S14W06 | 1 / 2 | `DICKFOR24-7` — `c0ccc790-8001-4224-807a-04d253c7cf46` | Exact case-insensitive canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |
| `Honeybee1998` | S14W07 | 1 / 2 | None found | No exact canonical screen-name match; no authoritative source mapping. | QUARANTINE |
| `Jesunet` | S14W05–S14W09, S14W11–S14W12 | 7 / 14 | `JESUNET` — `a0eaf23c-0784-4eb9-ab1d-530b077121a9` | Exact case-insensitive canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |
| `Laurent¿¿` | S14W05–S14W12 | 8 / 16 | None found | No exact canonical screen-name match; replacement characters prevent an authoritative alias decision. | QUARANTINE |
| `Maxfrom-fr` | S14W05–S14W12 | 8 / 16 | `MAXFROM-FR` — `6918df0a-cc2b-495a-8c09-b8be600ed0bc` | Exact case-insensitive canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |
| `musical_atv ¿` | S14W07, S14W10, S14W11 | 3 / 6 | None found | No exact canonical screen-name match; trailing replacement character is not safely removable. | QUARANTINE |
| `PaulV-PPP ¿¿` | S14W05–S14W09, S14W11 | 6 / 12 | None found | No exact canonical screen-name match; no authoritative alias or source ID. | QUARANTINE |
| `peach¿` | S14W05, S14W07 | 2 / 4 | None found | No exact canonical screen-name match; replacement character prevents safe normalization. | QUARANTINE |
| `plucky¿` | S14W05–S14W12 | 8 / 16 | None found | No exact canonical screen-name match; no authoritative historical mapping. | QUARANTINE |
| `Raccoons Whisker` | S14W06–S14W12 | 7 / 14 | `RACCOONS WHISKER` — `4d58c67c-8890-41d7-af98-3d82a8a6879d` | Exact case-insensitive canonical screen-name match in Production. Discord identifiers conflict and were intentionally ignored. HIGH name evidence. | RESOLVED |
| `Spicy - DawnSophia` | S14W05, S14W06, S14W08, S14W09, S14W12 | 5 / 10 | None found | No exact canonical screen-name match; no authoritative alias or source ID. | QUARANTINE |
| `Stephen1D47` | S14W07, S14W08, S14W10, S14W11 | 4 / 8 | None found | No exact canonical screen-name match; no authoritative historical mapping. | QUARANTINE |
| `WendyW(Wyndemere2020)` | S14W05–S14W08, S14W11 | 5 / 10 | `WendyW(Wyndemere2020)` — `bc717fcf-dc63-4a52-9096-279b007d8a91` | Exact canonical screen-name match in Production; no Discord ID used. HIGH. | RESOLVED |

## Counts

- Original unresolved set: 20 names, 92 player-week pairs, 184 course observations.
- Deterministically resolved in Phase 112: 9 names, 45 pairs, 90 observations.
- Still quarantined: 11 names, 47 pairs, 94 observations.
- All 371 player-week pairs remain represented; no source row was deleted.

The nine resolved names are included in the 324-pair Phase 112 candidate. The 11 quarantined names remain in `docs/handicap/phase112/handicap_source_provenance_exceptions.csv`.

## Human decisions still required

Krys may provide separate authoritative evidence for any quarantined name, or explicitly leave it quarantined. A similar-looking current player, an unrelated Discord ID, or a guessed removal of replacement characters is not sufficient evidence.
