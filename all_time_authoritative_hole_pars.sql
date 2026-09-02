-- Authoritative Krys-supplied All-Time hole-par catalog.
-- Safety: this migration only updates existing public.all_time_courses rows by
-- exact code. It never creates courses or touches observations, scores, PBs,
-- identities, historical imports, Climbers seasons, or Climbers events.
-- Source: all_time_authoritative_hole_pars_82_courses.csv

begin;

do $migration$
declare
  v_expected jsonb := $json$
[
  {"code":"20E","par":59,"hole_pars":[3,3,3,3,3,3,4,4,3,4,3,3,4,3,4,3,3,3]},
  {"code":"20H","par":60,"hole_pars":[3,3,3,3,3,3,4,4,3,4,3,3,4,3,4,3,3,4]},
  {"code":"8BE","par":57,"hole_pars":[2,3,3,4,3,3,2,3,3,4,3,3,4,3,4,3,4,3]},
  {"code":"8BH","par":61,"hole_pars":[3,3,3,4,3,3,3,3,4,4,4,4,4,3,3,3,4,3]},
  {"code":"ALE","par":57,"hole_pars":[3,3,4,3,3,3,2,3,3,3,3,4,3,3,4,3,3,4]},
  {"code":"ALH","par":61,"hole_pars":[5,3,3,4,3,4,4,3,3,3,3,3,3,4,3,4,3,3]},
  {"code":"AME","par":66,"hole_pars":[3,3,4,4,4,3,3,5,4,4,4,5,4,3,3,3,3,4]},
  {"code":"AMH","par":65,"hole_pars":[3,3,4,4,3,3,3,5,4,4,4,5,4,3,3,3,3,4]},
  {"code":"ATE","par":59,"hole_pars":[3,3,3,3,3,3,4,3,4,3,4,4,3,3,4,3,3,3]},
  {"code":"ATH","par":59,"hole_pars":[3,3,3,3,3,3,3,2,4,3,4,4,3,3,3,4,3,5]},
  {"code":"AWE","par":57,"hole_pars":[3,3,4,3,4,3,3,4,3,3,3,3,3,3,3,3,3,3]},
  {"code":"AWH","par":56,"hole_pars":[3,3,4,3,3,3,3,3,3,4,3,3,3,3,2,3,3,4]},
  {"code":"BBE","par":60,"hole_pars":[2,3,4,3,4,4,3,4,4,3,2,4,4,3,4,3,3,3]},
  {"code":"BBH","par":67,"hole_pars":[3,3,5,4,4,3,3,4,4,3,2,5,4,3,5,3,3,6]},
  {"code":"BHE","par":53,"hole_pars":[2,3,3,3,3,2,3,3,3,2,3,5,3,3,3,3,3,3]},
  {"code":"BHH","par":59,"hole_pars":[3,3,4,4,3,3,3,3,3,3,3,5,3,4,3,3,3,3]},
  {"code":"CBE","par":63,"hole_pars":[3,4,3,4,3,3,3,4,3,5,3,4,2,3,3,3,3,7]},
  {"code":"CBH","par":67,"hole_pars":[3,4,3,4,3,3,3,4,3,8,3,3,2,4,3,4,4,6]},
  {"code":"CLE","par":58,"hole_pars":[3,3,3,3,3,3,3,3,3,3,3,4,3,4,3,4,4,3]},
  {"code":"CLH","par":58,"hole_pars":[3,3,3,4,3,3,3,3,3,3,4,4,3,4,3,3,3,3]},
  {"code":"EDE","par":62,"hole_pars":[3,3,3,3,4,3,3,3,5,3,5,4,3,3,3,3,3,5]},
  {"code":"EDH","par":61,"hole_pars":[3,3,3,3,4,4,3,3,5,3,4,3,3,3,3,3,3,5]},
  {"code":"ELE","par":57,"hole_pars":[3,3,3,3,4,4,3,3,4,3,3,3,3,2,3,3,4,3]},
  {"code":"ELH","par":60,"hole_pars":[3,3,3,4,3,4,3,3,4,3,4,4,3,3,3,3,4,3]},
  {"code":"FFE","par":64,"hole_pars":[3,2,3,3,4,3,3,5,3,4,3,4,4,4,5,3,3,5]},
  {"code":"FFH","par":59,"hole_pars":[3,3,3,3,4,3,2,5,3,2,3,3,4,4,5,3,2,4]},
  {"code":"GBE","par":61,"hole_pars":[2,3,3,4,3,5,2,3,6,3,4,4,3,4,3,3,3,3]},
  {"code":"GBH","par":64,"hole_pars":[3,3,4,3,4,6,3,3,3,4,4,4,3,3,3,3,4,4]},
  {"code":"GLE","par":63,"hole_pars":[3,3,3,4,4,4,4,3,4,3,4,4,3,3,3,4,2,5]},
  {"code":"GLH","par":63,"hole_pars":[3,3,3,3,3,4,4,3,3,3,4,4,4,4,3,3,4,5]},
  {"code":"HHE","par":56,"hole_pars":[3,3,3,3,3,3,3,3,3,3,4,3,3,3,4,4,3,2]},
  {"code":"HHH","par":55,"hole_pars":[4,3,3,3,3,3,3,3,3,3,4,3,3,2,4,3,3,2]},
  {"code":"HWE","par":56,"hole_pars":[3,3,4,3,3,3,3,3,3,3,2,3,3,4,3,4,3,3]},
  {"code":"HWH","par":62,"hole_pars":[3,3,4,3,3,4,3,3,4,4,3,4,3,5,3,4,3,3]},
  {"code":"ILE","par":61,"hole_pars":[2,3,3,3,3,4,3,4,3,3,3,3,4,4,3,5,4,4]},
  {"code":"ILH","par":59,"hole_pars":[3,2,2,3,3,4,3,3,3,4,3,3,4,3,3,5,4,4]},
  {"code":"JCE","par":56,"hole_pars":[3,3,3,3,3,3,3,3,3,3,3,3,3,4,4,3,3,3]},
  {"code":"JCH","par":60,"hole_pars":[3,3,3,4,3,4,4,3,3,3,3,4,3,3,4,3,3,4]},
  {"code":"LBE","par":64,"hole_pars":[3,3,4,5,3,3,3,4,4,3,3,3,3,4,4,3,3,6]},
  {"code":"LBH","par":65,"hole_pars":[3,3,4,5,3,3,3,3,5,3,3,4,3,5,4,3,4,4]},
  {"code":"LLE","par":57,"hole_pars":[3,3,3,3,4,3,3,3,3,4,3,3,3,4,3,4,3,2]},
  {"code":"LLH","par":58,"hole_pars":[3,3,3,3,3,3,4,3,4,4,3,3,4,3,3,3,3,3]},
  {"code":"MGE","par":58,"hole_pars":[3,3,2,4,3,3,3,4,5,3,3,3,3,3,3,3,4,3]},
  {"code":"MGH","par":60,"hole_pars":[3,3,3,4,3,3,3,3,5,3,3,4,3,4,3,3,4,3]},
  {"code":"MOE","par":61,"hole_pars":[3,3,3,4,3,3,4,4,3,3,3,4,3,4,3,3,4,4]},
  {"code":"MOH","par":62,"hole_pars":[4,4,4,4,4,3,4,3,4,3,3,3,3,3,4,3,3,3]},
  {"code":"MWE","par":57,"hole_pars":[3,2,3,4,3,4,3,4,3,3,3,3,3,3,3,4,4,2]},
  {"code":"MWH","par":57,"hole_pars":[3,2,3,3,2,3,3,4,3,3,2,5,4,3,3,5,4,2]},
  {"code":"MYE","par":61,"hole_pars":[3,3,3,3,4,3,4,3,4,3,3,3,4,3,4,3,4,4]},
  {"code":"MYH","par":63,"hole_pars":[3,3,3,3,3,3,5,3,4,3,3,4,4,3,4,3,4,5]},
  {"code":"OGE","par":54,"hole_pars":[2,3,3,3,2,3,3,3,2,3,4,3,3,3,3,4,4,3]},
  {"code":"OGH","par":64,"hole_pars":[2,3,3,4,3,3,3,4,4,4,5,4,3,3,3,4,5,4]},
  {"code":"QVE","par":54,"hole_pars":[2,2,3,4,3,3,3,3,3,3,2,3,3,4,3,3,3,4]},
  {"code":"QVH","par":60,"hole_pars":[3,3,3,5,4,3,3,3,3,3,3,3,4,4,3,3,3,4]},
  {"code":"RCE","par":59,"hole_pars":[3,3,3,3,3,2,3,4,4,3,3,4,3,4,3,3,3,5]},
  {"code":"RCH","par":59,"hole_pars":[3,3,2,4,3,2,3,3,4,3,3,4,4,4,3,3,3,5]},
  {"code":"SLE","par":64,"hole_pars":[2,3,3,4,4,3,4,3,3,4,3,5,3,5,4,3,3,5]},
  {"code":"SLH","par":68,"hole_pars":[4,4,2,3,4,4,4,3,4,4,3,3,3,5,5,3,4,6]},
  {"code":"SSE","par":62,"hole_pars":[2,3,3,4,2,5,4,3,3,4,3,3,4,3,5,3,3,5]},
  {"code":"SSH","par":67,"hole_pars":[2,3,4,3,4,5,4,3,4,4,3,3,5,3,5,4,3,5]},
  {"code":"SWE","par":55,"hole_pars":[2,3,4,3,3,2,4,4,3,3,3,3,3,3,3,3,2,4]},
  {"code":"SWH","par":59,"hole_pars":[3,3,4,3,3,3,4,4,3,3,3,3,3,2,4,4,3,4]},
  {"code":"TCE","par":55,"hole_pars":[3,2,3,3,3,3,4,3,3,3,3,3,3,3,3,4,4,2]},
  {"code":"TCH","par":57,"hole_pars":[3,3,4,3,3,3,4,3,3,3,2,4,3,3,3,4,4,2]},
  {"code":"TOE","par":55,"hole_pars":[3,4,3,3,3,3,4,3,3,3,3,3,3,2,3,3,3,3]},
  {"code":"TOH","par":55,"hole_pars":[3,3,3,3,3,3,3,3,4,3,3,3,3,3,3,4,3,2]},
  {"code":"TSE","par":63,"hole_pars":[2,3,3,4,3,3,4,5,3,3,3,4,3,4,3,4,5,4]},
  {"code":"TSH","par":64,"hole_pars":[3,3,4,3,4,3,4,5,3,3,3,3,3,3,4,4,5,4]},
  {"code":"TTE","par":57,"hole_pars":[2,2,3,3,3,3,3,4,3,3,3,3,3,4,3,3,3,6]},
  {"code":"TTH","par":61,"hole_pars":[2,3,3,3,3,4,3,3,4,3,3,3,4,4,4,3,3,6]},
  {"code":"UTE","par":58,"hole_pars":[3,3,3,3,3,4,3,3,4,4,3,2,3,4,3,4,3,3]},
  {"code":"UTH","par":63,"hole_pars":[3,4,4,4,3,4,3,3,4,5,3,3,3,4,4,3,3,3]},
  {"code":"VNE","par":58,"hole_pars":[3,3,3,3,3,4,4,3,3,3,3,4,3,3,3,3,3,4]},
  {"code":"VNH","par":60,"hole_pars":[3,3,3,3,3,5,4,3,3,3,3,4,3,4,3,3,3,4]},
  {"code":"WGE","par":55,"hole_pars":[3,3,3,2,4,3,3,3,4,2,2,4,3,2,3,3,3,5]},
  {"code":"WGH","par":55,"hole_pars":[2,3,3,3,4,3,3,3,3,3,3,4,3,3,3,2,3,4]},
  {"code":"WOE","par":64,"hole_pars":[3,3,3,3,4,3,4,4,3,3,3,5,3,4,4,3,4,5]},
  {"code":"WOH","par":66,"hole_pars":[3,3,3,3,4,3,4,4,3,4,3,5,3,5,4,3,4,5]},
  {"code":"WWE","par":61,"hole_pars":[3,3,3,3,4,4,3,3,5,3,4,3,4,4,3,2,3,4]},
  {"code":"WWH","par":60,"hole_pars":[3,3,3,3,4,4,4,3,4,3,4,3,4,4,2,2,4,3]},
  {"code":"ZZE","par":63,"hole_pars":[3,4,3,4,3,5,4,3,3,3,3,3,4,4,3,3,3,5]},
  {"code":"ZZH","par":60,"hole_pars":[4,3,3,4,3,5,4,3,3,3,2,3,3,4,3,4,3,3]}
]
$json$::jsonb;
  v_duplicate_code text;
  v_missing_codes text;
  v_updated integer;
  v_catalog_rows integer;
  v_hole_pars_rows integer;
  v_complete_rows integer;
  v_hole_values integer;
  v_invalid_rows integer;
  v_sbe_count integer;
  v_rce_count integer;
  v_rch_count integer;
begin
  if jsonb_array_length(v_expected) <> 82
     or (select count(distinct item->>'code') from jsonb_array_elements(v_expected) item) <> 82 then
    raise exception 'Authoritative hole-par catalog must contain exactly 82 unique codes';
  end if;

  select e.code
  into v_duplicate_code
  from jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
  group by e.code
  having count(*) > 1
  limit 1;
  if v_duplicate_code is not null then
    raise exception 'Duplicate authoritative course code: %', v_duplicate_code;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
    where jsonb_typeof(e.hole_pars) <> 'array'
  ) then
    raise exception 'Every authoritative hole-par set must be a JSON array';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
    where jsonb_array_length(e.hole_pars) <> 18
  ) then
    raise exception 'Every authoritative course must contain exactly 18 hole pars';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
    where exists (
      select 1
      from jsonb_array_elements(e.hole_pars) value
      where jsonb_typeof(value) <> 'number'
         or value::text !~ '^[0-9]+$'
         or value::text::integer < 1
    )
  ) then
    raise exception 'Every authoritative hole par must be a positive integer';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
    where (select sum(value::text::integer) from jsonb_array_elements(e.hole_pars) value) <> e.par
  ) then
    raise exception 'Every authoritative hole-par sum must equal total par';
  end if;
  if exists (select 1 from jsonb_array_elements(v_expected) item where item->>'code' = 'SBE') then
    raise exception 'SBE is not a real All-Time course and must not be installed';
  end if;
  if exists (select 1 from public.all_time_courses where code = 'SBE') then
    raise exception 'SBE exists in the installed catalog; resolve it before installing authoritative pars';
  end if;

  select string_agg(e.code, ', ' order by e.code)
  into v_missing_codes
  from jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
  left join public.all_time_courses c on c.code = e.code
  where c.id is null;
  if v_missing_codes is not null then
    raise exception 'Authoritative course codes missing from public.all_time_courses: %', v_missing_codes;
  end if;

  select string_agg(duplicates.code, ', ' order by duplicates.code)
  into v_duplicate_code
  from (
    select c.code
    from public.all_time_courses c
    join jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
      on e.code = c.code
    group by c.code
    having count(*) > 1
  ) duplicates;
  if v_duplicate_code is not null then
    raise exception 'Duplicate installed All-Time course code: %', v_duplicate_code;
  end if;

  if exists (
    select 1
    from public.all_time_courses c
    join jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
      on e.code = c.code
    where c.active is not true
       or c.difficulty not in ('Easy', 'Hard')
  ) then
    raise exception 'Expected authoritative course rows must already be active Easy/Hard catalog rows';
  end if;

  select count(*)
  into v_catalog_rows
  from public.all_time_courses
  where active = true
    and difficulty in ('Easy', 'Hard');
  if v_catalog_rows <> 82 then
    raise exception 'Expected exactly 82 active Easy/Hard All-Time courses before repair; found %', v_catalog_rows;
  end if;

  with expected as (
    select *
    from jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
  )
  update public.all_time_courses c
  set par = e.par,
      hole_pars = e.hole_pars
  from expected e
  where c.code = e.code
    and c.active = true
    and c.difficulty in ('Easy', 'Hard');

  get diagnostics v_updated = row_count;
  if v_updated <> 82 then
    raise exception 'Authoritative hole-par migration updated % rows; expected exactly 82', v_updated;
  end if;

  select count(*)
  into v_catalog_rows
  from public.all_time_courses
  where active = true
    and difficulty in ('Easy', 'Hard');
  if v_catalog_rows <> 82 then
    raise exception 'Post-update active Easy/Hard All-Time catalog count is %; expected 82', v_catalog_rows;
  end if;

  select count(*)
  into v_hole_pars_rows
  from public.all_time_courses
  where active = true
    and difficulty in ('Easy', 'Hard')
    and hole_pars is not null;
  if v_hole_pars_rows <> 82 then
    raise exception 'Post-update non-null hole_pars rows are %; expected 82', v_hole_pars_rows;
  end if;

  select count(*)
  into v_complete_rows
  from public.all_time_courses
  where active = true
    and difficulty in ('Easy', 'Hard')
    and jsonb_typeof(hole_pars) = 'array'
    and jsonb_array_length(hole_pars) = 18;
  if v_complete_rows <> 82 then
    raise exception 'Post-update complete 18-hole rows are %; expected 82', v_complete_rows;
  end if;

  select coalesce(sum(jsonb_array_length(hole_pars)), 0)
  into v_hole_values
  from public.all_time_courses
  where active = true
    and difficulty in ('Easy', 'Hard')
    and jsonb_typeof(hole_pars) = 'array';
  if v_hole_values <> 1476 then
    raise exception 'Post-update total hole values are %; expected 1476', v_hole_values;
  end if;

  with course_checks as (
    select
      c.par,
      c.hole_pars,
      jsonb_typeof(c.hole_pars) as hole_pars_type,
      case
        when jsonb_typeof(c.hole_pars) = 'array' then jsonb_array_length(c.hole_pars)
        else null
      end as hole_count,
      case
        when jsonb_typeof(c.hole_pars) = 'array'
         and not exists (
           select 1
           from jsonb_array_elements(c.hole_pars) as value
           where jsonb_typeof(value) <> 'number'
              or (value #>> '{}') !~ '^[0-9]+$'
              or (value #>> '{}')::integer <= 0
         )
        then true
        else false
      end as valid_hole_values
    from public.all_time_courses c
    where c.active = true
      and c.difficulty in ('Easy', 'Hard')
  ), normalized_checks as (
    select
      par,
      hole_pars,
      hole_pars_type,
      hole_count,
      valid_hole_values,
      case
        when valid_hole_values then (
          select coalesce(sum((value #>> '{}')::integer), 0)
          from jsonb_array_elements(hole_pars) as value
        )
        else null
      end as hole_sum
    from course_checks
  )
  select count(*)
  into v_invalid_rows
  from normalized_checks
  where hole_pars is null
     or hole_pars_type is distinct from 'array'
     or hole_count is distinct from 18
     or not valid_hole_values
     or hole_sum is distinct from par;
  if v_invalid_rows <> 0 then
    raise exception 'Post-update invalid All-Time hole-par rows are %; expected 0', v_invalid_rows;
  end if;

  select count(*) into v_sbe_count from public.all_time_courses where code = 'SBE';
  if v_sbe_count <> 0 then
    raise exception 'SBE must remain absent; found % rows', v_sbe_count;
  end if;

  select count(*) into v_rce_count from public.all_time_courses where code = 'RCE';
  if v_rce_count <> 1 then
    raise exception 'Expected exactly one RCE row; found %', v_rce_count;
  end if;

  select count(*) into v_rch_count from public.all_time_courses where code = 'RCH';
  if v_rch_count <> 1 then
    raise exception 'Expected exactly one RCH row; found %', v_rch_count;
  end if;

  if exists (
    select 1
    from public.all_time_courses c
    join jsonb_to_recordset(v_expected) as e(code text, par integer, hole_pars jsonb)
      on e.code = c.code
    where c.par is distinct from e.par
       or c.hole_pars is distinct from e.hole_pars
  ) then
    raise exception 'Authoritative hole-par post-update verification failed';
  end if;
end;
$migration$;

commit;
