# Phase 126 rolling-20 Handicap update

Status: **LOCAL PRELIMINARY / UNPUBLISHED**.

The previous best-5-of-latest-10 calculation was replaced locally with a rolling window of the 20 most recent qualifying KWT scorecards. Every active differential is averaged; no best-round selection or weighting is applied.

- Candidates recalculated: **166**
- Official-eligible by card count: **120**
- Provisional (1–19 cards): **46**
- Not yet rated: **0**
- Weekly personal-round rows: **0**
- Numeric changes versus Phase 125: **166**

All values remain unpublished. Official eligibility is not publication approval. The five approved ratings are reused unchanged; the remaining 73 remain subject to formal rating approval. Hollywood remains provisional and Gloop Lair remains unrated under the existing package.

The existing database snapshot columns are named for latest-ten/best-five history. This local package records the new active window explicitly as `active_twenty_source_round_ids` and leaves the legacy selection arrays empty. A separately reviewed persistence/read-model change is required before these candidates can be installed or displayed as official.

## Player comparison

See `player_index_comparison.csv` for canonical UUID, exact canonical screen name, qualifying-card count, old/new signed index, golf display value, status, and movement.

No Weekly observation enters any personal index. Negative scores and signed index values are preserved; golf-style plus notation is display-only.
