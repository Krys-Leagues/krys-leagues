begin;

alter table public.player_profile_preferences
  add column if not exists background_id uuid
  references public.approved_player_profile_backgrounds(id) on delete set null;

create or replace function public.get_public_player_profile_preferences_v4(p_player_id uuid)
returns table(
  player_id uuid,
  background_key text,
  background_id uuid,
  background_path text,
  background_display_name text,
  name_effect text,
  background_color text,
  glow_color text,
  text_color text,
  about_me text
)
language sql stable security definer set search_path to '' as $function$
  select
    canonical.id,
    coalesce(pref.background_key, 'krys-default'),
    background.id,
    background.storage_path,
    background.display_name,
    case
      when not coalesce(pref.name_effect_is_custom, false) then 'auto'
      when pref.name_effect = 'booster' and not canonical.is_server_booster then 'auto'
      when pref.name_effect = 'server-tag' and not canonical.has_krys_server_tag then 'auto'
      when pref.name_effect = 'both' and not (canonical.is_server_booster and canonical.has_krys_server_tag) then 'auto'
      when pref.name_effect = 'holographic' and not (canonical.profile_badges && array['Owner', 'Co-Head Admin', 'Tournament Admin', 'Admin']::text[]) then 'auto'
      else coalesce(pref.name_effect, 'auto')
    end,
    coalesce(pref.background_color, '#07111f'),
    coalesce(pref.glow_color, '#ff2bd6'),
    coalesce(pref.text_color, '#f8fafc'),
    nullif(btrim(pref.about_me), '')
  from public.players as canonical
  left join public.player_profile_preferences as pref on pref.player_id = canonical.id
  left join public.approved_player_profile_backgrounds as background on background.id = pref.background_id
  where canonical.id = public.resolve_canonical_player_id(p_player_id);
$function$;

create or replace function public.save_player_profile_preferences_v4(
  p_player_id uuid,
  p_background_key text,
  p_background_id uuid,
  p_name_effect text,
  p_background_color text,
  p_glow_color text,
  p_text_color text,
  p_about_me text
) returns table(
  player_id uuid,
  background_key text,
  background_id uuid,
  background_path text,
  background_display_name text,
  name_effect text,
  background_color text,
  glow_color text,
  text_color text,
  about_me text
)
language plpgsql security definer set search_path to '' as $function$
declare v_player_id uuid := public.resolve_canonical_player_id(p_player_id);
declare v_background_key text := lower(btrim(p_background_key));
declare v_current_background_key text;
declare v_current_background_id uuid;
declare v_name_effect text := lower(btrim(p_name_effect));
declare v_is_server_booster boolean := false;
declare v_has_krys_server_tag boolean := false;
declare v_profile_badges text[] := array[]::text[];
declare v_is_staff boolean := false;
declare v_background text := lower(btrim(p_background_color));
declare v_glow text := lower(btrim(p_glow_color));
declare v_text text := lower(btrim(p_text_color));
declare v_about text := nullif(btrim(replace(replace(p_about_me, chr(13) || chr(10), chr(10)), chr(13), chr(10))), '');
begin
  if not public.can_edit_player_profile_preferences(v_player_id) then
    raise exception 'You may edit only your own player profile' using errcode = '42501';
  end if;

  select player.is_server_booster, player.has_krys_server_tag, player.profile_badges
  into v_is_server_booster, v_has_krys_server_tag, v_profile_badges
  from public.players as player
  where player.id = v_player_id;

  select pref.background_key, pref.background_id
  into v_current_background_key, v_current_background_id
  from public.player_profile_preferences as pref
  where pref.player_id = v_player_id;

  if p_background_id is not null then
    if not exists (
      select 1
      from public.approved_player_profile_backgrounds as background
      where background.id = p_background_id
        and (background.active or background.id = v_current_background_id)
    ) then
      raise exception 'Choose an approved Player Profile background';
    end if;
    v_background_key := 'krys-default';
  elsif v_background_key is null
    or (v_background_key <> 'krys-default' and v_background_key is distinct from v_current_background_key) then
    raise exception 'Unsupported player profile background';
  end if;

  v_is_staff := coalesce(v_profile_badges, array[]::text[]) && array['Owner', 'Co-Head Admin', 'Tournament Admin', 'Admin']::text[];
  if v_name_effect is null or v_name_effect not in ('auto', 'white', 'booster', 'server-tag', 'both', 'holographic') then raise exception 'Unsupported player name effect'; end if;
  if v_name_effect = 'booster' and not v_is_server_booster then raise exception 'Server Booster name effect requires Server Booster recognition' using errcode = '42501'; end if;
  if v_name_effect = 'server-tag' and not v_has_krys_server_tag then raise exception 'Server Tag name effect requires Server Tag recognition' using errcode = '42501'; end if;
  if v_name_effect = 'both' and not (v_is_server_booster and v_has_krys_server_tag) then raise exception 'Booster + Tag name effect requires both recognitions' using errcode = '42501'; end if;
  if v_name_effect = 'holographic' and not v_is_staff then raise exception 'Holographic name effect requires a staff presentation badge' using errcode = '42501'; end if;
  if v_background !~ '^#[0-9a-f]{6}$' or v_glow !~ '^#[0-9a-f]{6}$' or v_text !~ '^#[0-9a-f]{6}$' then raise exception 'Profile colors must be six-digit hexadecimal colors'; end if;
  if char_length(v_about) > 500 then raise exception 'About Me must be 500 characters or fewer'; end if;
  if v_about ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then raise exception 'About Me contains unsupported control characters'; end if;

  insert into public.player_profile_preferences as pref (
    player_id, background_key, background_id, name_effect, name_effect_is_custom,
    background_color, glow_color, text_color, about_me
  ) values (
    v_player_id, v_background_key, p_background_id, v_name_effect, true,
    v_background, v_glow, v_text, v_about
  )
  on conflict on constraint player_profile_preferences_pkey do update set
    background_key = excluded.background_key,
    background_id = excluded.background_id,
    name_effect = excluded.name_effect,
    name_effect_is_custom = true,
    background_color = excluded.background_color,
    glow_color = excluded.glow_color,
    text_color = excluded.text_color,
    about_me = excluded.about_me,
    updated_at = now();

  return query
  select
    pref.player_id,
    pref.background_key,
    background.id,
    background.storage_path,
    background.display_name,
    pref.name_effect,
    pref.background_color,
    pref.glow_color,
    pref.text_color,
    pref.about_me
  from public.player_profile_preferences as pref
  left join public.approved_player_profile_backgrounds as background on background.id = pref.background_id
  where pref.player_id = v_player_id;
end;
$function$;

revoke all on function public.get_public_player_profile_preferences_v4(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_profile_preferences_v4(uuid) to anon, authenticated;
revoke all on function public.save_player_profile_preferences_v4(uuid,text,uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.save_player_profile_preferences_v4(uuid,text,uuid,text,text,text,text,text) to authenticated;

commit;
