begin;

alter table public.all_time_courses add column if not exists image_url text null;
alter table public.all_time_courses add column if not exists par integer null;
alter table public.all_time_courses add column if not exists release_date date null;

insert into public.all_time_courses (code, base_map, difficulty, display_name, active)
values
  ('AWE', 'Around The World', 'Easy', 'Around The World Easy', true),
  ('AWH', 'Around The World', 'Hard', 'Around The World Hard', true)
on conflict (code) do update set
  base_map = excluded.base_map,
  difficulty = excluded.difficulty,
  display_name = excluded.display_name,
  active = excluded.active,
  updated_at = now();

insert into public.all_time_course_source_mappings (source_type, source_course_name, difficulty, course_id)
select 'historical_workbook', 'Around The World', course.difficulty, course.id
from public.all_time_courses course
where course.code in ('AWE', 'AWH')
on conflict (source_type, source_course_name, difficulty) do update
set course_id = excluded.course_id;

create or replace function public.apply_all_time_record_import(p_batch jsonb, p_observations jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_user_id uuid := auth.uid(); v_batch_id uuid; v_batch_created boolean := false;
  v_item jsonb; v_course public.all_time_courses%rowtype; v_observation_id uuid;
  v_player_id uuid; v_existing_score integer; v_scanned integer := 0;
  v_observations_inserted integer := 0; v_duplicate_source_rows integer := 0;
  v_new_records integer := 0; v_better_scores integer := 0; v_equal_scores integer := 0;
  v_worse_scores integer := 0; v_unresolved integer := 0; v_ambiguous integer := 0;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  if v_user_id is null then raise exception 'Authentication is required' using errcode = '42501'; end if;
  if p_batch is null or jsonb_typeof(p_batch) <> 'object' then raise exception 'Batch metadata is required'; end if;
  if p_observations is null or jsonb_typeof(p_observations) <> 'array' then raise exception 'Observations must be a JSON array'; end if;
  if p_batch->>'source_type' <> 'historical_workbook' or p_batch->>'source_worksheet' <> 'All Time'
     or coalesce(p_batch->>'original_filename', '') = '' or coalesce(p_batch->>'file_sha256', '') !~ '^[0-9a-f]{64}$'
  then raise exception 'Historical workbook batch metadata is invalid'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('site-player-identity-merge', 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('all-time-record-import:' || (p_batch->>'file_sha256'), 0));
  select batch.id into v_batch_id from public.all_time_source_batches batch
  where batch.source_type = 'historical_workbook' and batch.file_sha256 = p_batch->>'file_sha256'
    and coalesce(batch.source_worksheet, '') = 'All Time' for update;
  if not found then
    insert into public.all_time_source_batches (source_type, original_filename, source_worksheet, file_sha256, imported_by, metadata)
    values ('historical_workbook', p_batch->>'original_filename', 'All Time', p_batch->>'file_sha256', v_user_id, coalesce(p_batch->'metadata', '{}'::jsonb))
    returning id into v_batch_id; v_batch_created := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_observations) loop
    v_observation_id := null; v_player_id := null; v_scanned := v_scanned + 1;
    if coalesce(v_item->>'course_code', '') = '' or coalesce(v_item->>'source_course_name', '') = ''
       or coalesce(v_item->>'historical_player_name', '') = '' or coalesce(v_item->>'fingerprint', '') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_item->'score') <> 'number'
    then raise exception 'Observation % is invalid for an individual All-Time course', v_scanned; end if;

    select course.* into v_course from public.all_time_courses course
    join public.all_time_course_source_mappings mapping on mapping.course_id = course.id
    where course.code = v_item->>'course_code' and course.active
      and course.difficulty in ('Easy', 'Hard') and mapping.source_type = 'historical_workbook'
      and mapping.source_course_name = v_item->>'source_course_name' and mapping.difficulty = course.difficulty;
    if not found then raise exception 'Course is unknown, inactive, Combined, or does not match its historical source mapping'; end if;

    if v_item->>'identity_status' = 'resolved' then
      if nullif(v_item->>'player_id', '') is null or public.resolve_canonical_player_id((v_item->>'player_id')::uuid) is null
      then raise exception 'Resolved observation % has no valid canonical player UUID', v_scanned; end if;
      v_player_id := public.resolve_canonical_player_id((v_item->>'player_id')::uuid);
      if not exists (select 1 from public.players player where player.id = v_player_id)
      then raise exception 'Resolved observation % has no valid canonical player UUID', v_scanned; end if;
    elsif v_item->>'identity_status' not in ('unresolved', 'ambiguous') or nullif(v_item->>'player_id', '') is not null
    then raise exception 'Observation % identity status is invalid', v_scanned; end if;

    insert into public.all_time_record_observations
      (batch_id, course_id, player_id, identity_status, historical_player_name, score, source_course_name,
       source_row, source_name_cell, source_score_cell, source_rank, fingerprint, metadata)
    values (v_batch_id, v_course.id, v_player_id, v_item->>'identity_status', v_item->>'historical_player_name',
      (v_item->>'score')::integer, v_item->>'source_course_name', nullif(v_item->>'source_row', '')::integer,
      nullif(v_item->>'source_name_cell', ''), nullif(v_item->>'source_score_cell', ''),
      nullif(v_item->>'source_rank', '')::integer, v_item->>'fingerprint', coalesce(v_item->'metadata', '{}'::jsonb))
    on conflict (fingerprint) do nothing returning id into v_observation_id;
    if v_observation_id is null then v_duplicate_source_rows := v_duplicate_source_rows + 1; continue; end if;
    v_observations_inserted := v_observations_inserted + 1;
    if v_item->>'identity_status' = 'unresolved' then v_unresolved := v_unresolved + 1; continue;
    elsif v_item->>'identity_status' = 'ambiguous' then v_ambiguous := v_ambiguous + 1; continue; end if;

    select best.score into v_existing_score from public.all_time_best_records best
    where best.player_id = v_player_id and best.course_id = v_course.id for update;
    if not found then
      insert into public.all_time_best_records (course_id, player_id, best_observation_id, score, historical_player_name)
      values (v_course.id, v_player_id, v_observation_id, (v_item->>'score')::integer, v_item->>'historical_player_name');
      v_new_records := v_new_records + 1;
    elsif (v_item->>'score')::integer < v_existing_score then
      update public.all_time_best_records set best_observation_id = v_observation_id, score = (v_item->>'score')::integer,
        historical_player_name = v_item->>'historical_player_name', updated_at = now()
      where player_id = v_player_id and course_id = v_course.id; v_better_scores := v_better_scores + 1;
    elsif (v_item->>'score')::integer = v_existing_score then v_equal_scores := v_equal_scores + 1;
    else v_worse_scores := v_worse_scores + 1; end if;
  end loop;
  return jsonb_build_object('batch_id', v_batch_id, 'batch_created', v_batch_created, 'source_rows_scanned', v_scanned,
    'observations_inserted', v_observations_inserted, 'duplicate_source_rows', v_duplicate_source_rows,
    'new_records', v_new_records, 'better_scores', v_better_scores, 'equal_unchanged', v_equal_scores,
    'worse_scores_ignored', v_worse_scores, 'unresolved_identities', v_unresolved, 'ambiguous_identities', v_ambiguous);
end;
$function$;

revoke all on function public.apply_all_time_record_import(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_all_time_record_import(jsonb, jsonb) to authenticated;

commit;
