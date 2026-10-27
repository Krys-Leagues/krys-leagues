# Phase 107 — secure publication preparation

This package is local-only. It does not approve, publish, or alter Production rows.

## Publication contract

The Phase 105 run remains the immutable source run:

`3973f8e7-f2c9-5d05-bdb7-e49810713612`

The local executor requires a separate approval manifest containing:

- 72 explicit rating approvals;
- diagnostic dispositions for Bogey's Bonanza Hard, Forgotten Fairyland Easy, Original Gothic Easy, and Shangri-La Easy;
- 157 explicit index approvals;
- SHA-256 references for the rating and index manifests;
- the source run ID.

Statistical readiness, `ready` confidence, or an existing `UNPUBLISHED` draft row never counts as approval.

## Append-only publication design

The executor appends a new `COMPLETED / ELIGIBLE` calculation run and new `PUBLISHED` successor snapshots. It never updates or deletes the Phase 105 run or snapshots. The new run metadata records:

- source-run linkage;
- Candidate A formula;
- numeric reference slope `8.515`;
- `OFFICIAL_KWT_SEQUENCE` opt-in;
- KWT-only source separation;
- The Weekly remains course-rating-only and is never personal Handicap evidence;
- rating, diagnostic, and index approval-manifest hashes.

The six provisional ratings and 44 blocked players are omitted.

## Player read proposal

`supabase/proposals/20261020_handicap_player_read_rpc.proposed.sql` is a separate proposal. It adds no table grants, is `SECURITY DEFINER` with an empty `search_path`, requires the authenticated canonical identity, and returns `NULL` when the supplied UUID is not the current user's canonical player.

The proposal intentionally returns an empty history array until a separately reviewed round-detail contract is approved. It never exposes review evidence or base-table rows to clients.
