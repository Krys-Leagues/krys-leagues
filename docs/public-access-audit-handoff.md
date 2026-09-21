# Public access audit handoff

This handoff is intentionally limited to client-side table/RPC findings outside the `app/admin/**` and `components/admin/**` boundary. They were not changed during admin hardening and require a separate public/self-service authorization review.

Findings currently queued:

- `app/dashboard/page.tsx`: protected table `player_league_memberships` — authenticated self-service scope must be verified.
- `app/dashboard/page.tsx`: protected table `schedule` — authenticated self-service/public projection must be verified.
- `app/kwt/upcoming/page.tsx`: protected table `kwt_public_content` — confirm intended public projection and RLS.
- `app/majors/[slug]/page.tsx`: protected tables `major_entries`, `major_events`, `major_play_days`, `major_time_slots` — verify public event projection.
- `app/majors/[slug]/results/page.tsx`: protected table `major_events` — verify public result projection.
- `app/majors/[slug]/scoring/page.tsx`: protected RPC `save_my_major_scorecard` — verify authenticated self-service authorization and browser suitability.
- `app/majors/[slug]/scoring/page.tsx`: protected table `major_events` — verify public event projection.
- `app/majors/[slug]/stats/page.tsx`: protected table `major_events` — verify public event projection.
- `app/majors/page.tsx`: protected table `major_events` — verify public event projection.
- `app/matches/page.tsx`: protected table `schedule` — verify public projection.
- `app/players/[id]/page.tsx`: protected table `course_challenge_rewards` — verify public player-profile projection.
- `app/players/[id]/page.tsx`: protected table `player_league_memberships` — verify public player-profile projection.
- `app/schedule/page.tsx`: protected table `schedule` — verify public schedule projection.
- `components/PlayerProfileEditor.tsx`: protected RPC `save_player_profile_preferences_v5` — verify authenticated self-service authorization and browser suitability.

No public finding was silently allowlisted or modified by the admin-only hardening phase.
