# Phase 130 launch readiness

Status: **PARTIAL — locally prepared; Production unchanged**

## Verified Production baseline

Read-only verification of Supabase project `jfbndcwdsvsjgnzwvexp` returned:

- 4 calculation runs; all are `DRAFT` / `QUARANTINED`.
- 28,672 provenance rows.
- 410 rating snapshots.
- 157 historical index snapshots.
- 0 publishable ratings and 0 publishable indexes.
- Legacy counts unchanged: 10,274 `handicap_rounds`, 32 `course_ratings`, 5,518 `handicap_differentials`, and 182 `handicap_index` rows.
- Rolling-20 persistence migration is installed as `20261022150606_handicap_rolling20_persistence`.
- RLS remains enabled on the rating, index, and provenance tables; client direct SELECT remains denied; append-only protection remains present.
- `public.get_published_handicap_for_player(uuid)` is not installed.

No Production SQL, data, schema, alias, or deployment was changed in Phase 130.

## Prepared packages

### Protected player-read RPC

The exact Phase127 proposal remains unchanged and checksums to:

`9C8A82108B1B6B4154F7E03B5A8DCF8E6DC3C6E7B6C452247D6A4BDC2E36D003`

It is identity-bound to `current_user_canonical_player_id()`, accepts no cross-player read, returns only published data, and grants execute only to `authenticated`. Installation is a separate Production authorization.

### Rating approvals

`rating_approval_batch_manifest.json` enumerates all 73 remaining candidates and keeps each owner decision `PENDING`. It preserves the five explicit Krys approvals, without inventing reviewer UUIDs, signatures, or timestamps. Hollywood Easy/Hard remain provisional; Gloop Lair Easy/Hard remain unrated. The manifest also records Weekly rows only as course-rating evidence, never as personal rounds.

### Rolling-20 index approvals

`player_index_approval_manifest.json` is generated from the Phase126 candidate CSV and contains all 166 canonical players:

- 120 `OFFICIAL_ELIGIBLE` candidates with 20 active cards.
- 46 `PROVISIONAL` candidates with 1–19 active cards.
- 0 Weekly personal inputs.
- Candidate source checksum: `8A5512DEDB2763E982357851836163CB6E9B0BD8DFFFA7B08C21C0787B35D992`.

`player_index_publication_manifest.json` keeps every approval and publication decision `PENDING`. Existing historical snapshots are not replaced.

## Player profiles

The local candidate now has a server-only public profile route at `/api/players/[id]/handicap` and a profile card with current status, active-card count, signed-to-golf display notation, and real published history. The route reads only `handicap_publishable_index_snapshots` with the server client; it cannot expose drafts, quarantined rows, source evidence, or personal round details. It returns no Handicap until a published row exists.

The protected Phase127 RPC remains separate for an authenticated player's own read. The public profile route is an additive application path and still requires a separately authorized website deployment.

## Tournament readiness

No verified tournament scoring consumer currently reads the rolling-20 publication view or the Phase127 player-read RPC. Tournament handicap integration is therefore **NOT IMPLEMENTED / BLOCKED**, and no tournament scoring rule was changed.

## Required Production sequence

1. Separately authorize and install the exact Phase127 player-read RPC; verify grants, identity binding, and anonymous/cross-player denial.
2. Separately approve the 73 rating rows, retaining the five existing approvals and explicit holds.
3. Create the append-only successor run and snapshots from the validated Phase126 package; transition only through the installed publication gates.
4. Separately authorize index publication for the enumerated manifest; verify both publication views and counts.
5. Deploy the tested profile route/UI only after published-view postflight passes.
6. Treat tournament integration as a later controlled implementation unless separately approved.

No step above is executed by this package.
