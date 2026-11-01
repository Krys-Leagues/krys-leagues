begin;

create table if not exists public.user_time_zone_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_time_zone_preferences enable row level security;
revoke all on table public.user_time_zone_preferences from anon, authenticated;

create or replace function public.get_my_major_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pref.timezone
  from public.user_time_zone_preferences as pref
  where pref.user_id = (select auth.uid())
    and exists (
      select 1
      from pg_catalog.pg_timezone_names as zone
      where zone.name = pref.timezone
    );
$$;

create or replace function public.save_my_major_timezone(p_timezone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := nullif(btrim(p_timezone), '');
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to save a timezone.' using errcode = '42501';
  end if;

  if v_timezone is null
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as zone
       where zone.name = v_timezone
     ) then
    raise exception 'Choose a valid IANA timezone identifier.' using errcode = '22023';
  end if;

  insert into public.user_time_zone_preferences(user_id, timezone)
  values (v_user_id, v_timezone)
  on conflict (user_id) do update
    set timezone = excluded.timezone,
        updated_at = now();

  return v_timezone;
end;
$$;

revoke execute on function public.get_my_major_timezone() from public, anon;
revoke execute on function public.save_my_major_timezone(text) from public, anon;
grant execute on function public.get_my_major_timezone() to authenticated;
grant execute on function public.save_my_major_timezone(text) to authenticated;

commit;
