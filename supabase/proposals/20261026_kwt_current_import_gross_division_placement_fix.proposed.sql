-- KWT current-season importer: derive missing gross division placements.
-- Additive corrective change. It only updates PREVIEW rows; it never touches
-- operational results, NET standings, handicaps, or published awards.

create or replace function public.refresh_kwt_current_import_placements(
  p_batch_id uuid
)
returns table(updated_rows integer, error_rows integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_updated integer := 0;
begin
  if v_user is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  select status into v_status
  from public.kwt_current_import_batches
  where id = p_batch_id
  for update;

  if v_status is null then raise exception 'KWT import batch was not found'; end if;
  if v_status <> 'PREVIEW' then raise exception 'Only a preview batch can be recalculated'; end if;

  with ranked as (
    select id,
           rank() over (partition by division order by total_score asc)::integer as calculated_division_placement
    from public.kwt_current_import_rows
    where batch_id = p_batch_id
      and division is not null
      and total_score is not null
  )
  update public.kwt_current_import_rows as current_row
  set division_placement = ranked.calculated_division_placement,
      validation_errors = array(
        select error_text
        from unnest(current_row.validation_errors) as error_text
        where error_text <> 'placement: Division Placement must be a positive integer.'
      )
  from ranked
  where current_row.id = ranked.id;

  get diagnostics v_updated = row_count;

  update public.kwt_current_import_batches as batch
  set error_rows = (
    select count(*)
    from public.kwt_current_import_rows as current_row
    where current_row.batch_id = batch.id
      and (current_row.identity_status not in ('MATCHED', 'MANUAL') or cardinality(current_row.validation_errors) > 0)
  )
  where batch.id = p_batch_id;

  updated_rows := v_updated;
  select batch.error_rows into error_rows
  from public.kwt_current_import_batches as batch
  where batch.id = p_batch_id;
  return next;
end;
$function$;

revoke all on function public.refresh_kwt_current_import_placements(uuid) from public, anon;
grant execute on function public.refresh_kwt_current_import_placements(uuid) to authenticated;
