-- Authorized Masters admins may enter one player's scorecard while that
-- player's normal window is open. Player access and the normal scoring gate
-- remain unchanged; this service is still service-role-only and admin-route protected.

create or replace function public.admin_submit_major_scorecard_service(
  p_major_event_id uuid,
  p_play_day_id uuid,
  p_entry_id uuid,
  p_holes jsonb,
  p_actor_user_id uuid,
  p_actor_player_id uuid,
  p_actor_screen_name text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_entry public.major_entries;
  target_day public.major_play_days;
  scoring_window record;
  existing_card public.major_player_scorecards;
  card_id uuid;
  prior_status text;
  prior_access text;
  pars smallint[];
  score_snapshot jsonb;
begin
  if p_actor_user_id is null or nullif(btrim(p_actor_screen_name), '') is null then
    raise exception 'Authorized admin provenance is required' using errcode = '42501';
  end if;
  if length(coalesce(p_reason, '')) > 1000 then raise exception 'Reason is too long'; end if;
  if not exists (select 1 from public.major_events where id = p_major_event_id and slug = 'masters') then
    raise exception 'The late-score tool is restricted to the Masters event';
  end if;

  select * into target_entry
  from public.major_entries
  where id = p_entry_id and major_event_id = p_major_event_id and status in ('registered', 'confirmed');
  if not found then raise exception 'Active Masters entrant not found'; end if;

  select * into target_day from public.major_play_days where id = p_play_day_id and major_event_id = p_major_event_id;
  if not found then raise exception 'Masters round not found'; end if;
  if target_day.scoring_finalized_at is not null then raise exception 'This round is finalized and cannot accept a late score'; end if;

  select * into scoring_window from public.major_player_round_scoring_window(target_entry.player_id, target_day.id);
  if not found then raise exception 'A complete published room assignment is required'; end if;

  select * into existing_card from public.major_player_scorecards
  where entry_id = target_entry.id and play_day_id = target_day.id for update;
  prior_status := case when found then existing_card.status else null end;
  if prior_status in ('submitted', 'verified') then raise exception 'Submitted or verified scorecards cannot be overwritten'; end if;

  if jsonb_typeof(p_holes) <> 'array'
     or jsonb_array_length(p_holes) <> 18
     or (select count(distinct (item->>'hole_number')::integer) from jsonb_array_elements(p_holes) item) <> 18
     or exists (select 1 from jsonb_array_elements(p_holes) item
       where (item->>'hole_number')::integer not between 1 and 18
          or (item->>'strokes')::integer not between 1 and 99) then
    raise exception 'Enter one valid score for each of the 18 holes';
  end if;
  pars := public.masters_course_pars(target_day.day_number);
  if pars is null then raise exception 'Unsupported Masters round'; end if;
  prior_access := case
    when now() < scoring_window.room_start_at then 'before_room_start'
    when now() <= scoring_window.round_closes_at then 'normal_window_open'
    else 'closed_after_normal_deadline'
  end;

  insert into public.major_player_scorecards (
    major_event_id, play_day_id, entry_id, player_id, player_screen_name_snapshot, course_code
  ) values (
    p_major_event_id, target_day.id, target_entry.id, target_entry.player_id,
    target_entry.player_screen_name_snapshot, case when target_day.day_number <= 2 then 'CBE' else 'CBH' end
  )
  on conflict (entry_id, play_day_id) do update set updated_at = now()
    where public.major_player_scorecards.status in ('draft', 'reopened')
  returning id into card_id;
  if card_id is null then raise exception 'Submitted or verified scorecards cannot be overwritten'; end if;

  delete from public.major_player_scorecard_holes where scorecard_id = card_id;
  insert into public.major_player_scorecard_holes (scorecard_id, hole_number, par, strokes)
  select card_id, hole_number, pars[hole_number], strokes
  from (select (item->>'hole_number')::integer as hole_number, (item->>'strokes')::integer as strokes
        from jsonb_array_elements(p_holes) item) scores order by hole_number;

  select jsonb_agg(to_jsonb(hole) order by hole.hole_number) into score_snapshot
  from public.major_player_scorecard_holes hole where hole.scorecard_id = card_id;

  update public.major_player_scorecards
  set status = 'submitted', submitted_at = now(), submitted_by = null,
      verified_at = null, verified_by = null, verification_notes = null, updated_at = now()
  where id = card_id;

  insert into public.major_scorecard_audit_log (
    scorecard_id, action, actor_player_id, previous_status, next_status, score_snapshot, notes
  ) values (card_id, 'admin_score_entry', p_actor_player_id, prior_status, 'submitted', score_snapshot, nullif(btrim(p_reason), ''));

  insert into public.major_score_entry_admin_actions (
    major_event_id, play_day_id, entry_id, player_id, scorecard_id, action,
    actor_user_id, actor_player_id, actor_screen_name_snapshot, prior_access_state, reason, score_snapshot
  ) values (
    p_major_event_id, p_play_day_id, target_entry.id, target_entry.player_id, card_id,
    'admin_score_entry', p_actor_user_id, p_actor_player_id, btrim(p_actor_screen_name),
    prior_access, nullif(btrim(p_reason), ''), score_snapshot
  );
  return card_id;
end
$function$;

revoke all on function public.admin_submit_major_scorecard_service(uuid, uuid, uuid, jsonb, uuid, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.admin_submit_major_scorecard_service(uuid, uuid, uuid, jsonb, uuid, uuid, text, text)
to service_role;
