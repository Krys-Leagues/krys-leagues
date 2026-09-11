-- Production RLS batch: internal tables with no current browser/public reader.
-- These tables remain available to trusted server/service-role workflows only.

alter table public.leagues enable row level security;
alter table public.scores enable row level security;
alter table public.single_course_records enable row level security;
alter table public.historical_stroke_s1_import enable row level security;
alter table public.player_community_badges enable row level security;
alter table public.community_badges enable row level security;
alter table public.discord_badge_role_mappings enable row level security;
alter table public.kwt_import_batches enable row level security;

revoke all on table
  public.leagues,
  public.scores,
  public.single_course_records,
  public.historical_stroke_s1_import,
  public.player_community_badges,
  public.community_badges,
  public.discord_badge_role_mappings,
  public.kwt_import_batches
from public, anon, authenticated;

grant all on table
  public.leagues,
  public.scores,
  public.single_course_records,
  public.historical_stroke_s1_import,
  public.player_community_badges,
  public.community_badges,
  public.discord_badge_role_mappings,
  public.kwt_import_batches
to service_role;
