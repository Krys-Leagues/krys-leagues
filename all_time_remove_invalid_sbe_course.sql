-- Remove the confirmed invalid Strong Badia catalog row only.
-- This migration is intentionally narrow and must be run only after review.
-- It never modifies observations, best records, audits, mappings, imports,
-- identities, Climbers data, or any course other than the exact SBE row.

begin;

do $cleanup$
declare
  v_expected_id constant uuid := '90438379-58c4-4fd4-9a6f-ec7ae0fac466';
  v_sbe_count integer;
  v_sbe_id uuid;
  v_code text;
  v_display_name text;
  v_base_map text;
  v_difficulty text;
  v_active boolean;
  v_par integer;
  v_hole_pars jsonb;
  v_observations integer;
  v_best_records integer;
  v_correction_audit integer;
  v_source_mappings integer;
  v_late_audit integer;
  v_late_batches integer;
  v_climbers_events integer;
  v_deleted integer;
begin
  select count(*)::integer
  into v_sbe_count
  from public.all_time_courses
  where code = 'SBE';

  -- Rerunning after a successful cleanup is a safe no-op.
  if v_sbe_count = 0 then
    return;
  end if;
  if v_sbe_count <> 1 then
    raise exception 'Refusing SBE cleanup: expected exactly one SBE row, found %', v_sbe_count;
  end if;

  select id, code, display_name, base_map, difficulty, active, par, hole_pars
  into v_sbe_id, v_code, v_display_name, v_base_map, v_difficulty, v_active, v_par, v_hole_pars
  from public.all_time_courses
  where code = 'SBE'
  for update;

  if v_sbe_id <> v_expected_id then
    raise exception 'Refusing SBE cleanup: UUID % does not match expected UUID %', v_sbe_id, v_expected_id;
  end if;
  if v_code <> 'SBE'
     or v_display_name <> 'Strong Badia Easy'
     or v_base_map <> 'Strong Badia'
     or v_difficulty <> 'Easy'
     or v_active is distinct from false
     or v_par is distinct from 54
     or v_hole_pars is not null then
    raise exception 'Refusing SBE cleanup: catalog metadata does not match the confirmed invalid row';
  end if;

  -- Recheck every discovered course_id reference while the course row is locked.
  select count(*)::integer into v_observations
  from public.all_time_record_observations where course_id = v_expected_id;
  select count(*)::integer into v_best_records
  from public.all_time_best_records where course_id = v_expected_id;
  select count(*)::integer into v_correction_audit
  from public.all_time_correction_audit where course_id = v_expected_id;
  select count(*)::integer into v_source_mappings
  from public.all_time_course_source_mappings where course_id = v_expected_id;
  select count(*)::integer into v_late_audit
  from public.all_time_late_backfill_audit where course_id = v_expected_id;
  select count(*)::integer into v_late_batches
  from public.all_time_late_backfill_batches where course_id = v_expected_id;
  select count(*)::integer into v_climbers_events
  from public.climbers_events where course_id = v_expected_id;

  if v_observations <> 0
     or v_best_records <> 0
     or v_correction_audit <> 0
     or v_source_mappings <> 0
     or v_late_audit <> 0
     or v_late_batches <> 0
     or v_climbers_events <> 0 then
    raise exception 'Refusing SBE cleanup: references exist (observations=%, best_records=%, correction_audit=%, source_mappings=%, late_audit=%, late_batches=%, climbers_events=%)',
      v_observations, v_best_records, v_correction_audit, v_source_mappings,
      v_late_audit, v_late_batches, v_climbers_events;
  end if;

  delete from public.all_time_courses
  where id = v_expected_id
    and code = 'SBE'
    and active = false;

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception 'Refusing SBE cleanup: expected to delete exactly one row, deleted %', v_deleted;
  end if;
end;
$cleanup$;

commit;
