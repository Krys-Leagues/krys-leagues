begin;

-- Admin-confirmed opponent evidence is intentionally separate from immutable
-- Historical Stroke imports, standings, course results, and source fingerprints.
create table if not exists public.historical_stroke_opponent_assignments (
  id uuid primary key default gen_random_uuid(),
  historical_stroke_import_id uuid not null references public.historical_stroke_imports(id) on delete cascade,
  historical_stroke_standing_id uuid not null references public.historical_stroke_standings(id) on delete cascade,
  historical_stroke_course_appearance_id uuid not null references public.historical_stroke_course_appearances(id) on delete cascade,
  division_number integer not null check (division_number > 0),
  course_order integer not null check (course_order > 0),
  historical_course_name text not null check (btrim(historical_course_name) <> ''),
  opponent_kind text not null check (opponent_kind in ('player', 'bye', 'unknown')),
  opponent_historical_stroke_standing_id uuid null references public.historical_stroke_standings(id) on delete cascade,
  evidence_type text not null default 'admin_confirmed' check (evidence_type = 'admin_confirmed'),
  admin_note text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint historical_stroke_assignment_opponent_shape check (
    (opponent_kind = 'player' and opponent_historical_stroke_standing_id is not null
      and opponent_historical_stroke_standing_id <> historical_stroke_standing_id)
    or (opponent_kind in ('bye', 'unknown') and opponent_historical_stroke_standing_id is null)
  ),
  constraint historical_stroke_assignment_appearance_key unique (historical_stroke_course_appearance_id),
  constraint historical_stroke_assignment_standing_game_key unique (historical_stroke_standing_id, course_order)
);

create index if not exists historical_stroke_assignment_import_idx
  on public.historical_stroke_opponent_assignments(historical_stroke_import_id, division_number, course_order);

alter table public.historical_stroke_opponent_assignments enable row level security;
drop policy if exists "Site admins can read Historical Stroke opponent assignments" on public.historical_stroke_opponent_assignments;
create policy "Site admins can read Historical Stroke opponent assignments"
  on public.historical_stroke_opponent_assignments for select to authenticated
  using (public.is_current_user_site_admin());
revoke all on table public.historical_stroke_opponent_assignments from public, anon, authenticated;
grant select on table public.historical_stroke_opponent_assignments to authenticated;

create or replace function public.save_historical_stroke_pairing_review(
  p_historical_stroke_import_id uuid,
  p_expected_assignments jsonb,
  p_assignments jsonb
)
returns table(saved_assignment_count integer, reviewed_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_current jsonb;
  v_saved_at timestamptz := clock_timestamp();
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Site administrator access is required.';
  end if;
  if jsonb_typeof(coalesce(p_expected_assignments, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_assignments, '[]'::jsonb)) <> 'array' then
    raise exception 'Pairing assignment payloads must be JSON arrays.';
  end if;
  if not exists (select 1 from public.historical_stroke_imports where id = p_historical_stroke_import_id for update) then
    raise exception 'Historical Stroke import was not found.';
  end if;

  perform 1 from public.historical_stroke_opponent_assignments
  where historical_stroke_import_id = p_historical_stroke_import_id
  for update;

  select coalesce(jsonb_agg(jsonb_build_object(
    'appearance_id', a.historical_stroke_course_appearance_id,
    'opponent_kind', a.opponent_kind,
    'opponent_standing_id', a.opponent_historical_stroke_standing_id,
    'admin_note', a.admin_note
  ) order by a.historical_stroke_course_appearance_id::text), '[]'::jsonb)
  into v_current
  from public.historical_stroke_opponent_assignments a
  where a.historical_stroke_import_id = p_historical_stroke_import_id;

  if v_current <> coalesce(p_expected_assignments, '[]'::jsonb) then
    raise exception 'Pairing review changed since it was loaded. Reload before saving.';
  end if;

  if exists (
    with requested as (
      select * from jsonb_to_recordset(p_assignments) as x(
        appearance_id uuid, opponent_kind text, opponent_standing_id uuid, admin_note text
      )
    )
    select 1 from requested r
    left join public.historical_stroke_course_appearances ca on ca.id = r.appearance_id
    left join public.historical_stroke_standings s on s.id = ca.historical_stroke_standing_id
    where r.appearance_id is null or r.opponent_kind not in ('player', 'bye', 'unknown')
      or s.id is null or s.historical_stroke_import_id <> p_historical_stroke_import_id
      or (r.opponent_kind = 'player' and (r.opponent_standing_id is null or r.opponent_standing_id = s.id))
      or (r.opponent_kind in ('bye', 'unknown') and r.opponent_standing_id is not null)
  ) then raise exception 'Invalid Historical Stroke opponent assignment.'; end if;

  if exists (
    with requested as (
      select * from jsonb_to_recordset(p_assignments) as x(
        appearance_id uuid, opponent_kind text, opponent_standing_id uuid, admin_note text
      )
    )
    select 1 from requested r
    join public.historical_stroke_course_appearances ca on ca.id = r.appearance_id
    join public.historical_stroke_standings s on s.id = ca.historical_stroke_standing_id
    left join public.historical_stroke_standings os on os.id = r.opponent_standing_id
    left join public.historical_stroke_course_appearances oca
      on oca.historical_stroke_standing_id = os.id and oca.course_order = ca.course_order
    left join requested reciprocal
      on reciprocal.appearance_id = oca.id and reciprocal.opponent_kind = 'player'
      and reciprocal.opponent_standing_id = s.id
    where r.opponent_kind = 'player' and (
      os.id is null or os.historical_stroke_import_id <> s.historical_stroke_import_id
      or os.division_number <> s.division_number or oca.id is null or reciprocal.appearance_id is null
    )
  ) then raise exception 'Player pairings must be reciprocal and within the same import, division, and course/game.'; end if;

  if exists (
    with requested as (
      select * from jsonb_to_recordset(p_assignments) as x(
        appearance_id uuid, opponent_kind text, opponent_standing_id uuid, admin_note text
      )
    )
    select 1 from requested r
    join public.historical_stroke_course_appearances ca on ca.id = r.appearance_id
    join public.historical_stroke_standings s on s.id = ca.historical_stroke_standing_id
    join public.historical_stroke_imports i on i.id = s.historical_stroke_import_id
    where r.opponent_kind = 'bye' and not exists (
      select 1 from jsonb_array_elements(coalesce(i.validated_preview->'byeRows', '[]'::jsonb)) bye
      where (bye->>'divisionNumber')::integer = s.division_number
    )
  ) then raise exception 'BYE is not available because the imported division has no BYE source evidence.'; end if;

  delete from public.historical_stroke_opponent_assignments
  where historical_stroke_import_id = p_historical_stroke_import_id;

  insert into public.historical_stroke_opponent_assignments (
    historical_stroke_import_id, historical_stroke_standing_id,
    historical_stroke_course_appearance_id, division_number, course_order,
    historical_course_name, opponent_kind, opponent_historical_stroke_standing_id,
    admin_note, reviewed_by, reviewed_at, updated_at
  )
  select p_historical_stroke_import_id, s.id, ca.id, s.division_number, ca.course_order,
    ca.historical_course_name, r.opponent_kind, r.opponent_standing_id,
    nullif(btrim(r.admin_note), ''), v_user_id, v_saved_at, v_saved_at
  from jsonb_to_recordset(p_assignments) as r(
    appearance_id uuid, opponent_kind text, opponent_standing_id uuid, admin_note text
  )
  join public.historical_stroke_course_appearances ca on ca.id = r.appearance_id
  join public.historical_stroke_standings s on s.id = ca.historical_stroke_standing_id;

  return query select jsonb_array_length(p_assignments), v_saved_at;
end;
$function$;

revoke all on function public.save_historical_stroke_pairing_review(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_historical_stroke_pairing_review(uuid, jsonb, jsonb) to authenticated;

commit;
