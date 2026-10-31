-- Keep the established public Masters results RPC as the single live source while
-- exposing the complete registered field and withholding private weekend-field data.
create or replace function public.get_public_major_live_results(p_major_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
select jsonb_build_object(
  'event', jsonb_build_object(
    'id', e.id,
    'slug', e.slug,
    'name', e.name,
    'year', e.year,
    'is_test_event', e.is_test_event
  ),
  'notice', 'SCORES ARE UNOFFICIAL UNTIL VERIFIED.',
  'active_day_number', (
    select min(day_number)
    from public.major_play_days
    where major_event_id = e.id
      and scoring_entry_open
  ),
  'entrants', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'entry_id', me.id,
        'player_id', me.player_id,
        'player_screen_name_snapshot', me.player_screen_name_snapshot
      )
      order by lower(me.player_screen_name_snapshot), me.id
    )
    from public.major_entries me
    where me.major_event_id = e.id
      and me.status in ('registered', 'confirmed')
  ), '[]'::jsonb),
  'rounds', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'play_day_id', d.id,
        'day_number', d.day_number,
        'label', d.label,
        'course_code', case when d.day_number <= 2 then 'CBE' else 'CBH' end,
        'is_entry_open', d.scoring_entry_open,
        'is_finalized', d.scoring_finalized_at is not null,
        'cards', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', c.id,
              'major_event_id', c.major_event_id,
              'play_day_id', c.play_day_id,
              'entry_id', c.entry_id,
              'player_id', c.player_id,
              'player_screen_name_snapshot', c.player_screen_name_snapshot,
              'day_number', d.day_number,
              'day_label', d.label,
              'course_code', c.course_code,
              'status', c.status,
              'submitted_at', c.submitted_at,
              'verified_at', c.verified_at,
              'verification_notes', c.verification_notes,
              'total_strokes', (
                select sum(h.strokes)
                from public.major_player_scorecard_holes h
                where h.scorecard_id = c.id
              ),
              'score_to_par', (
                select sum(h.strokes - h.par)
                from public.major_player_scorecard_holes h
                where h.scorecard_id = c.id
              ),
              'holes', (
                select jsonb_agg(
                  jsonb_build_object(
                    'hole_number', h.hole_number,
                    'par', h.par,
                    'strokes', h.strokes
                  )
                  order by h.hole_number
                )
                from public.major_player_scorecard_holes h
                where h.scorecard_id = c.id
              )
            )
            order by (
              select sum(h.strokes)
              from public.major_player_scorecard_holes h
              where h.scorecard_id = c.id
            )
          )
          from public.major_player_scorecards c
          where c.play_day_id = d.id
            and c.status in ('submitted', 'verified')
        ), '[]'::jsonb)
      )
      order by d.day_number
    )
    from public.major_play_days d
    where d.major_event_id = e.id
  ), '[]'::jsonb),
  'snapshots', coalesce((
    select jsonb_agg(to_jsonb(s))
    from public.major_round_standing_snapshots s
    where s.major_event_id = e.id
  ), '[]'::jsonb)
)
from public.major_events e
where e.id = p_major_event_id
  and (
    (not e.is_test_event and e.is_public)
    or (
      e.is_test_event
      and auth.uid() is not null
      and (
        public.is_current_user_site_admin()
        or exists (
          select 1
          from public.major_test_event_testers t
          where t.major_event_id = e.id
            and t.player_id = public.current_major_player_id()
        )
      )
    )
  );
$function$;
