-- Chunk 2AC: keep KWT raw historical scores behind trusted server access.
-- The Season 9 review reads this table through the protected server route.

revoke all on table public.kwt_raw_scores from public;
revoke all on table public.kwt_raw_scores from anon;
revoke all on table public.kwt_raw_scores from authenticated;

grant all on table public.kwt_raw_scores to service_role;

alter table public.kwt_raw_scores enable row level security;
