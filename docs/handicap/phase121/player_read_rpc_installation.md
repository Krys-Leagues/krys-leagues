# Phase 121 guarded player-read installation

The reviewed SQL remains the existing Phase 107 proposal:

`supabase/proposals/20261020_handicap_player_read_rpc.proposed.sql`

It is intentionally not copied or modified in Phase 121. Its contract is:

- `SECURITY DEFINER` with an empty `search_path`;
- server-side `current_user_canonical_player_id()` resolution;
- a supplied UUID must equal the authenticated canonical identity;
- anonymous and cross-player calls return no player result;
- direct table/view grants remain unchanged;
- `EXECUTE` is granted only to `authenticated`;
- review evidence and draft/unpublished rows are never returned.

Install it only as a separately reviewed Production action after the publication
approval package exists. The Phase 121 package does not execute this SQL.
