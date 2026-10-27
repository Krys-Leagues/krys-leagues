-- Read-only postflight for the prepared 14-player KWTS15W01 activation proposal.
select count(*) as kwt_season15_anchor_rows from public.seasons where league_type = 'kwt' and season_number = 15;
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.kwt_public_content'::regclass
  and conname in ('kwt_public_content_content_type_check','kwt_feature_image_required')
order by conname;
select content_type, season_number, week_number, start_date, end_date, active, label from public.kwt_public_content where content_type = 'kwt_week_setup' and season_number = 15 and week_number = 1;
select count(*) as operational_rows, count(distinct player_id) as canonical_players, count(*) filter (where status = 'official') as official_rows, count(*) filter (where source_type = 'existing_kwt_website') as source_verified_rows from public.kwt_operational_results where season_number = 15 and week_number = 1;
select case when count(*) = 14 and count(distinct player_id) = 14 then 'PASS' else 'FAIL' end as expected_fourteen_player_activation from public.kwt_operational_results where season_number = 15 and week_number = 1;
select player_id, division, easy_score, hard_score, total_score, overall_placement, division_placement, points, status, source_type, source_reference from public.kwt_operational_results where season_number = 15 and week_number = 1 order by overall_placement, player_id;
select count(*) as published_rating_rows from public.handicap_publishable_rating_snapshots;
select count(*) as published_index_rows from public.handicap_publishable_index_snapshots;
