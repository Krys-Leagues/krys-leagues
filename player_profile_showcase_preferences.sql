begin;

alter table public.player_profile_preferences
  add column if not exists show_featured_trophy boolean not null default true,
  add column if not exists show_career_highlights boolean not null default true,
  add column if not exists show_recognition_box boolean not null default true,
  add column if not exists show_avatar_glow boolean not null default true,
  add column if not exists avatar_glow_color text,
  add column if not exists avatar_glow_strength smallint not null default 85,
  add column if not exists glass_style text not null default 'clear',
  add column if not exists blue_panel_glow boolean not null default true;

update public.player_profile_preferences
set avatar_glow_color = case
  when glow_color ~ '^#[0-9a-f]{6}$' then lower(glow_color)
  else '#ff2bd6'
end
where avatar_glow_color is null;

alter table public.player_profile_preferences
  alter column avatar_glow_color set default '#ff2bd6',
  alter column avatar_glow_color set not null;

alter table public.player_profile_preferences
  drop constraint if exists player_profile_preferences_avatar_glow_color_check,
  add constraint player_profile_preferences_avatar_glow_color_check check (avatar_glow_color ~ '^#[0-9a-f]{6}$'),
  drop constraint if exists player_profile_preferences_avatar_glow_strength_check,
  add constraint player_profile_preferences_avatar_glow_strength_check check (avatar_glow_strength between 15 and 100),
  drop constraint if exists player_profile_preferences_glass_style_check,
  add constraint player_profile_preferences_glass_style_check check (glass_style in ('clear', 'frosted', 'dark'));

create or replace function public.get_public_player_profile_preferences_v5(p_player_id uuid)
returns table(
  player_id uuid, background_key text, background_id uuid, background_path text,
  background_display_name text, name_effect text, background_color text, glow_color text,
  text_color text, about_me text, show_featured_trophy boolean,
  show_career_highlights boolean, show_recognition_box boolean, show_avatar_glow boolean,
  avatar_glow_color text, avatar_glow_strength smallint, glass_style text, blue_panel_glow boolean
)
language sql stable security definer set search_path to '' as $function$
  select
    canonical.id, coalesce(pref.background_key, 'krys-default'), background.id,
    background.storage_path, background.display_name,
    case
      when not coalesce(pref.name_effect_is_custom, false) then 'auto'
      when pref.name_effect = 'booster' and not canonical.is_server_booster then 'auto'
      when pref.name_effect = 'server-tag' and not canonical.has_krys_server_tag then 'auto'
      when pref.name_effect = 'both' and not (canonical.is_server_booster and canonical.has_krys_server_tag) then 'auto'
      when pref.name_effect = 'holographic' and not (canonical.profile_badges && array['Owner', 'Co-Head Admin', 'Tournament Admin', 'Admin']::text[]) then 'auto'
      else coalesce(pref.name_effect, 'auto')
    end,
    coalesce(pref.background_color, '#07111f'), coalesce(pref.glow_color, '#ff2bd6'),
    coalesce(pref.text_color, '#f8fafc'), nullif(btrim(pref.about_me), ''),
    coalesce(pref.show_featured_trophy, true), coalesce(pref.show_career_highlights, true),
    coalesce(pref.show_recognition_box, true), coalesce(pref.show_avatar_glow, true),
    coalesce(pref.avatar_glow_color, pref.glow_color, '#ff2bd6'),
    coalesce(pref.avatar_glow_strength, 85), coalesce(pref.glass_style, 'clear'),
    coalesce(pref.blue_panel_glow, true)
  from public.players as canonical
  left join public.player_profile_preferences as pref on pref.player_id = canonical.id
  left join public.approved_player_profile_backgrounds as background on background.id = pref.background_id
  where canonical.id = public.resolve_canonical_player_id(p_player_id);
$function$;

create or replace function public.save_player_profile_preferences_v5(
  p_player_id uuid, p_background_key text, p_background_id uuid, p_name_effect text,
  p_background_color text, p_glow_color text, p_text_color text, p_about_me text,
  p_show_featured_trophy boolean, p_show_career_highlights boolean,
  p_show_recognition_box boolean, p_show_avatar_glow boolean,
  p_avatar_glow_color text, p_avatar_glow_strength integer,
  p_glass_style text, p_blue_panel_glow boolean
) returns setof public.player_profile_preferences
language plpgsql security definer set search_path to '' as $function$
declare v_player_id uuid := public.resolve_canonical_player_id(p_player_id);
declare v_avatar_glow text := lower(btrim(p_avatar_glow_color));
declare v_glass text := lower(btrim(p_glass_style));
begin
  if not public.can_edit_player_profile_preferences(v_player_id) then
    raise exception 'You may edit only your own player profile' using errcode = '42501';
  end if;
  if v_avatar_glow !~ '^#[0-9a-f]{6}$' then raise exception 'Avatar glow color must be a six-digit hexadecimal color'; end if;
  if p_avatar_glow_strength not between 15 and 100 then raise exception 'Avatar glow strength must be between 15 and 100'; end if;
  if v_glass not in ('clear', 'frosted', 'dark') then raise exception 'Unsupported profile glass style'; end if;

  perform public.save_player_profile_preferences_v4(
    v_player_id, p_background_key, p_background_id, p_name_effect,
    p_background_color, p_glow_color, p_text_color, p_about_me
  );

  update public.player_profile_preferences as pref set
    show_featured_trophy = coalesce(p_show_featured_trophy, true),
    show_career_highlights = coalesce(p_show_career_highlights, true),
    show_recognition_box = coalesce(p_show_recognition_box, true),
    show_avatar_glow = coalesce(p_show_avatar_glow, true),
    avatar_glow_color = v_avatar_glow,
    avatar_glow_strength = p_avatar_glow_strength,
    glass_style = v_glass,
    blue_panel_glow = coalesce(p_blue_panel_glow, true),
    updated_at = now()
  where pref.player_id = v_player_id;

  return query select pref.* from public.player_profile_preferences as pref where pref.player_id = v_player_id;
end;
$function$;

revoke all on function public.get_public_player_profile_preferences_v5(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_profile_preferences_v5(uuid) to anon, authenticated;
revoke all on function public.save_player_profile_preferences_v5(uuid,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,text,integer,text,boolean) from public, anon, authenticated;
grant execute on function public.save_player_profile_preferences_v5(uuid,text,uuid,text,text,text,text,text,boolean,boolean,boolean,boolean,text,integer,text,boolean) to authenticated;

commit;
