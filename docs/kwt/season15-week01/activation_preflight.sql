-- Read-only preflight for the prepared 14-player KWTS15W01 activation proposal.
-- Project: jfbndcwdsvsjgnzwvexp
select current_database() as database_name, current_setting('server_version') as postgres_version;
select 'kwt_public_content content-type guard requires additive kwt_week_setup expansion' as expected_schema_state, pg_get_constraintdef(oid) as current_constraint
from pg_constraint where conrelid = 'public.kwt_public_content'::regclass and conname = 'kwt_public_content_content_type_check';
select 'kwt_public_content image guard requires scoped kwt_week_setup exemption' as expected_image_state, pg_get_constraintdef(oid) as current_constraint
from pg_constraint where conrelid = 'public.kwt_public_content'::regclass and conname = 'kwt_feature_image_required';
do $preflight$
declare
  v_content_constraint text;
  v_image_constraint text;
begin
  select pg_get_constraintdef(oid) into v_content_constraint
  from pg_constraint
  where conrelid = 'public.kwt_public_content'::regclass and conname = 'kwt_public_content_content_type_check';
  if v_content_constraint is null or position('weekly_feature' in v_content_constraint) = 0 or position('calendar_week' in v_content_constraint) = 0 then
    raise exception 'Unexpected kwt_public_content content-type guard: %', v_content_constraint;
  end if;
  select pg_get_constraintdef(oid) into v_image_constraint
  from pg_constraint
  where conrelid = 'public.kwt_public_content'::regclass and conname = 'kwt_feature_image_required';
  if v_image_constraint is null or position('calendar_week' in lower(v_image_constraint)) = 0 or position('image_url is not null' in lower(v_image_constraint)) = 0 then
    raise exception 'Unexpected kwt_public_content image guard: %', v_image_constraint;
  end if;
end;
$preflight$;
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.kwt_public_content'::regclass,'public.kwt_operational_results'::regclass,'public.seasons'::regclass)
order by table_name, conname;
select c.relname as table_name, i.relname as index_name, pg_get_indexdef(i.oid) as index_definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_index ix on ix.indrelid = c.oid
join pg_class i on i.oid = ix.indexrelid
where n.nspname = 'public' and c.relname in ('kwt_public_content','kwt_operational_results','seasons')
order by table_name, index_name;
select event_object_table as table_name, trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public' and event_object_table in ('kwt_public_content','kwt_operational_results','seasons')
order by table_name, trigger_name;
select count(*) as conflicting_active_setup_rows from public.kwt_public_content where content_type = 'kwt_week_setup' and season_number = 15 and week_number = 1 and active;
select count(*) as existing_week01_operational_rows from public.kwt_operational_results where season_number = 15 and week_number = 1;
select case when count(*) = 0 then 'PASS' else 'BLOCK' end as no_existing_week01_rows_required from public.kwt_operational_results where season_number = 15 and week_number = 1;
select code, base_map, difficulty, display_name, active from public.all_time_courses where code in ('RCE','RCH') order by code;
select id, course_id, difficulty, course_rating, slope, review_scope, publication_status, model_version
from public.handicap_rating_snapshots where id in ('b470397b-b07a-5bb4-8575-b83804d7df34','0f19e813-655f-521f-bf29-1397ec14ccb1') order by id;
select subject_key, decision from public.handicap_review_decisions where subject_key in ('b470397b-b07a-5bb4-8575-b83804d7df34','0f19e813-655f-521f-bf29-1397ec14ccb1') order by subject_key, decision;
select count(*) as frozen_handicaps_for_expected_players
from public.handicap_publishable_index_snapshots
where canonical_player_id in ('2e4ce1d8-afd6-44a2-9560-f85c16f23747','a0eaf23c-0784-4eb9-ab1d-530b077121a9','69c0daa5-70b8-481b-94e5-a9d033bc75fb','d38c0220-8a80-45a6-86e8-d495f523d5ab','fbd60e4a-9d17-4556-9062-dc005a0c5723','6918df0a-cc2b-495a-8c09-b8be600ed0bc','ebcdd3f4-1a69-40f6-819e-899fbe9998d7','e2741a95-19e9-440c-a605-f1c1498aa5c1','e249815d-ac23-4ef7-9c20-7ed9ba0c57c4','ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0','6d74f565-dc1d-41e3-81e5-fd7e6b38e28d','b98df6d3-7e16-450f-bd17-f39d9903d1e1','c60ed0d8-1f05-4675-b635-342707607c18','bed410dd-2b89-4db3-8fe4-8226c21c3f5f') and effective_from <= date '2026-10-23';
