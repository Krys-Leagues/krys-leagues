begin;

alter table public.players
  add column if not exists avatar_path text;

comment on column public.players.avatar_path is
  'Krys-controlled Supabase Storage path for the canonical player avatar.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('player-avatars','player-avatars',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Public read canonical player avatars" on storage.objects;
-- The bucket is public for direct object delivery. No storage.objects SELECT
-- policy is granted, so anonymous users cannot list bucket contents.

drop policy if exists "Site admins read canonical player avatar objects" on storage.objects;
create policy "Site admins read canonical player avatar objects"
on storage.objects for select to authenticated
using (bucket_id='player-avatars' and public.is_current_user_site_admin());

drop policy if exists "Site admins upload canonical player avatars" on storage.objects;
create policy "Site admins upload canonical player avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id='player-avatars'
  and public.is_current_user_site_admin()
  and exists (
    select 1 from public.players as player
    where player.id::text=(storage.foldername(name))[1]
      and not exists (
        select 1 from public.player_identity_links as link
        where link.historical_player_id=player.id
      )
  )
);

drop policy if exists "Site admins update canonical player avatars" on storage.objects;
create policy "Site admins update canonical player avatars"
on storage.objects for update to authenticated
using (bucket_id='player-avatars' and public.is_current_user_site_admin())
with check (bucket_id='player-avatars' and public.is_current_user_site_admin());

drop policy if exists "Site admins remove canonical player avatars" on storage.objects;
create policy "Site admins remove canonical player avatars"
on storage.objects for delete to authenticated
using (bucket_id='player-avatars' and public.is_current_user_site_admin());

create or replace function public.set_site_player_avatar_path(
  p_player_id uuid,
  p_avatar_path text
)
returns table(player_id uuid,avatar_path text,previous_avatar_path text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_previous_path text;
  v_clean_path text:=nullif(btrim(p_avatar_path),'');
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required';
  end if;
  if p_player_id is null then raise exception 'Player ID is required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('site-player-avatar',0));
  select player.avatar_path into v_previous_path
  from public.players as player
  where player.id=p_player_id
  for update;
  if not found then raise exception 'Player UUID is invalid'; end if;
  if exists(select 1 from public.player_identity_links as link where link.historical_player_id=p_player_id) then
    raise exception 'Avatar changes must target the canonical player UUID';
  end if;
  if v_clean_path is not null and v_clean_path !~ ('^'||p_player_id::text||'/avatar-[0-9]+[.](png|jpg|jpeg|webp)$') then
    raise exception 'Avatar path must use the canonical player UUID and an allowed image extension';
  end if;

  update public.players as player set avatar_path=v_clean_path where player.id=p_player_id;
  return query select p_player_id,v_clean_path,v_previous_path;
end;
$function$;

revoke all on function public.set_site_player_avatar_path(uuid,text) from public,anon,authenticated;
grant execute on function public.set_site_player_avatar_path(uuid,text) to authenticated;

create or replace function public.preview_site_player_avatar_merge(
  p_keep_player_id uuid,
  p_merge_player_ids uuid[]
)
returns table(avatar_conflict boolean,avatar_candidates jsonb)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_merge_ids uuid[];
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required'; end if;
  select array_agg(distinct value order by value) into v_merge_ids
  from unnest(p_merge_player_ids) as value where value is not null and value<>p_keep_player_id;
  if p_keep_player_id is null or coalesce(cardinality(v_merge_ids),0)<1 then raise exception 'KEEP and MERGE players are required'; end if;

  return query
  with candidates as (
    select player.id,player.screen_name,player.avatar_path
    from public.players as player
    where (player.id=p_keep_player_id or player.id=any(v_merge_ids)) and player.avatar_path is not null
  )
  select count(distinct candidate.avatar_path)>1,
         coalesce(jsonb_agg(jsonb_build_object('player_id',candidate.id,'screen_name',candidate.screen_name,'avatar_path',candidate.avatar_path)
                  order by candidate.screen_name,candidate.id) filter(where candidate.id is not null),'[]'::jsonb)
  from candidates as candidate;
end;
$function$;

revoke all on function public.preview_site_player_avatar_merge(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.preview_site_player_avatar_merge(uuid,uuid[]) to authenticated;

create or replace function public.resolve_site_player_avatar_merge_conflict(
  p_keep_player_id uuid,
  p_merge_player_ids uuid[],
  p_selected_avatar_path text
)
returns table(player_id uuid,avatar_path text)
language plpgsql
security definer
set search_path to ''
as $function$
declare v_merge_ids uuid[]; v_selected_path text:=nullif(btrim(p_selected_avatar_path),'');
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required'; end if;
  select array_agg(distinct value order by value) into v_merge_ids
  from unnest(p_merge_player_ids) as value where value is not null and value<>p_keep_player_id;
  if p_keep_player_id is null or coalesce(cardinality(v_merge_ids),0)<1 or v_selected_path is null then raise exception 'KEEP, MERGE, and selected avatar are required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('site-player-avatar',0));
  perform 1 from public.players as player
  where player.id=p_keep_player_id or player.id=any(v_merge_ids)
  order by player.id for update;
  if (select count(*) from public.players as player where player.id=p_keep_player_id or player.id=any(v_merge_ids))<>cardinality(v_merge_ids)+1 then
    raise exception 'One or more selected players do not exist';
  end if;
  if not exists(
    select 1 from public.players as player
    where (player.id=p_keep_player_id or player.id=any(v_merge_ids)) and player.avatar_path=v_selected_path
  ) then raise exception 'Selected avatar is not owned by this reviewed identity family'; end if;

  update public.players as player set avatar_path=null where player.id=any(v_merge_ids);
  update public.players as player set avatar_path=v_selected_path where player.id=p_keep_player_id;
  return query select p_keep_player_id,v_selected_path;
end;
$function$;

revoke all on function public.resolve_site_player_avatar_merge_conflict(uuid,uuid[],text) from public,anon,authenticated;
grant execute on function public.resolve_site_player_avatar_merge_conflict(uuid,uuid[],text) to authenticated;

create or replace function public.get_public_player_avatar(
  p_player_id uuid
)
returns table(
  canonical_player_id uuid,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_canonical_id uuid;
begin
  if p_player_id is null then raise exception 'Player ID is required'; end if;
  v_canonical_id:=public.resolve_canonical_player_id(p_player_id);
  if v_canonical_id is null or not exists(select 1 from public.players as player where player.id=v_canonical_id) then return; end if;
  return query select canonical.id,canonical.avatar_path
  from public.players as canonical where canonical.id=v_canonical_id;
end;
$function$;

revoke all on function public.get_public_player_avatar(uuid) from public,anon,authenticated;
grant execute on function public.get_public_player_avatar(uuid) to anon,authenticated;

commit;
