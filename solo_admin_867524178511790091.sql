-- Install only after solo_usability_admin_patch.sql.
-- Resolves the existing canonical player and Discord-authenticated account; creates neither.
do $assignment$
declare
  target_discord_id constant text := '867524178511790091';
  target_player_id uuid;
  target_user_id uuid;
begin
  select player.id into strict target_player_id
  from public.players as player
  where nullif(btrim(player.discord_id), '') = target_discord_id;

  select identity.user_id into strict target_user_id
  from auth.identities as identity
  where identity.provider = 'discord'
    and coalesce(
      identity.identity_data ->> 'provider_id',
      identity.identity_data ->> 'id',
      identity.identity_data ->> 'sub'
    ) = target_discord_id;

  insert into public.solo_admin_users(user_id, player_id)
  values(target_user_id, target_player_id)
  on conflict (user_id) do update set player_id = excluded.player_id;
exception
  when no_data_found then
    raise exception 'Existing canonical player and authenticated Discord account % are both required', target_discord_id;
  when too_many_rows then
    raise exception 'Discord identity % is not uniquely linked; resolve identity data before granting Solo access', target_discord_id;
end;
$assignment$;
