begin;

create or replace function public.apply_all_time_record_import(
  p_batch jsonb,
  p_observations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_batch_created boolean := false;
  v_item jsonb;
  v_course public.all_time_courses%rowtype;
  v_observation_id uuid;
  v_player_id uuid;
  v_existing_score integer;
  v_scanned integer := 0;
  v_observations_inserted integer := 0;
  v_duplicate_source_rows integer := 0;
  v_new_records integer := 0;
  v_better_scores integer := 0;
  v_equal_scores integer := 0;
  v_worse_scores integer := 0;
  v_unresolved integer := 0;
  v_ambiguous integer := 0;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_batch is null or jsonb_typeof(p_batch) <> 'object' then
    raise exception 'Batch metadata is required';
  end if;
  if p_observations is null or jsonb_typeof(p_observations) <> 'array' then
    raise exception 'Observations must be a JSON array';
  end if;
  if p_batch->>'source_type' <> 'historical_workbook'
     or p_batch->>'source_worksheet' <> 'All Time'
     or coalesce(p_batch->>'original_filename', '') = ''
     or coalesce(p_batch->>'file_sha256', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Historical workbook batch metadata is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('all-time-record-import:' || (p_batch->>'file_sha256'), 0)
  );

  select batch.id into v_batch_id
  from public.all_time_source_batches as batch
  where batch.source_type = 'historical_workbook'
    and batch.file_sha256 = p_batch->>'file_sha256'
    and coalesce(batch.source_worksheet, '') = 'All Time'
  for update;

  if not found then
    insert into public.all_time_source_batches (
      source_type, original_filename, source_worksheet, file_sha256, imported_by, metadata
    ) values (
      'historical_workbook', p_batch->>'original_filename', 'All Time',
      p_batch->>'file_sha256', v_user_id, coalesce(p_batch->'metadata', '{}'::jsonb)
    ) returning id into v_batch_id;
    v_batch_created := true;
  end if;

  for v_item in select value from jsonb_array_elements(p_observations)
  loop
    v_observation_id := null;
    v_player_id := null;
    v_scanned := v_scanned + 1;
    if coalesce(v_item->>'course_code', '') not in ('AME', 'AMH')
       or coalesce(v_item->>'source_course_name', '') <> 'Arazona Modern'
       or v_item->>'historical_player_name' is null
       or coalesce(v_item->>'fingerprint', '') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_item->'score') <> 'number' then
      raise exception 'Observation % is invalid for the Arizona Modern pilot', v_scanned;
    end if;

    select course.* into v_course
    from public.all_time_courses as course
    join public.all_time_course_source_mappings as mapping on mapping.course_id = course.id
    where course.code = v_item->>'course_code'
      and course.base_map = 'Arizona Modern'
      and mapping.source_type = 'historical_workbook'
      and mapping.source_course_name = 'Arazona Modern'
      and mapping.difficulty = course.difficulty;
    if not found then
      raise exception 'The explicit Arizona Modern course mapping is missing';
    end if;

    if v_item->>'identity_status' = 'resolved' then
      if nullif(v_item->>'player_id', '') is null
         or public.resolve_canonical_player_id((v_item->>'player_id')::uuid) is null then
        raise exception 'Resolved observation % has no valid canonical player UUID', v_scanned;
      end if;
      v_player_id := public.resolve_canonical_player_id((v_item->>'player_id')::uuid);
      if not exists (
           select 1 from public.players as player
           where player.id = v_player_id
         ) then
        raise exception 'Resolved observation % has no valid canonical player UUID', v_scanned;
      end if;
    elsif v_item->>'identity_status' not in ('unresolved', 'ambiguous')
       or nullif(v_item->>'player_id', '') is not null then
      raise exception 'Observation % identity status is invalid', v_scanned;
    end if;

    insert into public.all_time_record_observations (
      batch_id, course_id, player_id, identity_status, historical_player_name,
      score, source_course_name, source_row, source_name_cell, source_score_cell,
      source_rank, fingerprint, metadata
    ) values (
      v_batch_id,
      v_course.id,
      v_player_id,
      v_item->>'identity_status',
      v_item->>'historical_player_name',
      (v_item->>'score')::integer,
      'Arazona Modern',
      nullif(v_item->>'source_row', '')::integer,
      nullif(v_item->>'source_name_cell', ''),
      nullif(v_item->>'source_score_cell', ''),
      nullif(v_item->>'source_rank', '')::integer,
      v_item->>'fingerprint',
      coalesce(v_item->'metadata', '{}'::jsonb)
    ) on conflict (fingerprint) do nothing
    returning id into v_observation_id;

    if v_observation_id is null then
      v_duplicate_source_rows := v_duplicate_source_rows + 1;
      continue;
    end if;
    v_observations_inserted := v_observations_inserted + 1;

    if v_item->>'identity_status' = 'unresolved' then
      v_unresolved := v_unresolved + 1;
      continue;
    elsif v_item->>'identity_status' = 'ambiguous' then
      v_ambiguous := v_ambiguous + 1;
      continue;
    end if;

    select best.score into v_existing_score
    from public.all_time_best_records as best
    where best.player_id = v_player_id
      and best.course_id = v_course.id
    for update;

    if not found then
      insert into public.all_time_best_records (
        course_id, player_id, best_observation_id, score, historical_player_name
      ) values (
        v_course.id, v_player_id, v_observation_id,
        (v_item->>'score')::integer, v_item->>'historical_player_name'
      );
      v_new_records := v_new_records + 1;
    elsif (v_item->>'score')::integer < v_existing_score then
      update public.all_time_best_records
      set best_observation_id = v_observation_id,
          score = (v_item->>'score')::integer,
          historical_player_name = v_item->>'historical_player_name',
          updated_at = now()
      where player_id = v_player_id
        and course_id = v_course.id;
      v_better_scores := v_better_scores + 1;
    elsif (v_item->>'score')::integer = v_existing_score then
      v_equal_scores := v_equal_scores + 1;
    else
      v_worse_scores := v_worse_scores + 1;
    end if;
    v_observation_id := null;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_created', v_batch_created,
    'source_rows_scanned', v_scanned,
    'observations_inserted', v_observations_inserted,
    'duplicate_source_rows', v_duplicate_source_rows,
    'new_records', v_new_records,
    'better_scores', v_better_scores,
    'equal_unchanged', v_equal_scores,
    'worse_scores_ignored', v_worse_scores,
    'unresolved_identities', v_unresolved,
    'ambiguous_identities', v_ambiguous
  );
end;
$function$;

create or replace function public.apply_all_time_combined_observation(
  p_observation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_observation_id uuid;
  v_existing_score integer;
  v_status text;
  v_source text;
  v_method text;
  v_player_id uuid;
  v_combined integer;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_observation is null or jsonb_typeof(p_observation) <> 'object' then
    raise exception 'Combined observation is required';
  end if;

  v_method := p_observation->>'ingestion_method';
  v_status := p_observation->>'verification_status';
  v_source := nullif(p_observation->>'source_authority', '');
  v_player_id := public.resolve_canonical_player_id(
    nullif(p_observation->>'player_id', '')::uuid
  );
  v_combined := (p_observation->>'easy_score')::integer + (p_observation->>'hard_score')::integer;

  if p_observation->>'base_map' <> 'Arizona Modern'
     or coalesce(p_observation->>'historical_player_name', '') = ''
     or coalesce(p_observation->>'fingerprint', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Combined observation is invalid for the Arizona Modern pilot';
  end if;
  if v_method = 'manual_admin' and (v_status <> 'verified' or v_source not in ('KWT', 'PRO')) then
    raise exception 'Manual official combined records must identify KWT or PRO';
  end if;
  if v_method = 'legacy_snapshot' and (v_status <> 'pending_source_verification' or v_source is not null) then
    raise exception 'Legacy combined rows must remain pending source verification';
  end if;
  if v_method not in ('manual_admin', 'legacy_snapshot') then
    raise exception 'Combined ingestion method is unsupported';
  end if;
  if v_player_id is not null and not exists (
    select 1 from public.players as player where player.id = v_player_id
  ) then
    raise exception 'Canonical player UUID does not exist';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-player-identity-merge', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('all-time-combined:' || (p_observation->>'fingerprint'), 0)
  );

  insert into public.all_time_combined_observations (
    batch_id, player_id, historical_player_name, base_map, easy_score, hard_score,
    ingestion_method, source_authority, verification_status,
    legacy_combined_course_record_id, proof_url, played_at, notes, fingerprint,
    recorded_by, metadata
  ) values (
    nullif(p_observation->>'batch_id', '')::uuid,
    v_player_id,
    p_observation->>'historical_player_name',
    'Arizona Modern',
    (p_observation->>'easy_score')::integer,
    (p_observation->>'hard_score')::integer,
    v_method,
    v_source,
    v_status,
    nullif(p_observation->>'legacy_combined_course_record_id', '')::uuid,
    nullif(p_observation->>'proof_url', ''),
    nullif(p_observation->>'played_at', '')::date,
    nullif(p_observation->>'notes', ''),
    p_observation->>'fingerprint',
    v_user_id,
    coalesce(p_observation->'metadata', '{}'::jsonb)
  ) on conflict (fingerprint) do nothing
  returning id into v_observation_id;

  if v_observation_id is null then
    return jsonb_build_object('action', 'duplicate_source_row', 'official', v_status = 'verified');
  end if;
  if v_status <> 'verified' or v_player_id is null then
    return jsonb_build_object('action', 'preserved_pending_review', 'official', false, 'observation_id', v_observation_id);
  end if;

  select best.combined_score into v_existing_score
  from public.all_time_combined_best_records as best
  where best.player_id = v_player_id and best.base_map = 'Arizona Modern'
  for update;

  if not found then
    insert into public.all_time_combined_best_records (
      base_map, player_id, best_observation_id, easy_score, hard_score,
      historical_player_name, source_authority
    ) values (
      'Arizona Modern', v_player_id, v_observation_id,
      (p_observation->>'easy_score')::integer, (p_observation->>'hard_score')::integer,
      p_observation->>'historical_player_name', v_source
    );
    return jsonb_build_object('action', 'new_record', 'official', true, 'combined_score', v_combined);
  elsif v_combined < v_existing_score then
    update public.all_time_combined_best_records
    set best_observation_id = v_observation_id,
        easy_score = (p_observation->>'easy_score')::integer,
        hard_score = (p_observation->>'hard_score')::integer,
        historical_player_name = p_observation->>'historical_player_name',
        source_authority = v_source,
        updated_at = now()
    where player_id = v_player_id and base_map = 'Arizona Modern';
    return jsonb_build_object('action', 'better_score', 'official', true, 'combined_score', v_combined);
  elsif v_combined = v_existing_score then
    return jsonb_build_object('action', 'equal_unchanged', 'official', true, 'combined_score', v_combined);
  end if;
  return jsonb_build_object('action', 'worse_score_ignored', 'official', true, 'combined_score', v_combined);
end;
$function$;

revoke all on function public.apply_all_time_record_import(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_all_time_record_import(jsonb, jsonb) to authenticated;
revoke all on function public.apply_all_time_combined_observation(jsonb) from public, anon, authenticated;
grant execute on function public.apply_all_time_combined_observation(jsonb) to authenticated;

commit;
