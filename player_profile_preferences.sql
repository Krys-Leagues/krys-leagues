begin;

create table if not exists public.player_profile_preferences (
  player_id uuid primary key references public.players(id) on delete cascade,
  background_key text not null default 'krys-default',
  name_effect text not null default 'white',
  background_color text not null default '#07111f',
  glow_color text not null default '#ff2bd6',
  text_color text not null default '#f8fafc',
  about_me text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_profile_background_hex check (background_color ~ '^#[0-9a-f]{6}$'),
  constraint player_profile_background_key check (background_key in ('krys-default', 'neon-mountain', 'neon-night', 'electric-blue', 'coastal-sunset', 'pink-coast', 'coastal-teal', 'krys-coastal')),
  constraint player_profile_name_effect check (name_effect in ('white', 'booster', 'server-tag')),
  constraint player_profile_glow_hex check (glow_color ~ '^#[0-9a-f]{6}$'),
  constraint player_profile_text_hex check (text_color ~ '^#[0-9a-f]{6}$'),
  constraint player_profile_about_length check (char_length(about_me) <= 500),
  constraint player_profile_about_plain_text check (about_me is null or about_me !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')
);

alter table public.player_profile_preferences
  add column if not exists background_key text not null default 'krys-default';

alter table public.player_profile_preferences
  add column if not exists name_effect text not null default 'white';

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'player_profile_background_key'
      and conrelid = 'public.player_profile_preferences'::regclass
  ) then
    alter table public.player_profile_preferences
      add constraint player_profile_background_key
      check (background_key in ('krys-default', 'neon-mountain', 'neon-night', 'electric-blue', 'coastal-sunset', 'pink-coast', 'coastal-teal', 'krys-coastal'));
  end if;
end
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'player_profile_name_effect'
      and conrelid = 'public.player_profile_preferences'::regclass
  ) then
    alter table public.player_profile_preferences
      add constraint player_profile_name_effect
      check (name_effect in ('white', 'booster', 'server-tag'));
  end if;
end
$migration$;

alter table public.player_profile_preferences enable row level security;
revoke all on table public.player_profile_preferences from public, anon, authenticated;

create or replace function public.current_user_canonical_player_id()
returns uuid language sql stable security definer set search_path to '' as $function$
  with canonical_matches as (
    select distinct public.resolve_canonical_player_id(player.id) as canonical_player_id
    from auth.identities as identity
    join public.players as player
      on nullif(btrim(player.discord_id), '') = coalesce(identity.identity_data ->> 'provider_id', identity.identity_data ->> 'sub')
    where identity.user_id = auth.uid()
      and identity.provider = 'discord'
  )
  select match.canonical_player_id
  from canonical_matches as match
  where (select count(*) from canonical_matches) = 1;
$function$;

create or replace function public.get_public_player_profile_preferences(p_player_id uuid)
returns table(player_id uuid, background_color text, glow_color text, text_color text, about_me text)
language sql stable security definer set search_path to '' as $function$
  select canonical.id,
    coalesce(pref.background_color, '#07111f'), coalesce(pref.glow_color, '#ff2bd6'),
    coalesce(pref.text_color, '#f8fafc'), nullif(btrim(pref.about_me), '')
  from public.players as canonical
  left join public.player_profile_preferences as pref on pref.player_id = canonical.id
  where canonical.id = public.resolve_canonical_player_id(p_player_id);
$function$;

create or replace function public.get_public_player_profile_preferences_v2(p_player_id uuid)
returns table(player_id uuid, background_key text, background_color text, glow_color text, text_color text, about_me text)
language sql stable security definer set search_path to '' as $function$
  select canonical.id,
    coalesce(pref.background_key, 'krys-default'), coalesce(pref.background_color, '#07111f'),
    coalesce(pref.glow_color, '#ff2bd6'), coalesce(pref.text_color, '#f8fafc'),
    nullif(btrim(pref.about_me), '')
  from public.players as canonical
  left join public.player_profile_preferences as pref on pref.player_id = canonical.id
  where canonical.id = public.resolve_canonical_player_id(p_player_id);
$function$;

create or replace function public.get_public_player_profile_preferences_v3(p_player_id uuid)
returns table(player_id uuid, background_key text, name_effect text, background_color text, glow_color text, text_color text, about_me text)
language sql stable security definer set search_path to '' as $function$
  select canonical.id,
    coalesce(pref.background_key, 'krys-default'), coalesce(pref.name_effect, 'white'),
    coalesce(pref.background_color, '#07111f'), coalesce(pref.glow_color, '#ff2bd6'),
    coalesce(pref.text_color, '#f8fafc'), nullif(btrim(pref.about_me), '')
  from public.players as canonical
  left join public.player_profile_preferences as pref on pref.player_id = canonical.id
  where canonical.id = public.resolve_canonical_player_id(p_player_id);
$function$;

create or replace function public.can_edit_player_profile_preferences(p_player_id uuid)
returns boolean language sql stable security definer set search_path to '' as $function$
  select auth.uid() is not null and (
    public.is_current_user_site_admin()
    or public.current_user_canonical_player_id() = public.resolve_canonical_player_id(p_player_id)
  );
$function$;

create or replace function public.save_player_profile_preferences_v2(
  p_player_id uuid, p_background_key text, p_background_color text, p_glow_color text, p_text_color text, p_about_me text
) returns table(player_id uuid, background_key text, background_color text, glow_color text, text_color text, about_me text)
language plpgsql security definer set search_path to '' as $function$
declare v_player_id uuid := public.resolve_canonical_player_id(p_player_id);
declare v_background_key text := lower(btrim(p_background_key));
declare v_background text := lower(btrim(p_background_color));
declare v_glow text := lower(btrim(p_glow_color));
declare v_text text := lower(btrim(p_text_color));
declare v_about text := nullif(btrim(replace(replace(p_about_me, chr(13) || chr(10), chr(10)), chr(13), chr(10))), '');
begin
  if not public.can_edit_player_profile_preferences(v_player_id) then raise exception 'You may edit only your own player profile' using errcode = '42501'; end if;
  if v_background_key is null or v_background_key not in ('krys-default', 'neon-mountain', 'neon-night', 'electric-blue', 'coastal-sunset', 'pink-coast', 'coastal-teal', 'krys-coastal') then raise exception 'Unsupported player profile background'; end if;
  if v_background !~ '^#[0-9a-f]{6}$' or v_glow !~ '^#[0-9a-f]{6}$' or v_text !~ '^#[0-9a-f]{6}$' then raise exception 'Profile colors must be six-digit hexadecimal colors'; end if;
  if char_length(v_about) > 500 then raise exception 'About Me must be 500 characters or fewer'; end if;
  if v_about ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'About Me contains unsupported control characters'; end if;
  insert into public.player_profile_preferences as pref (player_id, background_key, background_color, glow_color, text_color, about_me)
  values (v_player_id, v_background_key, v_background, v_glow, v_text, v_about)
  on conflict (player_id) do update set background_key = excluded.background_key, background_color = excluded.background_color, glow_color = excluded.glow_color, text_color = excluded.text_color, about_me = excluded.about_me, updated_at = now();
  return query select pref.player_id, pref.background_key, pref.background_color, pref.glow_color, pref.text_color, pref.about_me from public.player_profile_preferences as pref where pref.player_id = v_player_id;
end;
$function$;

create or replace function public.save_player_profile_preferences_v3(
  p_player_id uuid, p_background_key text, p_name_effect text, p_background_color text, p_glow_color text, p_text_color text, p_about_me text
) returns table(player_id uuid, background_key text, name_effect text, background_color text, glow_color text, text_color text, about_me text)
language plpgsql security definer set search_path to '' as $function$
declare v_player_id uuid := public.resolve_canonical_player_id(p_player_id);
declare v_background_key text := lower(btrim(p_background_key));
declare v_name_effect text := lower(btrim(p_name_effect));
declare v_background text := lower(btrim(p_background_color));
declare v_glow text := lower(btrim(p_glow_color));
declare v_text text := lower(btrim(p_text_color));
declare v_about text := nullif(btrim(replace(replace(p_about_me, chr(13) || chr(10), chr(10)), chr(13), chr(10))), '');
begin
  if not public.can_edit_player_profile_preferences(v_player_id) then raise exception 'You may edit only your own player profile' using errcode = '42501'; end if;
  if v_background_key is null or v_background_key not in ('krys-default', 'neon-mountain', 'neon-night', 'electric-blue', 'coastal-sunset', 'pink-coast', 'coastal-teal', 'krys-coastal') then raise exception 'Unsupported player profile background'; end if;
  if v_name_effect is null or v_name_effect not in ('white', 'booster', 'server-tag') then raise exception 'Unsupported player name effect'; end if;
  if v_background !~ '^#[0-9a-f]{6}$' or v_glow !~ '^#[0-9a-f]{6}$' or v_text !~ '^#[0-9a-f]{6}$' then raise exception 'Profile colors must be six-digit hexadecimal colors'; end if;
  if char_length(v_about) > 500 then raise exception 'About Me must be 500 characters or fewer'; end if;
  if v_about ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'About Me contains unsupported control characters'; end if;
  insert into public.player_profile_preferences as pref (player_id, background_key, name_effect, background_color, glow_color, text_color, about_me)
  values (v_player_id, v_background_key, v_name_effect, v_background, v_glow, v_text, v_about)
  on conflict (player_id) do update set background_key = excluded.background_key, name_effect = excluded.name_effect, background_color = excluded.background_color, glow_color = excluded.glow_color, text_color = excluded.text_color, about_me = excluded.about_me, updated_at = now();
  return query select pref.player_id, pref.background_key, pref.name_effect, pref.background_color, pref.glow_color, pref.text_color, pref.about_me from public.player_profile_preferences as pref where pref.player_id = v_player_id;
end;
$function$;

create or replace function public.save_player_profile_preferences(
  p_player_id uuid, p_background_color text, p_glow_color text, p_text_color text, p_about_me text
) returns table(player_id uuid, background_color text, glow_color text, text_color text, about_me text)
language plpgsql security definer set search_path to '' as $function$
declare v_player_id uuid := public.resolve_canonical_player_id(p_player_id);
declare v_background text := lower(btrim(p_background_color));
declare v_glow text := lower(btrim(p_glow_color));
declare v_text text := lower(btrim(p_text_color));
declare v_about text := nullif(btrim(replace(replace(p_about_me, chr(13) || chr(10), chr(10)), chr(13), chr(10))), '');
begin
  if not public.can_edit_player_profile_preferences(v_player_id) then raise exception 'You may edit only your own player profile' using errcode = '42501'; end if;
  if v_background !~ '^#[0-9a-f]{6}$' or v_glow !~ '^#[0-9a-f]{6}$' or v_text !~ '^#[0-9a-f]{6}$' then raise exception 'Profile colors must be six-digit hexadecimal colors'; end if;
  if char_length(v_about) > 500 then raise exception 'About Me must be 500 characters or fewer'; end if;
  if v_about ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'About Me contains unsupported control characters'; end if;
  insert into public.player_profile_preferences as pref (player_id, background_color, glow_color, text_color, about_me)
  values (v_player_id, v_background, v_glow, v_text, v_about)
  on conflict (player_id) do update set background_color = excluded.background_color, glow_color = excluded.glow_color, text_color = excluded.text_color, about_me = excluded.about_me, updated_at = now();
  return query select pref.player_id, pref.background_color, pref.glow_color, pref.text_color, pref.about_me from public.player_profile_preferences as pref where pref.player_id = v_player_id;
end;
$function$;

revoke all on function public.current_user_canonical_player_id() from public, anon, authenticated;
grant execute on function public.current_user_canonical_player_id() to authenticated;
revoke all on function public.get_public_player_profile_preferences(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_profile_preferences(uuid) to anon, authenticated;
revoke all on function public.get_public_player_profile_preferences_v2(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_profile_preferences_v2(uuid) to anon, authenticated;
revoke all on function public.get_public_player_profile_preferences_v3(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_profile_preferences_v3(uuid) to anon, authenticated;
revoke all on function public.can_edit_player_profile_preferences(uuid) from public, anon, authenticated;
grant execute on function public.can_edit_player_profile_preferences(uuid) to authenticated;
revoke all on function public.save_player_profile_preferences(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_player_profile_preferences(uuid,text,text,text,text) to authenticated;
revoke all on function public.save_player_profile_preferences_v2(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_player_profile_preferences_v2(uuid,text,text,text,text,text) to authenticated;
revoke all on function public.save_player_profile_preferences_v3(uuid,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_player_profile_preferences_v3(uuid,text,text,text,text,text,text) to authenticated;

commit;
