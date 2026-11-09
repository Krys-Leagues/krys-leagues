-- PROPOSAL ONLY — DO NOT APPLY WITHOUT OWNER APPROVAL.
--
-- Narrow public read contract for the recovered KWT Season 15 Week 1 NET board.
-- This function is read-only: it does not publish, insert, update, delete, or
-- expose the protected source tables. It returns only the fields needed by the
-- player-facing board. The existing server-only reader remains available for
-- private/administrative use.

create or replace function public.get_public_kwt_net_week()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_batch record;
  v_easy_slope numeric;
  v_hard_slope numeric;
  v_easy_hole_pars jsonb;
  v_hard_hole_pars jsonb;
  v_rows jsonb;
begin
  select b.id, b.source_season, b.source_week, b.event_identifier, b.course_name,
         b.easy_course_code, b.hard_course_code, b.result_status
    into v_batch
  from public.kwt_current_import_batches as b
  where b.event_identifier = 'KWTS15W01'
    and b.source_season = 15
    and b.source_week = 1
    and b.status = 'COMMITTED'
    and lower(b.result_status) in ('official', 'verified', 'final')
  order by b.committed_at desc nulls last, b.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('state', 'UNAVAILABLE', 'reason', 'NO_VERIFIED_EVENT', 'event', null, 'rows', '[]'::jsonb);
  end if;

  -- Week 1 uses the already-approved rating references used by the recovered
  -- application. The ACCEPT decision is required; no new rating is created.
  select
    max(s.slope) filter (where s.id = 'b470397b-b07a-5bb4-8575-b83804d7df34'::uuid),
    max(s.slope) filter (where s.id = '0f19e813-655f-521f-bf29-1397ec14ccb1'::uuid)
    into v_easy_slope, v_hard_slope
  from public.handicap_rating_snapshots as s
  where s.id in (
    'b470397b-b07a-5bb4-8575-b83804d7df34'::uuid,
    '0f19e813-655f-521f-bf29-1397ec14ccb1'::uuid
  )
    and s.course_id in ('Raptor Cliff''s_easy', 'Raptor Cliff''s_hard')
    and s.review_scope = 'KWT_ONLY'
    and s.publication_status = 'UNPUBLISHED'
    and s.model_version = 'krys-course-rating-elite-lowest-12-v1'
    and exists (
      select 1
      from public.handicap_review_decisions as d
      where d.subject_key = s.id::text
        and d.decision = 'ACCEPT'
    );

  if v_easy_slope is null or v_hard_slope is null then
    return jsonb_build_object(
      'state', 'UNAVAILABLE',
      'reason', 'NO_VERIFIED_RATINGS',
      'event', jsonb_build_object(
        'eventIdentifier', v_batch.event_identifier,
        'season', v_batch.source_season,
        'week', v_batch.source_week,
        'courseName', v_batch.course_name
      ),
      'rows', '[]'::jsonb
    );
  end if;

  select c.hole_pars into v_easy_hole_pars
  from public.all_time_courses as c
  where c.code = v_batch.easy_course_code and c.active = true;
  select c.hole_pars into v_hard_hole_pars
  from public.all_time_courses as c
  where c.code = v_batch.hard_course_code and c.active = true;

  if v_easy_hole_pars is null or v_hard_hole_pars is null then
    return jsonb_build_object('state', 'UNAVAILABLE', 'reason', 'NO_VERIFIED_RATINGS', 'event', null, 'rows', '[]'::jsonb);
  end if;

  with source_rows as (
    select r.*
    from public.kwt_current_import_rows as r
    where r.batch_id = v_batch.id
      and r.identity_status in ('MATCHED', 'MANUAL')
      and r.canonical_player_id is not null
      and r.easy_course_code = v_batch.easy_course_code
      and r.hard_course_code = v_batch.hard_course_code
  ),
  handicap_candidates as (
    select i.canonical_player_id,
           i.resulting_index,
           i.created_at,
           nullif(to_jsonb(i) ->> 'effective_from', '')::date as effective_from
    from public.handicap_publishable_index_snapshots as i
    where i.resulting_index is not null
  ),
  frozen_handicaps as (
    select h.*,
           row_number() over (
             partition by h.canonical_player_id
             order by h.effective_from desc, h.created_at desc
           ) as snapshot_rank
    from handicap_candidates as h
    where h.effective_from is not null
      and h.effective_from <= date '2026-10-23'
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'playerId', r.canonical_player_id,
      'screenName', p.screen_name,
      'division', r.division,
      'easyGross', r.easy_score,
      'hardGross', r.hard_score,
      'handicapIndex', h.resulting_index,
      'handicapStatus', case when h.resulting_index is null then 'UNPUBLISHED' else 'OFFICIAL' end,
      'resultStatus', 'FINAL',
      'badges', case
        when coalesce(easy.has_bogey_free, false) and coalesce(hard.has_bogey_free, false) then jsonb_build_array('COCONUT')
        when coalesce(easy.has_bogey_free, false) then jsonb_build_array('KIWI_EASY')
        when coalesce(hard.has_bogey_free, false) then jsonb_build_array('KIWI_HARD')
        else '[]'::jsonb
      end
    ) order by r.overall_placement nulls last, p.screen_name
  ), '[]'::jsonb)
    into v_rows
  from source_rows as r
  join public.players as p on p.id = r.canonical_player_id
  left join lateral (
    select h.resulting_index
    from frozen_handicaps as h
    where h.canonical_player_id = r.canonical_player_id
      and h.snapshot_rank = 1
  ) as h on true
  left join lateral (
    select coalesce(bool_or(strokes.value::integer > pars.value::integer), false) as has_bogey_free
    from unnest(r.easy_holes) with ordinality as strokes(value, hole_no)
    join jsonb_array_elements_text(v_easy_hole_pars) with ordinality as pars(value, hole_no)
      on pars.hole_no = strokes.hole_no
  ) as easy on true
  left join lateral (
    select coalesce(bool_or(strokes.value::integer > pars.value::integer), false) as has_bogey_free
    from unnest(r.hard_holes) with ordinality as strokes(value, hole_no)
    join jsonb_array_elements_text(v_hard_hole_pars) with ordinality as pars(value, hole_no)
      on pars.hole_no = strokes.hole_no
  ) as hard on true
  where p.screen_name is not null;

  if jsonb_array_length(v_rows) = 0 then
    return jsonb_build_object(
      'state', 'UNAVAILABLE',
      'reason', 'NO_VERIFIED_RESULTS',
      'event', jsonb_build_object(
        'eventIdentifier', v_batch.event_identifier,
        'season', v_batch.source_season,
        'week', v_batch.source_week,
        'courseName', v_batch.course_name
      ),
      'rows', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'state', 'AVAILABLE',
    'event', jsonb_build_object(
      'eventIdentifier', v_batch.event_identifier,
      'season', v_batch.source_season,
      'week', v_batch.source_week,
      'courseName', v_batch.course_name,
      'freezeCutoff', '2026-10-23T04:00:00Z',
      'easySlope', v_easy_slope,
      'hardSlope', v_hard_slope
    ),
    'rows', v_rows
  );
end;
$function$;

alter function public.get_public_kwt_net_week() owner to postgres;
revoke all on function public.get_public_kwt_net_week() from public, anon, authenticated;
grant execute on function public.get_public_kwt_net_week() to anon, authenticated;
comment on function public.get_public_kwt_net_week() is
  'Read-only whitelist for the verified KWT Season 15 Week 1 NET board; never grants table access or exposes scorecard evidence.';
