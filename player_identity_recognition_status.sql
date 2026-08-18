begin;

alter table public.players
  add column if not exists is_server_booster boolean not null default false,
  add column if not exists has_krys_server_tag boolean not null default false,
  add column if not exists profile_badges text[] not null default array[]::text[];

comment on column public.players.is_server_booster is
  'Canonical Krys recognition status. Presentation only; grants no permissions.';
comment on column public.players.has_krys_server_tag is
  'Canonical Krys server-tag recognition status. Presentation only; grants no permissions.';
comment on column public.players.profile_badges is
  'Canonical public-profile recognition labels. Presentation only; grants no permissions.';

alter table public.players
  drop constraint if exists players_profile_badges_allowed;
alter table public.players
  add constraint players_profile_badges_allowed
  check (
    profile_badges <@ array['Owner', 'Co-Head Admin', 'Tournament Admin']::text[]
  );

-- PostgreSQL requires the function to be dropped before adding OUT columns.
-- This remains the existing canonical public identity read path.
drop function if exists public.get_public_player_canonical_identity(uuid);

create function public.get_public_player_canonical_identity(
  p_player_id uuid
)
returns table(
  canonical_player_id uuid,
  canonical_screen_name text,
  identity_player_ids uuid[],
  aliases text[],
  discord_linked boolean,
  is_server_booster boolean,
  has_krys_server_tag boolean,
  profile_badges text[]
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_canonical_id uuid;
begin
  if p_player_id is null then
    raise exception 'Player ID is required';
  end if;

  v_canonical_id := public.resolve_canonical_player_id(p_player_id);

  if v_canonical_id is null or not exists (
    select 1 from public.players as player where player.id = v_canonical_id
  ) then
    return;
  end if;

  return query
  select
    canonical.id,
    canonical.screen_name,
    (select array_agg(identity_player.player_id order by identity_player.player_id)
     from public.get_canonical_player_identity_ids(v_canonical_id) as identity_player),
    coalesce((select array_agg(distinct alias_row.alias order by alias_row.alias)
              from public.player_aliases as alias_row
              where alias_row.player_id = v_canonical_id), array[]::text[]),
    nullif(btrim(canonical.discord_id), '') is not null,
    canonical.is_server_booster,
    canonical.has_krys_server_tag,
    canonical.profile_badges
  from public.players as canonical
  where canonical.id = v_canonical_id;
end;
$function$;

revoke all on function public.get_public_player_canonical_identity(uuid) from public;
revoke all on function public.get_public_player_canonical_identity(uuid) from anon;
revoke all on function public.get_public_player_canonical_identity(uuid) from authenticated;
grant execute on function public.get_public_player_canonical_identity(uuid) to anon;
grant execute on function public.get_public_player_canonical_identity(uuid) to authenticated;

create temporary table player_recognition_seed (
  reference_name text primary key,
  is_server_booster boolean not null,
  has_krys_server_tag boolean not null,
  profile_badge text null
) on commit drop;

insert into player_recognition_seed(
  reference_name, is_server_booster, has_krys_server_tag, profile_badge
)
values
  ('northerncitymp', false, true, null),
  ('HAPHAZARDOAK007', false, true, null),
  ('PUTT_NIC', false, true, null),
  ('LYNNIEBODD', false, true, 'Tournament Admin'),
  ('YANKEEDUDE1123', false, true, null),
  ('ALYSSA38', false, true, null),
  ('TRICKYDICKY', false, true, null),
  ('PRINCESS_BANIKSHOT', true, true, 'Owner'),
  ('DAWNSOPHIA', true, true, 'Co-Head Admin'),
  ('DMD ENDITNOW', true, false, null),
  ('DADSQUATCHER', true, false, null),
  ('NUTTY GRANDPA', true, false, null),
  ('D3BB13', true, false, null),
  ('EL JORGE', true, false, null),
  ('MASTER_KP', true, false, null),
  ('SAVY', true, false, null),
  ('SHEZ', true, false, null),
  ('UROPA', true, false, null);

create temporary table player_recognition_resolution on commit drop as
with candidate_matches as (
  select
    seed.reference_name,
    public.resolve_canonical_player_id(player.id) as canonical_player_id,
    'screen_name'::text as matched_source,
    player.screen_name as matched_value
  from player_recognition_seed as seed
  join public.players as player
    on public.normalize_player_identity_name(player.screen_name)
       = public.normalize_player_identity_name(seed.reference_name)

  union all

  select
    seed.reference_name,
    public.resolve_canonical_player_id(alias_row.player_id) as canonical_player_id,
    'verified_alias'::text as matched_source,
    alias_row.alias as matched_value
  from player_recognition_seed as seed
  join public.player_aliases as alias_row
    on alias_row.verified
   and public.normalize_player_identity_name(alias_row.alias)
       = public.normalize_player_identity_name(seed.reference_name)
), canonical_matches as (
  select distinct
    match.reference_name,
    match.canonical_player_id
  from candidate_matches as match
  where match.canonical_player_id is not null
)
select
  seed.reference_name,
  count(match.canonical_player_id)::integer as canonical_match_count,
  min(match.canonical_player_id::text)::uuid as canonical_player_id
from player_recognition_seed as seed
left join canonical_matches as match
  on match.reference_name = seed.reference_name
group by seed.reference_name;

do $resolution$
declare
  v_ambiguous text;
  v_unresolved text;
begin
  select string_agg(reference_name, ', ' order by reference_name)
  into v_ambiguous
  from player_recognition_resolution
  where canonical_match_count > 1;

  if v_ambiguous is not null then
    raise exception 'Ambiguous player recognition references: %', v_ambiguous;
  end if;

  select string_agg(reference_name, ', ' order by reference_name)
  into v_unresolved
  from player_recognition_resolution
  where canonical_match_count = 0;

  if v_unresolved is not null then
    raise notice 'Unresolved player recognition references skipped: %', v_unresolved;
  end if;
end;
$resolution$;

update public.players as player
set
  is_server_booster = seed.is_server_booster,
  has_krys_server_tag = seed.has_krys_server_tag,
  profile_badges = case
    when seed.profile_badge is null then player.profile_badges
    else array(
      select distinct badge
      from unnest(player.profile_badges || array[seed.profile_badge]) as badge
      order by badge
    )
  end
from player_recognition_seed as seed
join player_recognition_resolution as resolution
  on resolution.reference_name = seed.reference_name
 and resolution.canonical_match_count = 1
where player.id = resolution.canonical_player_id;

-- The final result set is an installation report. Unresolved references are
-- intentionally retained as unresolved rather than guessed or fuzzy-matched.
select
  resolution.reference_name,
  case resolution.canonical_match_count
    when 0 then 'unresolved'
    when 1 then 'resolved'
    else 'ambiguous'
  end as resolution_status,
  resolution.canonical_player_id,
  canonical.screen_name as canonical_screen_name
from player_recognition_resolution as resolution
left join public.players as canonical
  on canonical.id = resolution.canonical_player_id
order by resolution.reference_name;

commit;
