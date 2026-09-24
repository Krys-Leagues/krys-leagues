begin;

-- Local-only additive runtime for the canonical Doubles workflow.  Walkabout
-- evidence remains a separate concern until its team-result calculation is
-- explicitly defined.
create table if not exists public.doubles_final_scorecards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references public.seasons(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','approved','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approval_note text,
  updated_at timestamptz not null default now()
);

alter table public.doubles_final_scorecards enable row level security;
revoke all on table public.doubles_final_scorecards from public, anon, authenticated;

create or replace function public.generate_doubles_final_scorecard(p_season_id uuid)
returns table(scorecard_id uuid, season_id uuid, status text, division_count integer, fixture_count integer, completed_fixture_count integer)
language plpgsql security definer set search_path to '' as $function$
declare
  v_card public.doubles_final_scorecards%rowtype;
  v_fixture_count integer;
  v_completed_count integer;
  v_division_count integer;
  v_payload jsonb;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.seasons s where s.id = p_season_id and lower(btrim(s.league_type)) = 'doubles') then
    raise exception 'Season is not a managed Doubles season';
  end if;
  if not exists (select 1 from public.doubles_managed_season_teams t where t.season_id = p_season_id and t.status = 'active') then
    raise exception 'An approved canonical Doubles roster is required';
  end if;
  select count(*)::integer, count(*) filter (where exists (select 1 from public.doubles_managed_results r where r.fixture_id = f.id))::integer,
         count(distinct f.division)::integer
    into v_fixture_count, v_completed_count, v_division_count
    from public.doubles_managed_fixtures f where f.season_id = p_season_id and f.status <> 'cancelled';
  if v_fixture_count < 1 or v_fixture_count <> v_completed_count then
    raise exception 'All required Doubles fixtures must be complete before the Final Scorecard';
  end if;
  select * into v_card from public.doubles_final_scorecards where season_id = p_season_id for update;
  if found and v_card.status = 'approved' then raise exception 'An approved Doubles Final Scorecard already exists'; end if;
  select jsonb_build_object(
    'season_id', p_season_id,
    'divisions', coalesce((select jsonb_agg(jsonb_build_object(
      'division', s.division,
      'teams', (select coalesce(jsonb_agg(to_jsonb(st) order by st.rank, st.team_name_snapshot), '[]'::jsonb)
        from public.doubles_managed_standings st where st.season_id = p_season_id and st.division = s.division),
      'fixtures', (select coalesce(jsonb_agg(jsonb_build_object('fixture', f, 'result', r) order by f.game_number), '[]'::jsonb)
        from public.doubles_managed_fixtures f join public.doubles_managed_results r on r.fixture_id = f.id
        where f.season_id = p_season_id and f.division = s.division)
    ) order by s.division), '[]'::jsonb)
      from (select distinct division from public.doubles_managed_fixtures where season_id = p_season_id) s)
  ) into v_payload;
  if v_card.id is null then
    insert into public.doubles_final_scorecards(season_id,status,payload,generated_by)
      values (p_season_id,'draft',v_payload,auth.uid()) returning * into v_card;
  else
    update public.doubles_final_scorecards set status='draft', payload=v_payload, generated_at=now(), generated_by=auth.uid(), updated_at=now()
      where id=v_card.id returning * into v_card;
  end if;
  return query select v_card.id, v_card.season_id, v_card.status, v_division_count, v_fixture_count, v_completed_count;
end;
$function$;

create or replace function public.approve_doubles_final_scorecard(p_scorecard_id uuid, p_note text default null)
returns public.doubles_final_scorecards
language plpgsql security definer set search_path to '' as $function$
declare v_card public.doubles_final_scorecards%rowtype;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  select * into v_card from public.doubles_final_scorecards where id=p_scorecard_id for update;
  if not found or v_card.status <> 'draft' then raise exception 'A draft Doubles Final Scorecard is required'; end if;
  update public.doubles_final_scorecards set status='approved', approved_at=now(), approved_by=auth.uid(), approval_note=p_note, updated_at=now()
    where id=p_scorecard_id returning * into v_card;
  return v_card;
end;
$function$;

create or replace function public.finalize_doubles_season(p_season_id uuid)
returns integer
language plpgsql security definer set search_path to '' as $function$
declare v_card public.doubles_final_scorecards%rowtype; v_division text; v_count integer := 0; v_inserted integer := 0;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode='42501'; end if;
  select * into v_card from public.doubles_final_scorecards where season_id=p_season_id and status='approved' for share;
  if not found then raise exception 'An approved Doubles Final Scorecard is required'; end if;
  if exists (select 1 from public.doubles_managed_fixtures f where f.season_id=p_season_id and f.status <> 'cancelled' and not exists (select 1 from public.doubles_managed_results r where r.fixture_id=f.id)) then
    raise exception 'All required Doubles fixtures must be complete';
  end if;
  insert into public.doubles_season_lifecycle(season_id,state,updated_at,updated_by) values(p_season_id,'FINALIZING',now(),auth.uid())
    on conflict (season_id) do update set state='FINALIZING',updated_at=excluded.updated_at,updated_by=excluded.updated_by
    where public.doubles_season_lifecycle.state <> 'HISTORICAL';
  for v_division in select distinct division from public.doubles_managed_season_teams where season_id=p_season_id and status='active' loop
    insert into public.doubles_final_snapshots(season_id,division,payload,finalized_by)
    select p_season_id,v_division,jsonb_build_object(
      'season_id',p_season_id,'division',v_division,'final_scorecard_id',v_card.id,
      'teams',(select coalesce(jsonb_agg(to_jsonb(t) order by t.order_position),'[]'::jsonb) from public.doubles_managed_season_teams t where t.season_id=p_season_id and t.division=v_division and t.status='active'),
      'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.doubles_season_team_members m join public.doubles_managed_season_teams t on t.id=m.season_team_id where m.season_id=p_season_id and t.division=v_division),
      'replacements',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.doubles_season_member_replacements r where r.season_id=p_season_id and r.season_team_id in (select id from public.doubles_managed_season_teams where season_id=p_season_id and division=v_division)),
      'fixtures',(select coalesce(jsonb_agg(to_jsonb(f) order by f.game_number),'[]'::jsonb) from public.doubles_managed_fixtures f where f.season_id=p_season_id and f.division=v_division),
      'results',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.doubles_managed_results r join public.doubles_managed_fixtures f on f.id=r.fixture_id where f.season_id=p_season_id and f.division=v_division),
      'standings',(select coalesce(jsonb_agg(to_jsonb(s) order by s.rank),'[]'::jsonb) from public.doubles_managed_standings s where s.season_id=p_season_id and s.division=v_division)
    ),auth.uid() where not exists (select 1 from public.doubles_final_snapshots x where x.season_id=p_season_id and x.division=v_division);
    get diagnostics v_inserted = row_count;
    v_count := v_count + v_inserted;
    update public.doubles_board_mappings set sync_state='HISTORICAL',last_error=null where season_id=p_season_id and division=v_division;
  end loop;
  update public.doubles_season_lifecycle set state='HISTORICAL',updated_at=now(),updated_by=auth.uid() where season_id=p_season_id;
  return v_count;
end;
$function$;

revoke all on function public.generate_doubles_final_scorecard(uuid) from public, anon, authenticated;
revoke all on function public.approve_doubles_final_scorecard(uuid,text) from public, anon, authenticated;
revoke all on function public.finalize_doubles_season(uuid) from public, anon, authenticated;
grant execute on function public.generate_doubles_final_scorecard(uuid) to authenticated;
grant execute on function public.approve_doubles_final_scorecard(uuid,text) to authenticated;
grant execute on function public.finalize_doubles_season(uuid) to authenticated;

commit;
