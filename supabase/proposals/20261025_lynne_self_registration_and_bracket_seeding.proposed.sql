-- Additive follow-up for Lynne's Tournament Builder.
-- The base migration's admin_create_tournament required every slot to be
-- populated at creation time. This contract creates an empty registration
-- roster safely, lets players self-register, and seeds only confirmed players
-- after registration closes. It does not alter existing tournament rows.

begin;

create or replace function public.admin_create_tournament(
  p_name text,
  p_slug text,
  p_template_id uuid,
  p_bracket_size integer,
  p_status text,
  p_rules jsonb,
  p_rounds jsonb,
  p_entrants jsonb,
  p_schedule_preset text,
  p_schedule_timezone text,
  p_start_at timestamptz,
  p_overall_deadline_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_round integer;
  v_match integer;
  v_rounds integer;
  v_match_count integer;
  v_first_seed integer;
  v_player_id uuid;
  v_seed integer;
  v_player_timezone text;
  v_entrant_count integer;
  v_entrants jsonb := coalesce(p_entrants, '[]'::jsonb);
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if p_bracket_size not in (32, 64) then raise exception 'Bracket size must be 32 or 64'; end if;
  if coalesce(p_schedule_preset, 'NORMAL') not in ('NORMAL', 'ONE_DAY', 'CUSTOM') then raise exception 'Invalid schedule preset'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(coalesce(p_schedule_timezone, 'America/New_York'))) then raise exception 'A valid IANA schedule time zone is required'; end if;
  if jsonb_typeof(v_entrants) <> 'array' then raise exception 'Entrants must be a JSON array'; end if;
  v_entrant_count := jsonb_array_length(v_entrants);
  if v_entrant_count not in (0, p_bracket_size) then raise exception 'Provide zero entrants for public registration, or exactly the full bracket size for an approved manual seed'; end if;
  v_rounds := floor(log(2, p_bracket_size))::integer;
  if jsonb_typeof(coalesce(p_rounds, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_rounds, '[]'::jsonb)) <> v_rounds then raise exception 'Every bracket round must have an explicit course and rules snapshot'; end if;
  if p_status not in ('draft', 'registration_open', 'registration_closed') then raise exception 'A tournament can only be created before it goes live'; end if;
  insert into public.tournaments(name, slug, template_id, bracket_size, registration_capacity, status, rules, schedule_preset, schedule_timezone, start_at, overall_deadline_at, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), p_template_id, p_bracket_size, p_bracket_size, p_status, coalesce(p_rules, '{}'::jsonb), coalesce(p_schedule_preset, 'NORMAL'), btrim(coalesce(p_schedule_timezone, 'America/New_York')), p_start_at, p_overall_deadline_at, auth.uid()) returning id into v_tournament_id;

  if v_entrant_count = p_bracket_size then
    for v_seed in 1..p_bracket_size loop
      v_player_id := public.resolve_canonical_player_id((v_entrants -> (v_seed - 1) ->> 'player_id')::uuid);
      if v_player_id is null then raise exception 'Every selected entrant must resolve to a canonical Global Player'; end if;
      v_player_timezone := btrim(v_entrants -> (v_seed - 1) ->> 'player_timezone');
      if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_player_timezone) then raise exception 'Every entrant must have a confirmed IANA player time zone'; end if;
      insert into public.tournament_registrations(tournament_id, player_id, seed, status, player_timezone, timezone_confirmed_at) values (v_tournament_id, v_player_id, v_seed, 'confirmed', v_player_timezone, now());
    end loop;
  end if;

  for v_round in 1..v_rounds loop
    insert into public.tournament_rounds(tournament_id, round_number, name, is_final, course_config, scoring_rules, tiebreaker_rules)
    values (v_tournament_id, v_round, case when v_round = v_rounds then 'Final' else 'Round ' || v_round end, v_round = v_rounds, coalesce(p_rounds -> (v_round - 1) -> 'course_config', '{}'::jsonb), coalesce(p_rounds -> (v_round - 1) -> 'scoring_rules', '{}'::jsonb), coalesce(p_rounds -> (v_round - 1) -> 'tiebreaker_rules', '{}'::jsonb));
    if v_entrant_count = p_bracket_size then
      v_match_count := p_bracket_size / (2 ^ v_round);
      for v_match in 1..v_match_count loop
        if v_round = 1 then
          v_first_seed := ((v_match - 1) * 2) + 1;
          insert into public.tournament_matches(tournament_id, round_number, match_number, stable_key, slot_a, slot_b, player_a_id, player_b_id)
          values (v_tournament_id, v_round, v_match, 'r1m' || v_match, jsonb_build_object('type','seed','seed',v_first_seed), jsonb_build_object('type','seed','seed',v_first_seed + 1), (select player_id from public.tournament_registrations where tournament_id = v_tournament_id and seed = v_first_seed), (select player_id from public.tournament_registrations where tournament_id = v_tournament_id and seed = v_first_seed + 1));
        else
          v_first_seed := ((v_match - 1) * 2) + 1;
          insert into public.tournament_matches(tournament_id, round_number, match_number, stable_key, slot_a, slot_b)
          values (v_tournament_id, v_round, v_match, 'r' || v_round || 'm' || v_match, jsonb_build_object('type','match','match_key','r' || (v_round - 1) || 'm' || v_first_seed,'outcome','winner'), jsonb_build_object('type','match','match_key','r' || (v_round - 1) || 'm' || (v_first_seed + 1),'outcome','winner'));
        end if;
      end loop;
    end if;
  end loop;
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id) values (v_tournament_id, 'created', jsonb_build_object('bracket_size', p_bracket_size, 'template_id', p_template_id, 'registration_mode', case when v_entrant_count = 0 then 'public_self_registration' else 'admin_seeded' end), auth.uid());
  return v_tournament_id;
end;
$$;

create or replace function public.admin_add_tournament_registration(
  p_tournament_id uuid,
  p_player_id uuid,
  p_player_timezone text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_player_id uuid;
  v_registration_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'A written reason is required for a manual registration'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(p_player_timezone)) then raise exception 'A valid IANA player time zone is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tournament-registration:' || p_tournament_id::text, 0));
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Tournament was not found'; end if;
  if v_tournament.status not in ('draft', 'registration_open') then raise exception 'Manual registration is closed for this tournament'; end if;
  v_player_id := public.resolve_canonical_player_id(p_player_id);
  if v_player_id is null then raise exception 'The player must resolve to an active canonical Global Player'; end if;
  if exists (select 1 from public.tournament_registrations where tournament_id = p_tournament_id and player_id = v_player_id and status = 'confirmed') then raise exception 'This player is already registered'; end if;
  if (select count(*) from public.tournament_registrations where tournament_id = p_tournament_id and status = 'confirmed') >= v_tournament.registration_capacity then raise exception 'This tournament is full'; end if;
  insert into public.tournament_registrations(tournament_id, player_id, status, player_timezone, timezone_confirmed_at) values (p_tournament_id, v_player_id, 'confirmed', btrim(p_player_timezone), now()) returning id into v_registration_id;
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id) values (p_tournament_id, 'manual_registration_added', jsonb_build_object('registration_id', v_registration_id, 'player_id', v_player_id, 'reason', btrim(p_reason)), auth.uid());
  return jsonb_build_object('registration_id', v_registration_id, 'player_id', v_player_id, 'status', 'confirmed');
end;
$$;

create or replace function public.admin_seed_tournament(
  p_tournament_id uuid,
  p_player_order jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_order jsonb := coalesce(p_player_order, '[]'::jsonb);
  v_order_count integer;
  v_round integer;
  v_match integer;
  v_first_seed integer;
  v_rounds integer;
  v_match_count integer;
  v_player_id uuid;
  v_index integer;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if jsonb_typeof(v_order) <> 'array' then raise exception 'Player order must be a JSON array'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tournament-seed:' || p_tournament_id::text, 0));
  select * into v_tournament from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Tournament was not found'; end if;
  if v_tournament.status <> 'registration_closed' then raise exception 'Close registration before creating the bracket'; end if;
  v_order_count := jsonb_array_length(v_order);
  if v_order_count <> v_tournament.bracket_size then raise exception 'Seed order must contain every confirmed registration exactly once'; end if;
  if (select count(*) from public.tournament_registrations where tournament_id = p_tournament_id and status = 'confirmed') <> v_tournament.bracket_size then raise exception 'The bracket cannot be seeded until the registration capacity is full'; end if;
  if exists (select 1 from public.tournament_matches where tournament_id = p_tournament_id) then raise exception 'This tournament has already been seeded'; end if;
  for v_index in 0..(v_order_count - 1) loop
    v_player_id := public.resolve_canonical_player_id((v_order ->> v_index)::uuid);
    if v_player_id is null then raise exception 'Every seed must resolve to a canonical Global Player'; end if;
    if (select count(*) from jsonb_array_elements_text(v_order) as item where item::uuid = v_player_id) <> 1 then raise exception 'Seed order contains a duplicate or invalid player'; end if;
    if not exists (select 1 from public.tournament_registrations where tournament_id = p_tournament_id and player_id = v_player_id and status = 'confirmed') then raise exception 'Every seed must be a confirmed registration for this tournament'; end if;
    update public.tournament_registrations set seed = v_index + 1 where tournament_id = p_tournament_id and player_id = v_player_id;
  end loop;
  v_rounds := floor(log(2, v_tournament.bracket_size))::integer;
  for v_round in 1..v_rounds loop
    v_match_count := v_tournament.bracket_size / (2 ^ v_round);
    for v_match in 1..v_match_count loop
      if v_round = 1 then
        v_first_seed := ((v_match - 1) * 2) + 1;
        insert into public.tournament_matches(tournament_id, round_number, match_number, stable_key, slot_a, slot_b, player_a_id, player_b_id)
        values (p_tournament_id, v_round, v_match, 'r1m' || v_match, jsonb_build_object('type','seed','seed',v_first_seed), jsonb_build_object('type','seed','seed',v_first_seed + 1), (select player_id from public.tournament_registrations where tournament_id = p_tournament_id and seed = v_first_seed), (select player_id from public.tournament_registrations where tournament_id = p_tournament_id and seed = v_first_seed + 1));
      else
        v_first_seed := ((v_match - 1) * 2) + 1;
        insert into public.tournament_matches(tournament_id, round_number, match_number, stable_key, slot_a, slot_b)
        values (p_tournament_id, v_round, v_match, 'r' || v_round || 'm' || v_match, jsonb_build_object('type','match','match_key','r' || (v_round - 1) || 'm' || v_first_seed,'outcome','winner'), jsonb_build_object('type','match','match_key','r' || (v_round - 1) || 'm' || (v_first_seed + 1),'outcome','winner'));
      end if;
    end loop;
  end loop;
  insert into public.tournament_audit_log(tournament_id, action, details, actor_id) values (p_tournament_id, 'bracket_seeded', jsonb_build_object('bracket_size', v_tournament.bracket_size, 'player_order', v_order), auth.uid());
  return jsonb_build_object('tournament_id', p_tournament_id, 'status', 'seeded', 'matches', (select count(*) from public.tournament_matches where tournament_id = p_tournament_id));
end;
$$;

revoke all on function public.admin_create_tournament(text, text, uuid, integer, text, jsonb, jsonb, jsonb, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_create_tournament(text, text, uuid, integer, text, jsonb, jsonb, jsonb, text, text, timestamptz, timestamptz) to authenticated, service_role;
revoke all on function public.admin_add_tournament_registration(uuid, uuid, text, text) from public, anon;
grant execute on function public.admin_add_tournament_registration(uuid, uuid, text, text) to authenticated, service_role;
revoke all on function public.admin_seed_tournament(uuid, jsonb) from public, anon;
grant execute on function public.admin_seed_tournament(uuid, jsonb) to authenticated, service_role;

commit;
