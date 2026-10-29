begin;

-- This migration deliberately does not infer canonical ownership from names.
-- Run trophy_system_pre_migration_diagnostic.sql and review its output first.

alter table public.player_trophies add column if not exists source_key text;
alter table public.player_trophies add column if not exists legacy_player_tracker_id uuid;

comment on column public.player_trophies.player_id is 'Authoritative trophy owner: canonical public.players.id. NULL means unresolved and reviewable.';
comment on column public.player_trophies.player_name is 'Historical/display provenance only; never an ownership key.';
comment on column public.player_trophies.legacy_player_tracker_id is 'Preserved pre-migration player_tracker ownership reference; never canonical ownership.';
comment on column public.player_trophies.source_key is 'Stable asset path or uploaded-file SHA-256 used for idempotent imports.';

-- Preserve every old tracker reference before changing the FK. Existing rows are
-- intentionally left unresolved instead of guessing identity from text or UUID overlap.
-- On a rerun after migration, canonical player IDs are left untouched.
do $block$
declare v_constraint record; v_has_tracker_fk boolean; v_has_players_fk boolean;
begin
  select exists(
    select 1 from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as target_table on target_table.oid=constraint_row.confrelid
    join pg_catalog.pg_namespace as target_namespace on target_namespace.oid=target_table.relnamespace
    where constraint_row.conrelid='public.player_trophies'::pg_catalog.regclass and constraint_row.contype='f'
      and target_namespace.nspname='public' and target_table.relname='player_tracker'
  ) into v_has_tracker_fk;
  select exists(
    select 1 from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as target_table on target_table.oid=constraint_row.confrelid
    join pg_catalog.pg_namespace as target_namespace on target_namespace.oid=target_table.relnamespace
    where constraint_row.conrelid='public.player_trophies'::pg_catalog.regclass and constraint_row.contype='f'
      and target_namespace.nspname='public' and target_table.relname='players'
  ) into v_has_players_fk;

  if v_has_tracker_fk then
    update public.player_trophies set legacy_player_tracker_id=player_id
    where player_id is not null and legacy_player_tracker_id is null;
    update public.player_trophies set player_id=null where player_id is not null;
  elsif not v_has_players_fk then
    raise exception 'Unexpected player_trophies.player_id architecture; run trophy_system_pre_migration_diagnostic.sql before migration';
  end if;

  for v_constraint in
    select constraint_row.conname
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as source_table on source_table.oid=constraint_row.conrelid
    join pg_catalog.pg_namespace as source_namespace on source_namespace.oid=source_table.relnamespace
    join pg_catalog.pg_class as target_table on target_table.oid=constraint_row.confrelid
    join pg_catalog.pg_namespace as target_namespace on target_namespace.oid=target_table.relnamespace
    where constraint_row.contype='f' and source_namespace.nspname='public' and source_table.relname='player_trophies'
      and target_namespace.nspname='public' and target_table.relname='player_tracker'
      and (select attribute.attnum from pg_catalog.pg_attribute as attribute where attribute.attrelid=source_table.oid and attribute.attname='player_id')=any(constraint_row.conkey)
  loop
    execute pg_catalog.format('alter table public.player_trophies drop constraint %I',v_constraint.conname);
  end loop;
end
$block$;

-- Resolve only exact, verified aliases with exactly one canonical candidate.
-- Zero-match and multi-match trophies remain NULL for admin review. Trophy row
-- IDs are deliberately not consulted as identity evidence.
with verified_candidates as (
  select trophy.id as trophy_id,
    (array_agg(distinct public.resolve_canonical_player_id(alias.player_id))
      filter(where public.resolve_canonical_player_id(alias.player_id) is not null))[1] as canonical_player_id,
    count(distinct public.resolve_canonical_player_id(alias.player_id)) as candidate_count
  from public.player_trophies as trophy
  join public.player_aliases as alias
    on alias.verified
   and regexp_replace(lower(alias.alias),'[^a-z0-9]','','g')=regexp_replace(lower(trophy.player_name),'[^a-z0-9]','','g')
  where trophy.player_id is null
  group by trophy.id
)
update public.player_trophies as trophy
set player_id=candidate.canonical_player_id
from verified_candidates as candidate
where trophy.id=candidate.trophy_id and candidate.candidate_count=1 and candidate.canonical_player_id is not null;

do $block$
begin
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.player_trophies'::pg_catalog.regclass and conname='player_trophies_player_id_players_fk') then
    alter table public.player_trophies add constraint player_trophies_player_id_players_fk foreign key(player_id) references public.players(id) not valid;
  end if;
end
$block$;
alter table public.player_trophies validate constraint player_trophies_player_id_players_fk;

create unique index if not exists player_trophies_source_key_unique on public.player_trophies(source_key) where source_key is not null;
create index if not exists player_trophies_player_id_index on public.player_trophies(player_id) where player_id is not null;
create index if not exists player_trophies_legacy_tracker_index on public.player_trophies(legacy_player_tracker_id) where legacy_player_tracker_id is not null;

alter table public.player_trophies enable row level security;
-- Production currently has unconditional mutation policies. Remove every
-- existing trophy policy before installing the intended read/admin boundary.
do $block$
declare v_policy record;
begin
  for v_policy in select policyname from pg_policies where schemaname='public' and tablename='player_trophies'
  loop
    execute pg_catalog.format('drop policy %I on public.player_trophies',v_policy.policyname);
  end loop;
end
$block$;

create policy "Public read player trophies" on public.player_trophies for select to anon,authenticated using(true);
create policy "Site admins insert player trophies" on public.player_trophies for insert to authenticated with check(public.is_current_user_site_admin());
create policy "Site admins update player trophies" on public.player_trophies for update to authenticated using(public.is_current_user_site_admin()) with check(public.is_current_user_site_admin());
create policy "Site admins delete player trophies" on public.player_trophies for delete to authenticated using(public.is_current_user_site_admin());

create or replace function public.enforce_canonical_player_trophy_owner()
returns trigger language plpgsql set search_path to '' as $function$
begin
  if new.player_id is null then return new; end if;
  if not exists(select 1 from public.players as player where player.id=new.player_id) then raise exception 'Trophy owner must exist in public.players'; end if;
  if exists(select 1 from public.player_identity_links as link where link.historical_player_id=new.player_id) then raise exception 'Trophy ownership must target canonical public.players.id'; end if;
  return new;
end;
$function$;

drop trigger if exists enforce_canonical_player_trophy_owner on public.player_trophies;
create trigger enforce_canonical_player_trophy_owner before insert or update of player_id on public.player_trophies for each row execute function public.enforce_canonical_player_trophy_owner();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('trophy-images','trophy-images',true,52428800,array['image/png','image/jpeg','image/webp','image/gif','video/mp4'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Site admins read trophy images" on storage.objects;
create policy "Site admins read trophy images" on storage.objects for select to authenticated using(bucket_id='trophy-images' and public.is_current_user_site_admin());
drop policy if exists "Site admins upload trophy images" on storage.objects;
create policy "Site admins upload trophy images" on storage.objects for insert to authenticated with check(
  bucket_id='trophy-images' and public.is_current_user_site_admin()
  and exists(select 1 from public.players as player where player.id::text=(storage.foldername(name))[1]
    and not exists(select 1 from public.player_identity_links as link where link.historical_player_id=player.id))
);
drop policy if exists "Site admins remove trophy images" on storage.objects;
create policy "Site admins remove trophy images" on storage.objects for delete to authenticated using(bucket_id='trophy-images' and public.is_current_user_site_admin());

commit;
