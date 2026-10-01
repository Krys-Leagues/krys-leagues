begin;

-- Public Masters reads have separate SELECT policies. Keep administrator
-- mutation policies off the anonymous role so public reads never need
-- permission to execute the protected site-admin authorization function.
drop policy if exists "Site admins manage Major play days"
on public.major_play_days;
create policy "Site admins manage Major play days"
on public.major_play_days
for all
to authenticated
using (public.is_current_user_site_admin())
with check (public.is_current_user_site_admin());

drop policy if exists "Site admins manage Major time slots"
on public.major_time_slots;
create policy "Site admins manage Major time slots"
on public.major_time_slots
for all
to authenticated
using (public.is_current_user_site_admin())
with check (public.is_current_user_site_admin());

drop policy if exists "Site admins manage Major day choices"
on public.major_entry_day_choices;
create policy "Site admins manage Major day choices"
on public.major_entry_day_choices
for all
to authenticated
using (public.is_current_user_site_admin())
with check (public.is_current_user_site_admin());

commit;
