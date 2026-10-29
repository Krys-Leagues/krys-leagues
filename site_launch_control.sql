begin;

-- Runtime launch state. Applying this SQL creates a private-by-default
-- control row; it does not publish the site.
create table if not exists public.site_access_control (
  control_key text primary key check (control_key = 'site'),
  mode text not null default 'prelaunch' check (mode in ('prelaunch', 'public')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.site_access_control (control_key, mode)
values ('site', 'prelaunch')
on conflict (control_key) do nothing;

create table if not exists public.site_access_audit (
  id bigint generated always as identity primary key,
  old_mode text not null check (old_mode in ('prelaunch', 'public')),
  new_mode text not null check (new_mode in ('prelaunch', 'public')),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id) on delete restrict
);

revoke all on table public.site_access_control from public, anon, authenticated;
revoke all on table public.site_access_audit from public, anon, authenticated;

create or replace function public.get_site_access_mode()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select control.mode from public.site_access_control as control where control.control_key = 'site'),
    'prelaunch'
  );
$function$;

create or replace function public.get_site_access_state()
returns table(
  mode text,
  updated_at timestamptz,
  updated_by uuid,
  last_old_mode text,
  last_new_mode text,
  last_changed_at timestamptz,
  last_changed_by uuid
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  return query
  select
    control.mode,
    control.updated_at,
    control.updated_by,
    audit.old_mode,
    audit.new_mode,
    audit.changed_at,
    audit.changed_by
  from public.site_access_control as control
  left join lateral (
    select current_audit.old_mode, current_audit.new_mode, current_audit.changed_at, current_audit.changed_by
    from public.site_access_audit as current_audit
    order by current_audit.changed_at desc, current_audit.id desc
    limit 1
  ) as audit on true
  where control.control_key = 'site';
end;
$function$;

create or replace function public.set_site_access_mode(p_new_mode text)
returns table(
  old_mode text,
  new_mode text,
  changed_at timestamptz,
  changed_by uuid,
  changed boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current public.site_access_control%rowtype;
  v_changed_at timestamptz;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  if p_new_mode is null or p_new_mode not in ('prelaunch', 'public') then
    raise exception 'Invalid site access mode.' using errcode = '22023';
  end if;

  select * into v_current
  from public.site_access_control
  where control_key = 'site'
  for update;

  if v_current.control_key is null then
    raise exception 'Site access control is not initialized.' using errcode = '55000';
  end if;

  if v_current.mode = p_new_mode then
    return query select v_current.mode, v_current.mode, v_current.updated_at, v_current.updated_by, false;
    return;
  end if;

  v_changed_at := now();

  update public.site_access_control
  set mode = p_new_mode,
      updated_at = v_changed_at,
      updated_by = auth.uid()
  where control_key = 'site';

  insert into public.site_access_audit (old_mode, new_mode, changed_at, changed_by)
  values (v_current.mode, p_new_mode, v_changed_at, auth.uid());

  return query select v_current.mode, p_new_mode, v_changed_at, auth.uid(), true;
end;
$function$;

revoke all on function public.get_site_access_mode() from public, anon, authenticated;
revoke all on function public.get_site_access_state() from public, anon, authenticated;
revoke all on function public.set_site_access_mode(text) from public, anon, authenticated;

grant execute on function public.get_site_access_mode() to anon, authenticated;
grant execute on function public.get_site_access_state() to authenticated;
grant execute on function public.set_site_access_mode(text) to authenticated;

commit;
