-- Staging-only Major event, signup, and schedule base-table hardening.
-- Public and player workflows use protected server/RPC paths; these tables
-- are not directly readable or writable by PostgREST client roles.

revoke all on table
  public.major_events,
  public.major_entries,
  public.major_play_days,
  public.major_time_slots,
  public.major_standard_signup_times,
  public.major_entry_day_choices,
  public.major_entry_weekend_status
from public, anon, authenticated;

grant all on table
  public.major_events,
  public.major_entries,
  public.major_play_days,
  public.major_time_slots,
  public.major_standard_signup_times,
  public.major_entry_day_choices,
  public.major_entry_weekend_status
to service_role;

alter table public.major_events enable row level security;
alter table public.major_entries enable row level security;
alter table public.major_play_days enable row level security;
alter table public.major_time_slots enable row level security;
alter table public.major_standard_signup_times enable row level security;
alter table public.major_entry_day_choices enable row level security;
alter table public.major_entry_weekend_status enable row level security;
