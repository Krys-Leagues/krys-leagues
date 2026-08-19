begin;

alter table public.player_trophies
  add column if not exists source_key text;

comment on column public.player_trophies.player_id is
  'Authoritative trophy owner: canonical public.players.id. Player-name text is display metadata only.';
comment on column public.player_trophies.source_key is
  'Stable asset path or uploaded-file SHA-256 used for idempotent trophy imports.';

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid='public.player_trophies'::pg_catalog.regclass
      and conname='player_trophies_player_id_players_fk'
  ) then
    alter table public.player_trophies
      add constraint player_trophies_player_id_players_fk
      foreign key (player_id) references public.players(id) not valid;
  end if;
end
$block$;

create unique index if not exists player_trophies_source_key_unique
  on public.player_trophies(source_key)
  where source_key is not null;

alter table public.player_trophies enable row level security;
drop policy if exists "Public read player trophies" on public.player_trophies;
create policy "Public read player trophies" on public.player_trophies for select to anon,authenticated using (true);
drop policy if exists "Site admins insert player trophies" on public.player_trophies;
create policy "Site admins insert player trophies" on public.player_trophies for insert to authenticated with check (public.is_current_user_site_admin());
drop policy if exists "Site admins update player trophies" on public.player_trophies;
create policy "Site admins update player trophies" on public.player_trophies for update to authenticated using (public.is_current_user_site_admin()) with check (public.is_current_user_site_admin());
drop policy if exists "Site admins delete player trophies" on public.player_trophies;
create policy "Site admins delete player trophies" on public.player_trophies for delete to authenticated using (public.is_current_user_site_admin());

create or replace function public.enforce_canonical_player_trophy_owner()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.player_id is null then raise exception 'A canonical player ID is required'; end if;
  if exists (
    select 1 from public.player_identity_links as link
    where link.historical_player_id=new.player_id
  ) then raise exception 'Trophy ownership must target the canonical public.players.id'; end if;
  return new;
end;
$function$;

drop trigger if exists enforce_canonical_player_trophy_owner on public.player_trophies;
create trigger enforce_canonical_player_trophy_owner
before insert or update of player_id on public.player_trophies
for each row execute function public.enforce_canonical_player_trophy_owner();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('trophy-images','trophy-images',true,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Site admins read trophy images" on storage.objects;
create policy "Site admins read trophy images" on storage.objects for select to authenticated
using (bucket_id='trophy-images' and public.is_current_user_site_admin());

drop policy if exists "Site admins upload trophy images" on storage.objects;
create policy "Site admins upload trophy images" on storage.objects for insert to authenticated
with check (
  bucket_id='trophy-images'
  and public.is_current_user_site_admin()
  and exists (
    select 1 from public.players as player
    where player.id::text=(storage.foldername(name))[1]
      and not exists (select 1 from public.player_identity_links as link where link.historical_player_id=player.id)
  )
);

drop policy if exists "Site admins remove trophy images" on storage.objects;
create policy "Site admins remove trophy images" on storage.objects for delete to authenticated
using (bucket_id='trophy-images' and public.is_current_user_site_admin());

commit;
