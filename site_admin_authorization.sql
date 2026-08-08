create table if not exists public.site_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.site_admin_users enable row level security;

revoke all on table public.site_admin_users from public;
revoke all on table public.site_admin_users from anon;
revoke all on table public.site_admin_users from authenticated;

create or replace function public.is_current_user_site_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.site_admin_users as site_admin
      where site_admin.user_id = auth.uid()
    );
$function$;

revoke all on function public.is_current_user_site_admin() from public;
revoke all on function public.is_current_user_site_admin() from anon;
revoke all on function public.is_current_user_site_admin() from authenticated;

grant execute on function public.is_current_user_site_admin() to authenticated;
