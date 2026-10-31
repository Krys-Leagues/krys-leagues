begin;

-- Additive reader version for distinguishing system defaults from a saved profile.
-- This migration does not write to, delete from, or reinterpret any profile row.
create or replace function public.get_public_player_profile_preferences_v6(p_player_id uuid)
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
  about_me text,
  show_featured_trophy boolean,
  show_career_highlights boolean,
  show_recognition_box boolean,
  show_avatar_glow boolean,
  avatar_glow_color text,
  avatar_glow_strength smallint,
  glass_style text,
  blue_panel_glow boolean,
  has_saved_preferences boolean
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
    nullif(btrim(pref.about_me), ''),
    coalesce(pref.show_featured_trophy, true),
    coalesce(pref.show_career_highlights, true),
    coalesce(pref.show_recognition_box, true),
    coalesce(pref.show_avatar_glow, true),
    coalesce(pref.avatar_glow_color, pref.glow_color, '#ff2bd6'),
    coalesce(pref.avatar_glow_strength, 85),
    coalesce(pref.glass_style, 'clear'),
    coalesce(pref.blue_panel_glow, true),
    pref.player_id is not null
  from public.players as canonical
  left join public.player_profile_preferences as pref on pref.player_id = canonical.id
  left join public.approved_player_profile_backgrounds as background on background.id = pref.background_id
  where canonical.id = public.resolve_canonical_player_id(p_player_id);
$function$;

revoke all on function public.get_public_player_profile_preferences_v6(uuid) from public, anon, authenticated;
grant execute on function public.get_public_player_profile_preferences_v6(uuid) to anon, authenticated;

commit;
