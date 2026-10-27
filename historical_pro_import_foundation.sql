begin;

do $historical_pro_prerequisites$
begin
  if to_regclass('public.players') is null
     or to_regprocedure('public.is_current_user_site_admin()') is null
     or to_regprocedure('public.resolve_canonical_player_id(uuid)') is null then
    raise exception 'Historical Pro prerequisites are missing: players, site-admin authorization, and canonical identity must be installed first';
  end if;
end;
$historical_pro_prerequisites$;

create table if not exists public.historical_pro_imports (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_sha256 text not null,
  preview_fingerprint text not null,
  parser_version text not null,
  validated_preview jsonb not null,
  source_row_count integer not null,
  importable_row_count integer not null,
  blocked_missing_score_count integer not null default 0,
  blocked_conflict_count integer not null default 0,
  current_period_count integer not null default 0,
  committed_at timestamptz not null default now(),
  committed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint historical_pro_imports_filename_nonblank check (btrim(source_filename) <> ''),
  constraint historical_pro_imports_sha_format check (source_sha256 = lower(source_sha256) and source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint historical_pro_imports_fingerprint_nonblank check (btrim(preview_fingerprint) <> ''),
  constraint historical_pro_imports_parser_nonblank check (btrim(parser_version) <> ''),
  constraint historical_pro_imports_preview_object check (jsonb_typeof(validated_preview) = 'object'),
  constraint historical_pro_imports_counts_nonnegative check (
    source_row_count >= 0 and importable_row_count >= 0 and blocked_missing_score_count >= 0
    and blocked_conflict_count >= 0 and current_period_count >= 0
  ),
  constraint historical_pro_imports_source_sha_key unique (source_sha256),
  constraint historical_pro_imports_preview_fingerprint_key unique (preview_fingerprint)
);

create table if not exists public.historical_pro_player_games (
  id uuid primary key default gen_random_uuid(),
  historical_pro_import_id uuid not null references public.historical_pro_imports(id) on delete cascade,
  period_type text not null,
  period_number integer not null,
  period_label text not null,
  division text not null,
  historical_player_name text not null,
  canonical_player_id uuid null references public.players(id) on delete set null,
  game_number integer not null,
  map_course_code text null,
  easy_score text null,
  hard_score text null,
  combined_total text null,
  played text null,
  wins text null,
  losses text null,
  draws text null,
  points text null,
  strokes text null,
  published_rank text null,
  source_era text not null,
  source_workbook text not null,
  source_tab text not null,
  source_page text not null,
  source_row text not null,
  source_cells text not null,
  source_url text not null,
  raw_source_data text not null,
  source_fingerprint text not null unique,
  score_state text not null default 'unknown',
  pairing_evidence_type text not null default 'UNKNOWN',
  opponent_historical_name text null,
  opponent_canonical_player_id uuid null references public.players(id) on delete set null,
  pairing_reviewed_at timestamptz null,
  pairing_reviewed_by uuid null references auth.users(id) on delete set null,
  identity_reviewed_at timestamptz null,
  identity_reviewed_by uuid null references auth.users(id) on delete set null,
  identity_resolution_note text null,
  created_at timestamptz not null default now(),
  constraint historical_pro_game_period_type check (period_type in ('season', 'week')),
  constraint historical_pro_game_period_number_positive check (period_number > 0),
  constraint historical_pro_game_period_label_nonblank check (btrim(period_label) <> ''),
  constraint historical_pro_game_division_nonblank check (btrim(division) <> ''),
  constraint historical_pro_game_name_nonblank check (btrim(historical_player_name) <> ''),
  constraint historical_pro_game_number check (game_number in (1, 2, 3)),
  constraint historical_pro_game_era_nonblank check (btrim(source_era) <> ''),
  constraint historical_pro_game_source_nonblank check (btrim(source_workbook) <> '' and btrim(source_page) <> '' and btrim(source_row) <> '' and btrim(source_cells) <> ''),
  constraint historical_pro_game_score_state check (score_state in ('played', 'scheduled_unplayed', 'partial_review', 'unknown')),
  constraint historical_pro_game_pairing_evidence check (pairing_evidence_type in ('SOURCE COLOR CONFIRMED — PLAYED', 'SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED', 'ADMIN CONFIRMED', 'UNKNOWN')),
  constraint historical_pro_game_source_score_format check (
    (easy_score is null or easy_score ~ '^[-+]?\\d+$') and
    (hard_score is null or hard_score ~ '^[-+]?\\d+$')
  ),
  constraint historical_pro_game_no_season_13 check (not (period_type = 'season' and period_number = 13)),
  constraint historical_pro_game_no_week_107 check (not (period_type = 'week' and period_number = 107))
);

create index if not exists historical_pro_games_canonical_player_idx
  on public.historical_pro_player_games(canonical_player_id)
  where canonical_player_id is not null;
create index if not exists historical_pro_games_period_idx
  on public.historical_pro_player_games(period_type, period_number, division);
create index if not exists historical_pro_games_identity_review_idx
  on public.historical_pro_player_games(historical_player_name, canonical_player_id);

create table if not exists public.historical_pro_pairing_reviews (
  id uuid primary key default gen_random_uuid(),
  historical_pro_player_game_id uuid not null unique references public.historical_pro_player_games(id) on delete cascade,
  opponent_historical_name text null,
  opponent_canonical_player_id uuid null references public.players(id) on delete set null,
  pairing_state text not null,
  review_note text null,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  constraint historical_pro_pairing_review_state check (pairing_state in ('ADMIN CONFIRMED', 'UNKNOWN')),
  constraint historical_pro_pairing_review_name_or_unknown check (pairing_state = 'UNKNOWN' or nullif(btrim(opponent_historical_name), '') is not null)
);

alter table public.historical_pro_imports enable row level security;
alter table public.historical_pro_player_games enable row level security;
alter table public.historical_pro_pairing_reviews enable row level security;

drop policy if exists "Site admins can read Historical Pro imports" on public.historical_pro_imports;
create policy "Site admins can read Historical Pro imports"
  on public.historical_pro_imports for select to authenticated
  using (public.is_current_user_site_admin());
drop policy if exists "Site admins can read Historical Pro games" on public.historical_pro_player_games;
create policy "Site admins can read Historical Pro games"
  on public.historical_pro_player_games for select to authenticated
  using (public.is_current_user_site_admin());
drop policy if exists "Site admins can read Historical Pro pairing reviews" on public.historical_pro_pairing_reviews;
create policy "Site admins can read Historical Pro pairing reviews"
  on public.historical_pro_pairing_reviews for select to authenticated
  using (public.is_current_user_site_admin());

revoke all on table public.historical_pro_imports from public, anon, authenticated;
revoke all on table public.historical_pro_player_games from public, anon, authenticated;
revoke all on table public.historical_pro_pairing_reviews from public, anon, authenticated;
grant select on table public.historical_pro_imports to authenticated;
grant select on table public.historical_pro_player_games to authenticated;
grant select on table public.historical_pro_pairing_reviews to authenticated;

create or replace function public.commit_historical_pro_preview(
  p_source_filename text,
  p_source_sha256 text,
  p_preview_fingerprint text,
  p_parser_version text,
  p_validated_preview jsonb
)
returns table(
  historical_pro_import_id uuid,
  idempotent boolean,
  imported_row_count integer,
  resolved_identity_count integer,
  blocked_row_count integer,
  source_conflict_count integer
)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_import public.historical_pro_imports%rowtype;
  v_row jsonb;
  v_canonical_id uuid;
  v_source_fingerprint text;
  v_source_row_count integer := 0;
  v_importable_count integer := 0;
  v_inserted_count integer := 0;
  v_resolved_count integer := 0;
  v_blocked_count integer := 0;
  v_conflict_count integer := 0;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode = '42501';
  end if;
  if nullif(btrim(p_source_filename), '') is null then raise exception 'Historical Pro source filename is required'; end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Historical Pro source SHA-256 must be lowercase hexadecimal'; end if;
  if nullif(btrim(p_preview_fingerprint), '') is null then raise exception 'Historical Pro preview fingerprint is required'; end if;
  if jsonb_typeof(p_validated_preview) <> 'object' then raise exception 'Historical Pro preview must be a JSON object'; end if;
  if jsonb_typeof(p_validated_preview -> 'rows') <> 'array' then raise exception 'Historical Pro preview rows are required'; end if;

  select source.* into v_import
  from public.historical_pro_imports source
  where source.source_sha256 = lower(p_source_sha256)
  for update;
  if found then
    if v_import.preview_fingerprint <> p_preview_fingerprint then
      raise exception 'A different Historical Pro preview already uses this source SHA-256';
    end if;
    historical_pro_import_id := v_import.id;
    idempotent := true;
    imported_row_count := v_import.importable_row_count;
    select count(*) filter (where game.canonical_player_id is not null)::integer,
           count(*) filter (where game.canonical_player_id is null)::integer
      into resolved_identity_count, blocked_row_count
      from public.historical_pro_player_games game
      where game.historical_pro_import_id = v_import.id;
    source_conflict_count := v_import.blocked_conflict_count;
    return next;
    return;
  end if;
  if exists (select 1 from public.historical_pro_imports source where source.preview_fingerprint = p_preview_fingerprint) then
    raise exception 'A different Historical Pro source already uses this preview fingerprint';
  end if;

  for v_row in select value from jsonb_array_elements(p_validated_preview -> 'rows')
  loop
    v_source_row_count := v_source_row_count + 1;
    if coalesce((v_row ->> 'importable')::boolean, false) then
      v_importable_count := v_importable_count + 1;
      if nullif(v_row ->> 'canonicalPlayerId', '') is null then
        raise exception 'Every importable Historical Pro row requires an approved canonical player';
      end if;
      v_canonical_id := public.resolve_canonical_player_id((v_row ->> 'canonicalPlayerId')::uuid);
      if v_canonical_id is null or not exists (select 1 from public.players player where player.id = v_canonical_id) then
        raise exception 'An importable Historical Pro row references an unknown canonical player';
      end if;
      if (v_row ->> 'periodType') = 'season' and (v_row ->> 'periodNumber')::integer = 13 then raise exception 'Season 13 is current and cannot be imported'; end if;
      if (v_row ->> 'periodType') = 'week' and (v_row ->> 'periodNumber')::integer = 107 then raise exception 'Week 107 source conflicts cannot be imported'; end if;
      if coalesce(v_row ->> 'reviewStatus', '') <> 'READY' then raise exception 'Only READY Historical Pro rows can be imported'; end if;
      v_source_fingerprint := nullif(v_row ->> 'sourceFingerprint', '');
      if v_source_fingerprint is null then raise exception 'Historical Pro source fingerprints are required'; end if;
      if exists (select 1 from public.historical_pro_player_games game where game.source_fingerprint = v_source_fingerprint) then
        raise exception 'Duplicate Historical Pro source fingerprint %', v_source_fingerprint;
      end if;
    else
      v_blocked_count := v_blocked_count + 1;
    end if;
    if coalesce(v_row ->> 'reviewStatus', '') = 'SOURCE CONFLICT' then v_conflict_count := v_conflict_count + 1; end if;
  end loop;
  v_conflict_count := greatest(v_conflict_count, coalesce((p_validated_preview ->> 'blockedConflictCount')::integer, 0));

  insert into public.historical_pro_imports (
    source_filename, source_sha256, preview_fingerprint, parser_version, validated_preview,
    source_row_count, importable_row_count, blocked_missing_score_count, blocked_conflict_count, current_period_count, committed_by
  ) values (
    btrim(p_source_filename), lower(p_source_sha256), p_preview_fingerprint, btrim(p_parser_version), p_validated_preview,
    v_source_row_count, v_importable_count, coalesce((p_validated_preview ->> 'blockedMissingScoreCount')::integer, 0),
    v_conflict_count, coalesce((p_validated_preview ->> 'currentPeriodCount')::integer, 0), v_user_id
  ) returning * into v_import;

  for v_row in select value from jsonb_array_elements(p_validated_preview -> 'rows')
  loop
    if not coalesce((v_row ->> 'importable')::boolean, false) then continue; end if;
    v_canonical_id := public.resolve_canonical_player_id((v_row ->> 'canonicalPlayerId')::uuid);
    insert into public.historical_pro_player_games (
      historical_pro_import_id, period_type, period_number, period_label, division, historical_player_name,
      canonical_player_id, game_number, map_course_code, easy_score, hard_score, combined_total, played, wins, losses,
      draws, points, strokes, published_rank, source_era, source_workbook, source_tab, source_page, source_row,
      source_cells, source_url, raw_source_data, source_fingerprint, score_state, pairing_evidence_type,
      opponent_historical_name, opponent_canonical_player_id, identity_reviewed_at, identity_reviewed_by, identity_resolution_note
    ) values (
      v_import.id, v_row ->> 'periodType', (v_row ->> 'periodNumber')::integer, v_row ->> 'periodLabel', v_row ->> 'division',
      v_row ->> 'historicalPlayerName', v_canonical_id, (v_row ->> 'gameNumber')::integer, nullif(v_row ->> 'mapCourseCode', ''),
      nullif(v_row ->> 'easyScore', ''), nullif(v_row ->> 'hardScore', ''), nullif(v_row ->> 'combinedTotal', ''),
      nullif(v_row ->> 'played', ''), nullif(v_row ->> 'wins', ''), nullif(v_row ->> 'losses', ''), nullif(v_row ->> 'draws', ''),
      nullif(v_row ->> 'points', ''), nullif(v_row ->> 'strokes', ''), nullif(v_row ->> 'publishedRank', ''), v_row ->> 'sourceEra',
      v_row ->> 'sourceWorkbook', v_row ->> 'sourceTab', v_row ->> 'sourcePage', v_row ->> 'sourceRow', v_row ->> 'sourceCells',
      v_row ->> 'sourceUrl', v_row ->> 'rawSourceData', v_row ->> 'sourceFingerprint',
      case when v_row ->> 'pairingState' in ('played', 'scheduled_unplayed', 'partial_review', 'unknown') then v_row ->> 'pairingState' else 'unknown' end,
      case when v_row ->> 'pairingEvidenceType' in ('SOURCE COLOR CONFIRMED — PLAYED', 'SOURCE COLOR CONFIRMED — SCHEDULED / UNPLAYED') then v_row ->> 'pairingEvidenceType' else 'UNKNOWN' end,
      nullif(v_row ->> 'opponentHistoricalName', ''), null, 
      now(), v_user_id, nullif(v_row ->> 'identityResolutionNote', '')
    );
    v_inserted_count := v_inserted_count + 1;
    v_resolved_count := v_resolved_count + 1;
  end loop;
  if v_inserted_count <> v_importable_count then raise exception 'Historical Pro inserted row count does not match validated preview'; end if;
  historical_pro_import_id := v_import.id;
  idempotent := false;
  imported_row_count := v_inserted_count;
  resolved_identity_count := v_resolved_count;
  blocked_row_count := v_blocked_count;
  source_conflict_count := v_conflict_count;
  return next;
end;
$function$;

create or replace function public.set_historical_pro_player_game_identity(
  p_historical_pro_player_game_id uuid,
  p_player_id uuid,
  p_resolution_note text default null
)
returns table(historical_pro_player_game_id uuid, canonical_player_id uuid, historical_player_name text, identity_reviewed_at timestamptz, identity_reviewed_by uuid)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_player_id uuid;
  v_game public.historical_pro_player_games%rowtype;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode = '42501'; end if;
  if p_player_id is not null then
    v_player_id := public.resolve_canonical_player_id(p_player_id);
    if v_player_id is null or not exists (select 1 from public.players player where player.id = v_player_id) then raise exception 'Approved Global Player was not found'; end if;
  end if;
  update public.historical_pro_player_games game
  set canonical_player_id = v_player_id, identity_reviewed_at = now(), identity_reviewed_by = v_user_id, identity_resolution_note = nullif(btrim(p_resolution_note), '')
  where game.id = p_historical_pro_player_game_id
  returning game.* into v_game;
  if not found then raise exception 'Historical Pro game was not found'; end if;
  historical_pro_player_game_id := v_game.id; canonical_player_id := v_game.canonical_player_id; historical_player_name := v_game.historical_player_name; identity_reviewed_at := v_game.identity_reviewed_at; identity_reviewed_by := v_game.identity_reviewed_by; return next;
end;
$function$;

create or replace function public.save_historical_pro_pairing_review(
  p_historical_pro_player_game_id uuid,
  p_opponent_historical_name text,
  p_opponent_player_id uuid,
  p_pairing_state text,
  p_review_note text default null
)
returns table(historical_pro_pairing_review_id uuid, historical_pro_player_game_id uuid, pairing_state text, opponent_historical_name text, opponent_canonical_player_id uuid, reviewed_at timestamptz, reviewed_by uuid)
language plpgsql security definer set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_opponent_id uuid;
  v_review public.historical_pro_pairing_reviews%rowtype;
begin
  if v_user_id is null or not public.is_current_user_site_admin() then raise exception 'Site-admin authorization is required' using errcode = '42501'; end if;
  if p_pairing_state not in ('ADMIN CONFIRMED', 'UNKNOWN') then raise exception 'Historical Pro pairing review state is invalid'; end if;
  if p_pairing_state = 'ADMIN CONFIRMED' and nullif(btrim(p_opponent_historical_name), '') is null then raise exception 'An ADMIN CONFIRMED pairing requires an opponent historical name'; end if;
  if p_opponent_player_id is not null then
    v_opponent_id := public.resolve_canonical_player_id(p_opponent_player_id);
    if v_opponent_id is null or not exists (select 1 from public.players player where player.id = v_opponent_id) then raise exception 'Approved opponent Global Player was not found'; end if;
  end if;
  insert into public.historical_pro_pairing_reviews (historical_pro_player_game_id, opponent_historical_name, opponent_canonical_player_id, pairing_state, review_note, reviewed_by)
  values (p_historical_pro_player_game_id, nullif(btrim(p_opponent_historical_name), ''), v_opponent_id, p_pairing_state, nullif(btrim(p_review_note), ''), v_user_id)
  on conflict (historical_pro_player_game_id) do update set opponent_historical_name = excluded.opponent_historical_name, opponent_canonical_player_id = excluded.opponent_canonical_player_id, pairing_state = excluded.pairing_state, review_note = excluded.review_note, reviewed_by = excluded.reviewed_by, reviewed_at = now()
  returning * into v_review;
  update public.historical_pro_player_games game
  set opponent_historical_name = v_review.opponent_historical_name, opponent_canonical_player_id = v_review.opponent_canonical_player_id, pairing_evidence_type = v_review.pairing_state, pairing_reviewed_at = v_review.reviewed_at, pairing_reviewed_by = v_review.reviewed_by, score_state = case when v_review.pairing_state = 'UNKNOWN' then 'unknown' else game.score_state end
  where game.id = v_review.historical_pro_player_game_id;
  historical_pro_pairing_review_id := v_review.id; historical_pro_player_game_id := v_review.historical_pro_player_game_id; pairing_state := v_review.pairing_state; opponent_historical_name := v_review.opponent_historical_name; opponent_canonical_player_id := v_review.opponent_canonical_player_id; reviewed_at := v_review.reviewed_at; reviewed_by := v_review.reviewed_by; return next;
end;
$function$;

revoke all on function public.commit_historical_pro_preview(text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.commit_historical_pro_preview(text,text,text,text,jsonb) to authenticated;
revoke all on function public.set_historical_pro_player_game_identity(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.set_historical_pro_player_game_identity(uuid,uuid,text) to authenticated;
revoke all on function public.save_historical_pro_pairing_review(uuid,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.save_historical_pro_pairing_review(uuid,text,uuid,text,text) to authenticated;

commit;
