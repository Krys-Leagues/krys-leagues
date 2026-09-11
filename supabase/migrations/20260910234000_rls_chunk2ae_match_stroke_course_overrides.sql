-- Chunk 2AE: keep Match and Stroke division course overrides behind
-- protected admin routes/RPCs and trusted service-role access.

revoke all on table public.match_division_course_overrides,
  public.stroke_division_course_overrides
  from public, anon, authenticated;

grant all on table public.match_division_course_overrides,
  public.stroke_division_course_overrides
  to service_role;

alter table public.match_division_course_overrides enable row level security;
alter table public.stroke_division_course_overrides enable row level security;
