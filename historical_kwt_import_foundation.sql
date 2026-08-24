begin;

create table if not exists public.historical_kwt_imports (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null check (btrim(source_filename) <> ''),
  source_sha256 text not null unique check (source_sha256 = lower(source_sha256) and source_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version text not null check (btrim(parser_version) <> ''),
  row_count integer not null check (row_count > 0),
  committed_by uuid null references auth.users(id) on delete set null,
  committed_at timestamptz not null default now()
);

create table if not exists public.historical_kwt_scorecards (
  id uuid primary key default gen_random_uuid(),
  historical_kwt_import_id uuid not null references public.historical_kwt_imports(id) on delete cascade,
  source_fingerprint text not null unique,
  source_row integer not null check (source_row > 0),
  season_number integer not null check (season_number > 0),
  week_number integer not null check (week_number > 0),
  historical_player_name text not null check (btrim(historical_player_name) <> ''),
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  historical_rank text null check (historical_rank is null or historical_rank in ('Amateur','Semi-Pro','Pro','Elite')),
  raw_historical_rank text null,
  easy_course_code text not null check (btrim(easy_course_code) <> ''),
  easy_score integer not null,
  hard_course_code text not null check (btrim(hard_course_code) <> ''),
  hard_score integer not null,
  total_score integer not null,
  placement integer null check (placement is null or placement > 0),
  points integer null,
  source_player_id text null,
  easy_round_id text null,
  hard_round_id text null,
  created_at timestamptz not null default now(),
  constraint historical_kwt_total_matches check (total_score = easy_score + hard_score)
);

create index if not exists historical_kwt_scorecards_player_idx on public.historical_kwt_scorecards(canonical_player_id,season_number,week_number);
create index if not exists historical_kwt_scorecards_period_idx on public.historical_kwt_scorecards(season_number,week_number);

do $historical_kwt_schema_check$
declare
  v_missing text;
begin
  if to_regclass('public.players') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.resolve_canonical_player_id(uuid)') is null then
    raise exception 'Historical KWT prerequisites are missing: players and Global Identity must be installed first';
  end if;

  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
  into v_missing
  from (values
    ('historical_kwt_imports', 'id'),
    ('historical_kwt_imports', 'source_filename'),
    ('historical_kwt_imports', 'source_sha256'),
    ('historical_kwt_imports', 'parser_version'),
    ('historical_kwt_imports', 'row_count'),
    ('historical_kwt_imports', 'committed_by'),
    ('historical_kwt_scorecards', 'id'),
    ('historical_kwt_scorecards', 'historical_kwt_import_id'),
    ('historical_kwt_scorecards', 'source_fingerprint'),
    ('historical_kwt_scorecards', 'source_row'),
    ('historical_kwt_scorecards', 'season_number'),
    ('historical_kwt_scorecards', 'week_number'),
    ('historical_kwt_scorecards', 'historical_player_name'),
    ('historical_kwt_scorecards', 'canonical_player_id'),
    ('historical_kwt_scorecards', 'historical_rank'),
    ('historical_kwt_scorecards', 'raw_historical_rank'),
    ('historical_kwt_scorecards', 'easy_course_code'),
    ('historical_kwt_scorecards', 'easy_score'),
    ('historical_kwt_scorecards', 'hard_course_code'),
    ('historical_kwt_scorecards', 'hard_score'),
    ('historical_kwt_scorecards', 'total_score')
  ) required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = required.table_name
      and column_info.column_name = required.column_name
  );

  if v_missing is not null then
    raise exception 'Incompatible Historical KWT schema; missing columns: %', v_missing;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'historical_kwt_imports'
      and column_name = 'source_sha256'
      and data_type = 'text'
      and is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'historical_kwt_scorecards'
      and column_name = 'canonical_player_id'
      and data_type = 'uuid'
      and is_nullable = 'NO'
  ) then
    raise exception 'Incompatible Historical KWT schema; critical column types or nullability differ';
  end if;
end;
$historical_kwt_schema_check$;

alter table public.historical_kwt_imports enable row level security;
alter table public.historical_kwt_scorecards enable row level security;
revoke all on public.historical_kwt_imports, public.historical_kwt_scorecards from public, anon, authenticated;
grant select on public.historical_kwt_imports, public.historical_kwt_scorecards to authenticated;

drop policy if exists "Site admins can read historical KWT imports" on public.historical_kwt_imports;
create policy "Site admins can read historical KWT imports" on public.historical_kwt_imports for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists "Site admins can read historical KWT scorecards" on public.historical_kwt_scorecards;
create policy "Site admins can read historical KWT scorecards" on public.historical_kwt_scorecards for select to authenticated using (public.is_current_user_site_admin());

create or replace function public.commit_historical_kwt_preview(p_source_filename text,p_source_sha256 text,p_parser_version text,p_rows jsonb)
returns table(historical_kwt_import_id uuid,idempotent boolean,scorecard_count integer,score_count integer)
language plpgsql security definer set search_path to '' as $function$
declare
  v_user uuid:=auth.uid(); v_import public.historical_kwt_imports%rowtype; v_row jsonb; v_player uuid; v_canonical_player uuid; v_count integer:=0;
begin
  if v_user is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501'; end if;
  if p_source_filename is null or btrim(p_source_filename)='' then raise exception 'Source filename is required'; end if;
  if p_source_sha256 is null or lower(btrim(p_source_sha256))!~'^[0-9a-f]{64}$' then raise exception 'A lowercase SHA-256 is required'; end if;
  if p_parser_version is null or btrim(p_parser_version)='' then raise exception 'Parser version is required'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'At least one reviewed KWT scorecard is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('historical-kwt:'||lower(btrim(p_source_sha256)),0));
  select * into v_import from public.historical_kwt_imports where source_sha256=lower(btrim(p_source_sha256));
  if found then
    if v_import.source_filename is distinct from btrim(p_source_filename)
       or v_import.parser_version is distinct from btrim(p_parser_version)
       or v_import.row_count is distinct from jsonb_array_length(p_rows) then
      raise exception 'KWT source SHA conflicts with the existing filename, parser version, or row count';
    end if;
    if (select count(distinct incoming.value->>'rowKey') from jsonb_array_elements(p_rows) as incoming(value)) <> jsonb_array_length(p_rows) then
      raise exception 'KWT source SHA payload contains duplicate or blank source fingerprints';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_rows) as incoming(value)
      where not exists (
        select 1
        from public.historical_kwt_scorecards score
        where score.historical_kwt_import_id = v_import.id
          and score.source_fingerprint = incoming.value->>'rowKey'
      )
    ) or exists (
      select 1
      from public.historical_kwt_scorecards score
      where score.historical_kwt_import_id = v_import.id
        and not exists (
          select 1
          from jsonb_array_elements(p_rows) as incoming(value)
          where incoming.value->>'rowKey' = score.source_fingerprint
        )
    ) then
      raise exception 'KWT source SHA conflicts with the existing reviewed source fingerprints';
    end if;
    historical_kwt_import_id:=v_import.id;idempotent:=true;select count(*)::integer into scorecard_count from public.historical_kwt_scorecards as score where score.historical_kwt_import_id = v_import.id;score_count:=scorecard_count*2;return next;return;
  end if;
  insert into public.historical_kwt_imports(source_filename,source_sha256,parser_version,row_count,committed_by) values(btrim(p_source_filename),lower(btrim(p_source_sha256)),btrim(p_parser_version),jsonb_array_length(p_rows),v_user) returning * into v_import;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    begin v_player:=(v_row->>'canonicalPlayerId')::uuid; exception when invalid_text_representation then raise exception 'Every KWT row requires a valid canonical Global Player UUID'; end;
    v_canonical_player:=public.resolve_canonical_player_id(v_player);
    if v_canonical_player is null or not exists(select 1 from public.players where id=v_canonical_player) then raise exception 'Selected player % does not resolve to a canonical Global Player',v_player;end if;
    if coalesce(v_row->>'rowKey','')='' or coalesce(v_row->>'historicalName','')='' or coalesce(v_row->>'easyCode','')='' or coalesce(v_row->>'hardCode','')='' then raise exception 'Every KWT row requires its source fingerprint, historical name, and course codes';end if;
    if coalesce(v_row->>'sourceRow','')!~'^\d+$' or (v_row->>'sourceRow')::integer<=0 then raise exception 'Every KWT row requires a positive source row number';end if;
    if coalesce(v_row->>'season','')!~'^\d+$' or (v_row->>'season')::integer<=0 or coalesce(v_row->>'week','')!~'^\d+$' or (v_row->>'week')::integer<=0 then raise exception 'Every KWT row requires a positive season and week';end if;
    if coalesce(v_row->>'easyScore','')!~'^-?\d+$' or coalesce(v_row->>'hardScore','')!~'^-?\d+$' or coalesce(v_row->>'totalScore','')!~'^-?\d+$' then raise exception 'Every KWT row requires integer Easy, Hard, and Total scores';end if;
    if (v_row->>'totalScore')::integer<>(v_row->>'easyScore')::integer+(v_row->>'hardScore')::integer then raise exception 'KWT total score does not equal Easy plus Hard';end if;
    if exists(select 1 from public.historical_kwt_scorecards as score where score.source_fingerprint=v_row->>'rowKey' and score.historical_kwt_import_id<>v_import.id) then raise exception 'KWT source fingerprint % conflicts with an existing import',v_row->>'rowKey';end if;
    insert into public.historical_kwt_scorecards(historical_kwt_import_id,source_fingerprint,source_row,season_number,week_number,historical_player_name,canonical_player_id,historical_rank,raw_historical_rank,easy_course_code,easy_score,hard_course_code,hard_score,total_score,placement,points,source_player_id,easy_round_id,hard_round_id)
    values(v_import.id,v_row->>'rowKey',(v_row->>'sourceRow')::integer,(v_row->>'season')::integer,(v_row->>'week')::integer,btrim(v_row->>'historicalName'),v_canonical_player,nullif(v_row->>'rank',''),nullif(v_row->>'rawRank',''),upper(btrim(v_row->>'easyCode')),(v_row->>'easyScore')::integer,upper(btrim(v_row->>'hardCode')),(v_row->>'hardScore')::integer,(v_row->>'totalScore')::integer,nullif(v_row->>'placement','')::integer,nullif(v_row->>'points','')::integer,nullif(v_row->>'sourcePlayerId',''),nullif(v_row->>'easyRoundId',''),nullif(v_row->>'hardRoundId',''));
    v_count:=v_count+1;
  end loop;
  historical_kwt_import_id:=v_import.id;idempotent:=false;scorecard_count:=v_count;score_count:=v_count*2;return next;
end;$function$;

revoke all on function public.commit_historical_kwt_preview(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_historical_kwt_preview(text,text,text,jsonb) to authenticated;

create or replace function public.get_public_player_kwt_history(p_player_id uuid)
returns table(season_number integer,week_number integer,historical_player_name text,historical_rank text,easy_course_code text,easy_score integer,hard_course_code text,hard_score integer,total_score integer,placement integer,points integer)
language sql stable security definer set search_path to '' as $function$
  select score.season_number,score.week_number,score.historical_player_name,score.historical_rank,score.easy_course_code,score.easy_score,score.hard_course_code,score.hard_score,score.total_score,score.placement,score.points
  from public.historical_kwt_scorecards score where public.resolve_canonical_player_id(score.canonical_player_id)
    = public.resolve_canonical_player_id(p_player_id) order by score.season_number desc,score.week_number desc;
$function$;
revoke all on function public.get_public_player_kwt_history(uuid) from public;
grant execute on function public.get_public_player_kwt_history(uuid) to anon,authenticated;

do $historical_kwt_foundation_check$
begin
  if to_regclass('public.players') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.resolve_canonical_player_id(uuid)') is null then
    raise exception 'Historical KWT foundation requires site-admin authorization and canonical player identity functions';
  end if;
end;
$historical_kwt_foundation_check$;

commit;
