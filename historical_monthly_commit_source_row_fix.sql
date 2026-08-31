begin;

-- The installed Monthly foundation function rejected valid positive sourceRow
-- values in Production. Keep the RPC contract and write path unchanged, but
-- use an explicit digit class so the validation is independent of SQL string
-- backslash handling.
create or replace function public.commit_historical_monthly_preview(
  p_source_filename text,
  p_source_sha256 text,
  p_parser_version text,
  p_source_row_count integer,
  p_rows jsonb
)
returns table(historical_monthly_import_id uuid, idempotent boolean, applied_row_count integer, source_row_count integer)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user uuid := auth.uid();
  v_import public.historical_monthly_imports%rowtype;
  v_row jsonb;
  v_player uuid;
  v_canonical_player uuid;
  v_count integer := 0;
  v_row_key text;
  v_source_row text;
begin
  if v_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_source_filename is null or btrim(p_source_filename) = '' then
    raise exception 'Source filename is required';
  end if;
  if p_source_sha256 is null or lower(btrim(p_source_sha256)) !~ '^[0-9a-f]{64}$' then
    raise exception 'A lowercase SHA-256 is required';
  end if;
  if p_parser_version is null or btrim(p_parser_version) = '' then
    raise exception 'Parser version is required';
  end if;
  if p_source_row_count is null or p_source_row_count <= 0 then
    raise exception 'A positive source row count is required';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one reviewed Monthly score observation is required';
  end if;
  if p_source_row_count < jsonb_array_length(p_rows) then
    raise exception 'Applied Monthly rows cannot exceed the source row count';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('historical-monthly:' || lower(btrim(p_source_sha256)), 0));
  select * into v_import
  from public.historical_monthly_imports
  where source_sha256 = lower(btrim(p_source_sha256));

  if found then
    if v_import.source_filename is distinct from btrim(p_source_filename)
       or v_import.parser_version is distinct from btrim(p_parser_version)
       or v_import.source_row_count is distinct from p_source_row_count
       or v_import.applied_row_count is distinct from jsonb_array_length(p_rows) then
      raise exception 'Monthly source SHA conflicts with the existing filename, parser version, or row counts';
    end if;
    if (select count(distinct incoming.value->>'rowKey') from jsonb_array_elements(p_rows) as incoming(value)) <> jsonb_array_length(p_rows)
       or exists (select 1 from jsonb_array_elements(p_rows) as incoming(value) where coalesce(incoming.value->>'rowKey', '') = '') then
      raise exception 'Monthly source SHA payload contains duplicate or blank source fingerprints';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_rows) as incoming(value)
      where not exists (
        select 1
        from public.historical_monthly_score_observations score
        where score.historical_monthly_import_id = v_import.id
          and score.source_fingerprint = incoming.value->>'rowKey'
          and score.raw_source = incoming.value
      )
    ) or exists (
      select 1
      from public.historical_monthly_score_observations score
      where score.historical_monthly_import_id = v_import.id
        and not exists (
          select 1
          from jsonb_array_elements(p_rows) as incoming(value)
          where incoming.value->>'rowKey' = score.source_fingerprint
        )
    ) then
      raise exception 'Monthly source SHA conflicts with the existing reviewed source fingerprints';
    end if;
    historical_monthly_import_id := v_import.id;
    idempotent := true;
    applied_row_count := v_import.applied_row_count;
    source_row_count := v_import.source_row_count;
    return next;
    return;
  end if;

  insert into public.historical_monthly_imports(source_filename, source_sha256, parser_version, source_row_count, applied_row_count, committed_by)
  values (btrim(p_source_filename), lower(btrim(p_source_sha256)), btrim(p_parser_version), p_source_row_count, jsonb_array_length(p_rows), v_user)
  returning * into v_import;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_row_key := nullif(btrim(v_row->>'rowKey'), '');
    if v_row_key is null then raise exception 'Every Monthly row requires a source fingerprint'; end if;
    v_source_row := nullif(v_row->>'sourceRow', '');
    if v_source_row is null or v_source_row !~ '^[0-9]+$' or v_source_row::integer <= 0 then raise exception 'Every Monthly row requires a positive source row number'; end if;
    if nullif(v_row->>'historicalName', '') is null or nullif(v_row->>'courseName', '') is null then raise exception 'Every Monthly row requires its exact historical name and course name'; end if;
    if nullif(v_row->>'year', '') is null or v_row->>'year' !~ '^[0-9]+$' or (v_row->>'year')::integer not between 1900 and 2200 then raise exception 'Every Monthly row requires a valid period year'; end if;
    if nullif(v_row->>'month', '') is null or v_row->>'month' !~ '^[0-9]+$' or (v_row->>'month')::integer not between 1 and 12 then raise exception 'Every Monthly row requires a valid period month'; end if;
    if v_row->>'difficulty' not in ('easy', 'hard') then raise exception 'Every Monthly row requires difficulty easy or hard'; end if;
    if nullif(v_row->>'score', '') is null or v_row->>'score' !~ '^-?[0-9]+$' then raise exception 'Every applied Monthly row requires an integer score'; end if;
    begin
      v_player := (v_row->>'canonicalPlayerId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Every Monthly row requires a valid canonical Global Player UUID';
    end;
    v_canonical_player := public.resolve_canonical_player_id(v_player);
    if v_canonical_player is null or not exists(select 1 from public.players where id = v_canonical_player) then
      raise exception 'Selected player % does not resolve to a canonical Global Player', v_player;
    end if;
    if exists(select 1 from public.historical_monthly_score_observations score where score.source_fingerprint = v_row_key) then
      raise exception 'Monthly source fingerprint % already exists in another import', v_row_key;
    end if;

    insert into public.historical_monthly_score_observations(
      historical_monthly_import_id, source_fingerprint, source_row, period_year, period_month, period_id,
      division, historical_player_name, canonical_player_id, source_player_id, course_name, difficulty,
      score, hole_in_ones, course_placement, course_points, overall_placement, courses_played,
      total_strokes, overall_hole_in_ones, overall_points, source_url, raw_source
    ) values (
      v_import.id, v_row_key, v_source_row::integer, (v_row->>'year')::integer, (v_row->>'month')::integer,
      nullif(v_row->>'periodId', '')::integer, btrim(v_row->>'division'), v_row->>'historicalName',
      v_canonical_player, nullif(v_row->>'sourcePlayerId', ''), btrim(v_row->>'courseName'), v_row->>'difficulty',
      (v_row->>'score')::integer, nullif(v_row->>'holeInOnes', '')::integer, nullif(v_row->>'coursePlacement', '')::integer,
      nullif(v_row->>'coursePoints', '')::integer, nullif(v_row->>'overallPlacement', '')::integer,
      nullif(v_row->>'coursesPlayed', '')::integer, nullif(v_row->>'totalStrokes', '')::integer,
      nullif(v_row->>'overallHn1', '')::integer, nullif(v_row->>'overallPoints', '')::integer,
      btrim(v_row->>'sourceUrl'), v_row
    );
    v_count := v_count + 1;
  end loop;

  historical_monthly_import_id := v_import.id;
  idempotent := false;
  applied_row_count := v_count;
  source_row_count := p_source_row_count;
  return next;
end;
$function$;

revoke all on function public.commit_historical_monthly_preview(text, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.commit_historical_monthly_preview(text, text, text, integer, jsonb) to authenticated;

commit;
