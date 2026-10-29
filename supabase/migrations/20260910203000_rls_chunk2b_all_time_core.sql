begin;

-- Staging-only All-Time core hardening. Production is intentionally untouched.
-- Public All-Time pages use the server-side service-role route; browser clients
-- do not receive direct table access to records or provenance.

alter table public.all_time_courses enable row level security;
alter table public.all_time_best_records enable row level security;
alter table public.all_time_combined_best_records enable row level security;
alter table public.all_time_record_observations enable row level security;
alter table public.all_time_combined_observations enable row level security;
alter table public.all_time_course_source_mappings enable row level security;

revoke all on table
  public.all_time_courses,
  public.all_time_best_records,
  public.all_time_combined_best_records,
  public.all_time_record_observations,
  public.all_time_combined_observations,
  public.all_time_course_source_mappings
from public, anon, authenticated;

grant all on table
  public.all_time_courses,
  public.all_time_best_records,
  public.all_time_combined_best_records,
  public.all_time_record_observations,
  public.all_time_combined_observations,
  public.all_time_course_source_mappings
to service_role;

-- The authenticated admin UI reads these four tables directly after its
-- site-admin check. No authenticated DML is granted.
grant select on table
  public.all_time_courses,
  public.all_time_best_records,
  public.all_time_record_observations,
  public.all_time_course_source_mappings
to authenticated;

drop policy if exists chunk2b_site_admin_read_all_time_courses on public.all_time_courses;
drop policy if exists chunk2b_site_admin_read_all_time_best_records on public.all_time_best_records;
drop policy if exists chunk2b_site_admin_read_all_time_record_observations on public.all_time_record_observations;
drop policy if exists chunk2b_site_admin_read_all_time_course_source_mappings on public.all_time_course_source_mappings;

create policy chunk2b_site_admin_read_all_time_courses
on public.all_time_courses
for select to authenticated
using ((select public.is_current_user_site_admin()));

create policy chunk2b_site_admin_read_all_time_best_records
on public.all_time_best_records
for select to authenticated
using ((select public.is_current_user_site_admin()));

create policy chunk2b_site_admin_read_all_time_record_observations
on public.all_time_record_observations
for select to authenticated
using ((select public.is_current_user_site_admin()));

create policy chunk2b_site_admin_read_all_time_course_source_mappings
on public.all_time_course_source_mappings
for select to authenticated
using ((select public.is_current_user_site_admin()));

commit;
