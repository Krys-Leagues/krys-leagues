begin;

-- Staging-only Historical Monthlies hardening. Production is intentionally untouched.
-- Public Monthlies pages use the server-side service-role reader; browser clients
-- do not receive direct access to import or provenance tables.

alter table public.historical_monthly_imports enable row level security;
alter table public.historical_monthly_score_observations enable row level security;
alter table public.historical_monthly_observation_provenance enable row level security;

revoke all on table
  public.historical_monthly_imports,
  public.historical_monthly_score_observations,
  public.historical_monthly_observation_provenance
from public, anon, authenticated;

grant all on table
  public.historical_monthly_imports,
  public.historical_monthly_score_observations,
  public.historical_monthly_observation_provenance
to service_role;

-- Admin review reads these tables directly. No authenticated DML is granted.
grant select on table
  public.historical_monthly_imports,
  public.historical_monthly_score_observations,
  public.historical_monthly_observation_provenance
to authenticated;

drop policy if exists chunk2c_site_admin_read_historical_monthly_imports on public.historical_monthly_imports;
drop policy if exists chunk2c_site_admin_read_historical_monthly_score_observations on public.historical_monthly_score_observations;
drop policy if exists chunk2c_site_admin_read_historical_monthly_observation_provenance on public.historical_monthly_observation_provenance;

create policy chunk2c_site_admin_read_historical_monthly_imports
on public.historical_monthly_imports
for select to authenticated
using ((select public.is_current_user_site_admin()));

create policy chunk2c_site_admin_read_historical_monthly_score_observations
on public.historical_monthly_score_observations
for select to authenticated
using ((select public.is_current_user_site_admin()));

create policy chunk2c_site_admin_read_historical_monthly_observation_provenance
on public.historical_monthly_observation_provenance
for select to authenticated
using ((select public.is_current_user_site_admin()));

commit;
