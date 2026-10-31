begin;

-- Legacy live rows are not auto-converted. Every tuple must be explicitly
-- reviewed against canonical player IDs and a managed season team.
create table if not exists public.doubles_legacy_canonical_mapping_review (
  id uuid primary key default gen_random_uuid(),
  legacy_source text not null check (legacy_source in ('doubles_teams','schedule','results')),
  legacy_team_key text not null,
  legacy_team_name text not null,
  legacy_player_1_name text,
  legacy_player_2_name text,
  legacy_player_1_id uuid,
  legacy_player_2_id uuid,
  season_id uuid references public.seasons(id) on delete restrict,
  division text,
  canonical_global_team_id uuid references public.doubles_global_teams(id) on delete restrict,
  canonical_season_team_id uuid references public.doubles_managed_season_teams(id) on delete restrict,
  status text not null default 'needs_review' check (status in ('needs_review','approved','rejected','ambiguous')),
  provenance jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  unique (legacy_source, legacy_team_key, season_id, division)
);
alter table public.doubles_legacy_canonical_mapping_review enable row level security;
revoke all on table public.doubles_legacy_canonical_mapping_review from public, anon, authenticated;

create or replace function public.approve_doubles_legacy_mapping(p_review_id uuid,p_global_team_id uuid,p_season_team_id uuid)
returns boolean
language plpgsql security definer set search_path to '' as $function$
declare v_review public.doubles_legacy_canonical_mapping_review%rowtype; v_team public.doubles_global_teams%rowtype; v_season_team public.doubles_managed_season_teams%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  select * into v_review from public.doubles_legacy_canonical_mapping_review where id=p_review_id for update;
  if not found then raise exception 'Legacy mapping review was not found'; end if;
  select * into v_team from public.doubles_global_teams where id=p_global_team_id;
  select * into v_season_team from public.doubles_managed_season_teams where id=p_season_team_id;
  if not found or v_season_team.global_team_id <> p_global_team_id or v_review.season_id is distinct from v_season_team.season_id then raise exception 'Canonical team does not match the reviewed season context'; end if;
  if v_review.legacy_player_1_id is not null and v_review.legacy_player_1_id is distinct from v_team.player_1_id then raise exception 'Legacy Player 1 does not exactly match the canonical team'; end if;
  if v_review.legacy_player_2_id is not null and v_review.legacy_player_2_id is distinct from v_team.player_2_id then raise exception 'Legacy Player 2 does not exactly match the canonical team'; end if;
  update public.doubles_legacy_canonical_mapping_review set canonical_global_team_id=p_global_team_id,canonical_season_team_id=p_season_team_id,status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=p_review_id;
  return true;
end;
$function$;

revoke all on function public.approve_doubles_legacy_mapping(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_doubles_legacy_mapping(uuid,uuid,uuid) to authenticated;

commit;
