begin;

-- Event-level clock-time templates. Concrete player-facing slots remain in
-- major_time_slots and continue to use each play day's official date.
create table if not exists public.major_standard_signup_times (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete cascade,
  local_time time without time zone not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists major_standard_signup_times_active_time_uidx
  on public.major_standard_signup_times(major_event_id, local_time)
  where is_active;
create index if not exists major_standard_signup_times_event_idx
  on public.major_standard_signup_times(major_event_id, local_time);

alter table public.major_time_slots
  add column if not exists standard_signup_time_id uuid;

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'major_time_slots_standard_signup_time_fk'
      and conrelid = 'public.major_time_slots'::regclass
  ) then
    alter table public.major_time_slots
      add constraint major_time_slots_standard_signup_time_fk
      foreign key (standard_signup_time_id)
      references public.major_standard_signup_times(id)
      on delete set null;
  end if;
end
$block$;

create index if not exists major_time_slots_standard_signup_time_idx
  on public.major_time_slots(standard_signup_time_id)
  where standard_signup_time_id is not null;

alter table public.major_standard_signup_times enable row level security;
revoke all on public.major_standard_signup_times from public, anon;

drop policy if exists "Site admins manage Major standard signup times" on public.major_standard_signup_times;
create policy "Site admins manage Major standard signup times"
  on public.major_standard_signup_times
  for all to authenticated
  using (public.is_current_user_site_admin())
  with check (public.is_current_user_site_admin());

drop trigger if exists major_standard_signup_times_touch_updated_at on public.major_standard_signup_times;
create trigger major_standard_signup_times_touch_updated_at
  before update on public.major_standard_signup_times
  for each row execute function public.touch_major_updated_at();

create or replace function public.save_major_standard_signup_time(
  p_id uuid,
  p_major_event_id uuid,
  p_local_time time without time zone,
  p_label text
)
returns public.major_standard_signup_times
language plpgsql
security definer
set search_path to ''
as $function$
declare
  saved public.major_standard_signup_times%rowtype;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  if p_local_time is null then
    raise exception 'A standard signup time is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.major_events e where e.id = p_major_event_id) then
    raise exception 'Major event not found.' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.major_standard_signup_times(major_event_id, local_time, label)
    values (p_major_event_id, p_local_time, nullif(btrim(p_label), ''))
    returning * into saved;
  else
    update public.major_standard_signup_times t
    set local_time = p_local_time,
        label = nullif(btrim(p_label), ''),
        is_active = true
    where t.id = p_id
      and t.major_event_id = p_major_event_id
    returning * into saved;
    if not found then
      raise exception 'Standard signup time not found for this Major.' using errcode = 'P0002';
    end if;
  end if;
  return saved;
end
$function$;
revoke all on function public.save_major_standard_signup_time(uuid,uuid,time without time zone,text) from public, anon, authenticated;

create or replace function public.remove_major_standard_signup_time(
  p_id uuid,
  p_major_event_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  update public.major_standard_signup_times t
  set is_active = false
  where t.id = p_id
    and t.major_event_id = p_major_event_id
    and t.is_active;
  if not found then
    raise exception 'Active standard signup time not found for this Major.' using errcode = 'P0002';
  end if;
end
$function$;
revoke all on function public.remove_major_standard_signup_time(uuid,uuid) from public, anon, authenticated;

create or replace function public.copy_major_thursday_times_to_standard(
  p_major_event_id uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  copied integer := 0;
  zone_name text;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;
  select e.schedule_timezone into zone_name
  from public.major_events e
  where e.id = p_major_event_id
  for update;
  if not found then
    raise exception 'Major event not found.' using errcode = 'P0002';
  end if;

  insert into public.major_standard_signup_times(major_event_id, local_time, label)
  select p_major_event_id,
         (s.starts_at at time zone zone_name)::time,
         s.label
  from public.major_play_days d
  join public.major_time_slots s on s.play_day_id = d.id
  where d.major_event_id = p_major_event_id
    and d.day_number = 1
    and s.is_available
    and not exists (
      select 1 from public.major_standard_signup_times t
      where t.major_event_id = p_major_event_id
        and t.local_time = (s.starts_at at time zone zone_name)::time
        and t.is_active
    );
  get diagnostics copied = row_count;
  return copied;
end
$function$;
revoke all on function public.copy_major_thursday_times_to_standard(uuid) from public, anon, authenticated;

create or replace function public.apply_major_standard_signup_times(
  p_major_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  zone_name text;
  day_count integer;
  template_row public.major_standard_signup_times%rowtype;
  day_row public.major_play_days%rowtype;
  slot_row public.major_time_slots%rowtype;
  target_starts_at timestamptz;
  slot_in_use boolean;
  created_count integer := 0;
  updated_count integer := 0;
  linked_count integer := 0;
  removed_count integer := 0;
  protected_count integer := 0;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select e.schedule_timezone into zone_name
  from public.major_events e
  where e.id = p_major_event_id
  for update;
  if not found then
    raise exception 'Major event not found.' using errcode = 'P0002';
  end if;

  select count(*) into day_count
  from public.major_play_days d
  where d.major_event_id = p_major_event_id;
  if day_count <> 4 then
    raise exception 'Save all four official tournament days before applying standard times.' using errcode = '22023';
  end if;
  -- Retire only slots created/linked by template times that were removed. Day
  -- overrides are unlinked by the UI and are deliberately outside this scope.
  for slot_row in
    select s.*
    from public.major_time_slots s
    join public.major_play_days d on d.id = s.play_day_id
    join public.major_standard_signup_times t on t.id = s.standard_signup_time_id
    where d.major_event_id = p_major_event_id
      and not t.is_active
    for update of s
  loop
    select exists(select 1 from public.major_entry_day_choices c where c.time_slot_id = slot_row.id)
        or exists(select 1 from public.major_schedule_groups g where g.time_slot_id = slot_row.id)
    into slot_in_use;
    if slot_in_use then
      update public.major_time_slots
      set is_available = false, standard_signup_time_id = null
      where id = slot_row.id;
      protected_count := protected_count + 1;
    else
      delete from public.major_time_slots where id = slot_row.id;
      removed_count := removed_count + 1;
    end if;
  end loop;

  for template_row in
    select t.* from public.major_standard_signup_times t
    where t.major_event_id = p_major_event_id and t.is_active
    order by t.local_time
  loop
    for day_row in
      select d.* from public.major_play_days d
      where d.major_event_id = p_major_event_id
      order by d.day_number
    loop
      target_starts_at := (day_row.play_date + template_row.local_time) at time zone zone_name;
      slot_row := null;
      select s.* into slot_row
      from public.major_time_slots s
      where s.play_day_id = day_row.id
        and s.standard_signup_time_id = template_row.id
      limit 1
      for update;

      if found then
        if slot_row.starts_at is distinct from target_starts_at then
          select exists(select 1 from public.major_entry_day_choices c where c.time_slot_id = slot_row.id)
              or exists(select 1 from public.major_schedule_groups g where g.time_slot_id = slot_row.id)
          into slot_in_use;
          if slot_in_use then
            update public.major_time_slots
            set is_available = false, standard_signup_time_id = null
            where id = slot_row.id;
            protected_count := protected_count + 1;
            slot_row := null;
          else
            -- Avoid the existing (play_day_id, starts_at) unique key if an
            -- independent override already occupies the template's new time.
            if exists (
              select 1 from public.major_time_slots existing
              where existing.play_day_id = day_row.id
                and existing.starts_at = target_starts_at
                and existing.id <> slot_row.id
            ) then
              delete from public.major_time_slots where id = slot_row.id;
              update public.major_time_slots
              set standard_signup_time_id = template_row.id
              where play_day_id = day_row.id
                and starts_at = target_starts_at;
              removed_count := removed_count + 1;
              linked_count := linked_count + 1;
              continue;
            else
              update public.major_time_slots
              set starts_at = target_starts_at,
                  label = template_row.label,
                  is_available = true
              where id = slot_row.id;
              updated_count := updated_count + 1;
              continue;
            end if;
          end if;
        else
          update public.major_time_slots
          set label = template_row.label,
              is_available = true
          where id = slot_row.id;
          updated_count := updated_count + 1;
          continue;
        end if;
      end if;

      -- Reuse an exact existing day slot (notably TEST Thursday) rather than
      -- duplicate or destroy it. Its identity and any selections stay intact.
      select s.* into slot_row
      from public.major_time_slots s
      where s.play_day_id = day_row.id
        and s.starts_at = target_starts_at
      limit 1
      for update;
      if found then
        update public.major_time_slots
        set standard_signup_time_id = template_row.id
        where id = slot_row.id;
        linked_count := linked_count + 1;
      else
        insert into public.major_time_slots(play_day_id, starts_at, label, is_available, standard_signup_time_id)
        values(day_row.id, target_starts_at, template_row.label, true, template_row.id);
        created_count := created_count + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'created', created_count,
    'updated', updated_count,
    'linked_existing', linked_count,
    'removed_unused', removed_count,
    'protected_disabled', protected_count
  );
end
$function$;
revoke all on function public.apply_major_standard_signup_times(uuid) from public, anon, authenticated;

grant select on public.major_standard_signup_times to authenticated;
grant execute on function public.save_major_standard_signup_time(uuid,uuid,time without time zone,text) to authenticated;
grant execute on function public.remove_major_standard_signup_time(uuid,uuid) to authenticated;
grant execute on function public.copy_major_thursday_times_to_standard(uuid) to authenticated;
grant execute on function public.apply_major_standard_signup_times(uuid) to authenticated;

commit;
