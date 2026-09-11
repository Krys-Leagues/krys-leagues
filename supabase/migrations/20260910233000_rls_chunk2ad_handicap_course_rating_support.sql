-- Chunk 2AD: keep handicap/course-rating derived data behind trusted access.
-- No current browser or public reader depends on these base tables.

revoke all on table public.course_ratings, public.handicap_differentials, public.handicap_index
  from public, anon, authenticated;

grant all on table public.course_ratings, public.handicap_differentials, public.handicap_index
  to service_role;

alter table public.course_ratings enable row level security;
alter table public.handicap_differentials enable row level security;
alter table public.handicap_index enable row level security;
