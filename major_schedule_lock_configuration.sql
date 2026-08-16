begin;

alter table public.major_events
  add column if not exists schedule_lock_hours_before_first_slot integer not null default 24;

-- Repair a partially installed column before enforcing the final contract.
update public.major_events
set schedule_lock_hours_before_first_slot = 24
where schedule_lock_hours_before_first_slot is null;

alter table public.major_events
  alter column schedule_lock_hours_before_first_slot set default 24,
  alter column schedule_lock_hours_before_first_slot set not null;

alter table public.major_events
  drop constraint if exists major_events_schedule_lock_hours_nonnegative;

alter table public.major_events
  add constraint major_events_schedule_lock_hours_nonnegative
  check (schedule_lock_hours_before_first_slot >= 0);

create or replace function public.sync_major_play_day_lock_deadline()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  affected_day uuid;
begin
  affected_day := case when tg_op = 'DELETE' then old.play_day_id else new.play_day_id end;

  update public.major_play_days d
  set selection_locks_at = (
    select min(s.starts_at)
    from public.major_time_slots s
    where s.play_day_id = affected_day
      and s.is_available
  ) - make_interval(hours => e.schedule_lock_hours_before_first_slot)
  from public.major_events e
  where d.id = affected_day
    and e.id = d.major_event_id;

  if tg_op = 'UPDATE' and old.play_day_id is distinct from new.play_day_id then
    update public.major_play_days d
    set selection_locks_at = (
      select min(s.starts_at)
      from public.major_time_slots s
      where s.play_day_id = old.play_day_id
        and s.is_available
    ) - make_interval(hours => e.schedule_lock_hours_before_first_slot)
    from public.major_events e
    where d.id = old.play_day_id
      and e.id = d.major_event_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

-- Recalculate only derived day deadlines. Player choices and room assignments are untouched.
update public.major_play_days d
set selection_locks_at = (
  select min(s.starts_at)
  from public.major_time_slots s
  where s.play_day_id = d.id
    and s.is_available
) - make_interval(hours => e.schedule_lock_hours_before_first_slot)
from public.major_events e
where e.id = d.major_event_id;

create or replace function public.set_major_schedule_lock_hours(
  p_major_event_id uuid,
  p_hours_before_first_slot integer
)
returns public.major_events
language plpgsql
security definer
set search_path to ''
as $function$
declare
  saved_event public.major_events%rowtype;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  if p_hours_before_first_slot is null or p_hours_before_first_slot < 0 then
    raise exception 'Schedule lock hours must be a nonnegative integer.' using errcode = '22023';
  end if;

  select e.*
  into saved_event
  from public.major_events e
  where e.id = p_major_event_id
  for update;

  if not found then
    raise exception 'Major event not found.' using errcode = 'P0002';
  end if;

  update public.major_events e
  set schedule_lock_hours_before_first_slot = p_hours_before_first_slot
  where e.id = p_major_event_id
  returning e.* into saved_event;

  update public.major_play_days d
  set selection_locks_at = (
    select min(s.starts_at)
    from public.major_time_slots s
    where s.play_day_id = d.id
      and s.is_available
  ) - make_interval(hours => saved_event.schedule_lock_hours_before_first_slot)
  where d.major_event_id = saved_event.id;

  return saved_event;
end
$function$;

revoke all on function public.set_major_schedule_lock_hours(uuid, integer)
from public, anon, authenticated;

grant execute on function public.set_major_schedule_lock_hours(uuid, integer)
to authenticated;

commit;
