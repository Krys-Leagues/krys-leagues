-- KWT current-season CSV importer.
-- Additive only: keeps the existing KWT operational-result contract and stores
-- the reviewed source/evidence separately until an administrator commits it.

create table if not exists public.kwt_current_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_sha256 text not null unique check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_season integer not null check (source_season > 0),
  source_week integer not null check (source_week between 1 and 12),
  event_identifier text not null,
  course_name text not null,
  easy_course_code text not null,
  hard_course_code text not null,
  result_status text not null default 'official' check (result_status in ('draft', 'official')),
  status text not null default 'PREVIEW' check (status in ('PREVIEW', 'COMMITTED', 'REJECTED')),
  rows_found integer not null default 0 check (rows_found >= 0),
  matched_rows integer not null default 0 check (matched_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  inserted_rows integer not null default 0 check (inserted_rows >= 0),
  corrected_rows integer not null default 0 check (corrected_rows >= 0),
  unchanged_rows integer not null default 0 check (unchanged_rows >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  committed_by uuid references auth.users(id),
  committed_at timestamptz,
  rejection_reason text
);

create table if not exists public.kwt_current_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.kwt_current_import_batches(id) on delete cascade,
  source_row integer not null check (source_row > 1),
  source_fingerprint text not null,
  raw_player_name text not null,
  canonical_player_id uuid references public.players(id) on delete restrict,
  canonical_name text,
  identity_status text not null check (identity_status in ('MATCHED', 'MANUAL', 'UNKNOWN', 'AMBIGUOUS')),
  identity_note text,
  validation_errors text[] not null default '{}',
  division text,
  easy_course_code text,
  hard_course_code text,
  easy_score integer,
  hard_score integer,
  total_score integer,
  overall_placement integer,
  points integer,
  division_placement integer,
  badges text[] not null default '{}',
  easy_holes integer[] not null default '{}',
  hard_holes integer[] not null default '{}',
  raw_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (batch_id, source_row),
  unique (batch_id, source_fingerprint)
);

create index if not exists kwt_current_import_batches_created_idx
  on public.kwt_current_import_batches (created_at desc);
create index if not exists kwt_current_import_rows_batch_idx
  on public.kwt_current_import_rows (batch_id, source_row);
create index if not exists kwt_current_import_rows_identity_idx
  on public.kwt_current_import_rows (batch_id, identity_status, canonical_player_id);

alter table public.kwt_current_import_batches enable row level security;
alter table public.kwt_current_import_rows enable row level security;
revoke all on public.kwt_current_import_batches from public, anon, authenticated;
revoke all on public.kwt_current_import_rows from public, anon, authenticated;
grant all on public.kwt_current_import_batches to service_role;
grant all on public.kwt_current_import_rows to service_role;

create or replace function public.stage_kwt_current_import(
  p_source_filename text,
  p_source_sha256 text,
  p_source_season integer,
  p_source_week integer,
  p_event_identifier text,
  p_course_name text,
  p_easy_course_code text,
  p_hard_course_code text,
  p_result_status text,
  p_rows jsonb
)
returns table(batch_id uuid, idempotent boolean, rows_found integer, matched_rows integer, error_rows integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_batch public.kwt_current_import_batches%rowtype;
  v_row jsonb;
  v_rows integer := 0;
  v_matched integer := 0;
  v_errors integer := 0;
begin
  if v_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_source_filename), '') is null then raise exception 'Source filename is required'; end if;
  if p_source_sha256 is null or lower(btrim(p_source_sha256)) !~ '^[0-9a-f]{64}$' then raise exception 'A valid SHA-256 is required'; end if;
  if p_source_season is null or p_source_week is null or p_source_week not between 1 and 12 then raise exception 'A valid KWT season and week are required'; end if;
  if p_event_identifier is distinct from format('KWTS%sW%s', p_source_season, lpad(p_source_week::text, 2, '0')) then raise exception 'Event identifier does not match the selected season and week'; end if;
  if p_result_status not in ('draft', 'official') then raise exception 'Invalid result status'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'At least one CSV row is required'; end if;
  if jsonb_array_length(p_rows) > 500 then raise exception 'A single KWT import may contain at most 500 rows'; end if;
  if not exists (
    select 1 from public.kwt_public_content as content
    where content.content_type = 'kwt_week_setup'
      and content.active
      and content.season_number = p_source_season
      and content.week_number = p_source_week
      and (content.label::jsonb ->> 'eventIdentifier') = p_event_identifier
      and (content.label::jsonb ->> 'easyCourseCode') = p_easy_course_code
      and (content.label::jsonb ->> 'hardCourseCode') = p_hard_course_code
  ) then
    raise exception 'The selected KWT week is not the active verified Week Setup';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('kwt-current-source:' || lower(btrim(p_source_sha256)), 0));
  select * into v_batch from public.kwt_current_import_batches where source_sha256 = lower(btrim(p_source_sha256));
  if found then
    if v_batch.source_filename is distinct from btrim(p_source_filename)
       or v_batch.source_season is distinct from p_source_season
       or v_batch.source_week is distinct from p_source_week
       or v_batch.rows_found is distinct from jsonb_array_length(p_rows) then
      raise exception 'This source SHA conflicts with an existing KWT import';
    end if;
    batch_id := v_batch.id; idempotent := true; rows_found := v_batch.rows_found;
    matched_rows := v_batch.matched_rows; error_rows := v_batch.error_rows; return next; return;
  end if;

  insert into public.kwt_current_import_batches (
    source_filename, source_sha256, source_season, source_week, event_identifier,
    course_name, easy_course_code, hard_course_code, result_status, rows_found, created_by
  ) values (
    btrim(p_source_filename), lower(btrim(p_source_sha256)), p_source_season, p_source_week,
    btrim(p_event_identifier), btrim(p_course_name), btrim(p_easy_course_code), btrim(p_hard_course_code),
    p_result_status, jsonb_array_length(p_rows), v_user
  ) returning * into v_batch;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_rows := v_rows + 1;
    if (v_row ->> 'identityStatus') in ('MATCHED', 'MANUAL') then v_matched := v_matched + 1; end if;
    if coalesce(jsonb_array_length(v_row -> 'validationErrors'), 0) > 0 or (v_row ->> 'identityStatus') not in ('MATCHED', 'MANUAL') then v_errors := v_errors + 1; end if;
    insert into public.kwt_current_import_rows (
      batch_id, source_row, source_fingerprint, raw_player_name, canonical_player_id, canonical_name,
      identity_status, identity_note, validation_errors, division, easy_course_code, hard_course_code,
      easy_score, hard_score, total_score, overall_placement, points, division_placement, badges, easy_holes, hard_holes, raw_data
    ) values (
      v_batch.id, (v_row ->> 'sourceRow')::integer, v_row ->> 'sourceFingerprint', btrim(v_row ->> 'rawPlayerName'),
      nullif(v_row ->> 'canonicalPlayerId', '')::uuid, nullif(v_row ->> 'canonicalName', ''),
      coalesce(v_row ->> 'identityStatus', 'UNKNOWN'), nullif(v_row ->> 'identityNote', ''),
      coalesce(array(select jsonb_array_elements_text(v_row -> 'validationErrors')), '{}'), nullif(v_row ->> 'division', ''),
      nullif(v_row ->> 'easyCourseCode', ''), nullif(v_row ->> 'hardCourseCode', ''),
      nullif(v_row ->> 'easyScore', '')::integer, nullif(v_row ->> 'hardScore', '')::integer,
      nullif(v_row ->> 'totalScore', '')::integer, nullif(v_row ->> 'overallPlacement', '')::integer,
      nullif(v_row ->> 'points', '')::integer, nullif(v_row ->> 'divisionPlacement', '')::integer,
      coalesce(array(select jsonb_array_elements_text(v_row -> 'badges')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_row -> 'easyHoles'))::integer[], '{}'),
      coalesce(array(select jsonb_array_elements_text(v_row -> 'hardHoles'))::integer[], '{}'),
      coalesce(v_row -> 'rawData', '{}'::jsonb)
    );
  end loop;

  update public.kwt_current_import_batches
    set matched_rows = v_matched, error_rows = v_errors
    where id = v_batch.id;
  batch_id := v_batch.id; idempotent := false; rows_found := v_rows; matched_rows := v_matched; error_rows := v_errors; return next;
end;
$function$;

create or replace function public.set_kwt_current_import_identity(
  p_batch_id uuid,
  p_row_id uuid,
  p_canonical_player_id uuid,
  p_identity_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_canonical uuid;
  v_name text;
begin
  if v_user is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  v_canonical := public.resolve_canonical_player_id(p_canonical_player_id);
  select screen_name into v_name from public.players where id = v_canonical;
  if v_canonical is null or v_name is null then raise exception 'Selected player is not a canonical Global Player'; end if;
  update public.kwt_current_import_rows
    set canonical_player_id = v_canonical,
        canonical_name = v_name,
        identity_status = 'MANUAL',
        identity_note = nullif(btrim(p_identity_note), ''),
        validation_errors = array(select error_text from unnest(validation_errors) as error_text where error_text not ilike 'identity:%')
    where id = p_row_id and batch_id = p_batch_id;
  if not found then raise exception 'Import row was not found or is no longer editable'; end if;
  update public.kwt_current_import_batches as batch
    set matched_rows = (select count(*) from public.kwt_current_import_rows where batch_id = batch.id and identity_status in ('MATCHED', 'MANUAL')),
        error_rows = (select count(*) from public.kwt_current_import_rows where batch_id = batch.id and (identity_status not in ('MATCHED', 'MANUAL') or cardinality(validation_errors) > 0))
    where batch.id = p_batch_id and batch.status = 'PREVIEW';
end;
$function$;

create or replace function public.commit_kwt_current_import(
  p_batch_id uuid,
  p_allow_corrections boolean default false,
  p_correction_reason text default null
)
returns table(batch_id uuid, idempotent boolean, inserted_rows integer, corrected_rows integer, unchanged_rows integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_batch public.kwt_current_import_batches%rowtype;
  v_row public.kwt_current_import_rows%rowtype;
  v_existing public.kwt_operational_results%rowtype;
  v_season_id uuid;
  v_inserted integer := 0;
  v_corrected integer := 0;
  v_unchanged integer := 0;
  v_was_existing boolean;
  v_source_reference text;
  v_reason text := nullif(btrim(p_correction_reason), '');
begin
  if v_user is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode = '42501'; end if;
  select * into v_batch from public.kwt_current_import_batches where id = p_batch_id for update;
  if not found then raise exception 'KWT import batch was not found'; end if;
  if v_batch.status = 'COMMITTED' then
    batch_id := p_batch_id; idempotent := true; inserted_rows := v_batch.inserted_rows; corrected_rows := v_batch.corrected_rows; unchanged_rows := v_batch.unchanged_rows; return next; return;
  end if;
  if v_batch.status <> 'PREVIEW' then raise exception 'Only a preview batch can be committed'; end if;
  if exists (select 1 from public.kwt_current_import_rows as import_row where import_row.batch_id = p_batch_id and (import_row.identity_status not in ('MATCHED', 'MANUAL') or cardinality(import_row.validation_errors) > 0)) then raise exception 'Resolve every identity and validation issue before committing'; end if;
  if exists (select import_row.canonical_player_id from public.kwt_current_import_rows as import_row where import_row.batch_id = p_batch_id group by import_row.canonical_player_id having count(*) > 1) then raise exception 'A player appears more than once in this KWT import'; end if;
  select id into v_season_id from public.seasons where season_number = v_batch.source_season and lower(btrim(league_type)) = 'kwt' and not is_locked for update;
  if v_season_id is null then raise exception 'The selected KWT season is unavailable or locked'; end if;
  perform pg_advisory_xact_lock(hashtextextended(format('kwt-current:%s:%s', v_batch.source_season, v_batch.source_week), 0));

  for v_row in select import_row.* from public.kwt_current_import_rows as import_row where import_row.batch_id = p_batch_id order by import_row.source_row loop
    select * into v_existing from public.kwt_operational_results where season_id = v_season_id and week_number = v_batch.source_week and player_id = v_row.canonical_player_id for update;
    v_was_existing := found;
    if v_was_existing and (v_existing.division, v_existing.easy_course_code, v_existing.hard_course_code, v_existing.easy_score, v_existing.hard_score, v_existing.overall_placement, v_existing.division_placement, v_existing.points, v_existing.status)
      is not distinct from (v_row.division, v_row.easy_course_code, v_row.hard_course_code, v_row.easy_score, v_row.hard_score, v_row.overall_placement, v_row.division_placement, v_row.points, v_batch.result_status) then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;
    if v_was_existing and v_existing.status = 'official' and (not p_allow_corrections or v_reason is null) then raise exception 'An existing official result requires explicit correction confirmation and a reason'; end if;
    v_source_reference := format('kwt-current-import:%s:row:%s', p_batch_id, v_row.source_row);
    perform public.save_kwt_operational_result(
      v_season_id, v_batch.source_week, v_row.canonical_player_id, v_row.division,
      v_row.easy_course_code, v_row.hard_course_code, v_row.easy_score, v_row.hard_score,
      v_row.overall_placement,
      v_row.division_placement,
      v_row.points, v_batch.result_status, v_source_reference, v_reason
    );
    if v_was_existing then v_corrected := v_corrected + 1; else v_inserted := v_inserted + 1; end if;
  end loop;

  update public.kwt_current_import_batches
    set status = 'COMMITTED', committed_by = v_user, committed_at = now(), inserted_rows = v_inserted, corrected_rows = v_corrected, unchanged_rows = v_unchanged
    where id = p_batch_id;
  batch_id := p_batch_id; idempotent := false; inserted_rows := v_inserted; corrected_rows := v_corrected; unchanged_rows := v_unchanged; return next;
end;
$function$;

revoke all on function public.stage_kwt_current_import(text, text, integer, integer, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.set_kwt_current_import_identity(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.commit_kwt_current_import(uuid, boolean, text) from public, anon;
grant execute on function public.stage_kwt_current_import(text, text, integer, integer, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.set_kwt_current_import_identity(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.commit_kwt_current_import(uuid, boolean, text) to authenticated;
