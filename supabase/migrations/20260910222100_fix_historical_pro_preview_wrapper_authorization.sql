-- Staging-only authorization repair for the Historical Pro preview wrapper.
-- Keep the existing signature, return type, payload guard, and delegation.

create or replace function public.commit_historical_pro_preview(
  p_source_filename text,
  p_source_sha256 text,
  p_preview_fingerprint text,
  p_parser_version text,
  p_validated_preview jsonb
)
returns table (
  historical_pro_import_id uuid,
  idempotent boolean,
  imported_row_count integer,
  resolved_identity_count integer,
  blocked_row_count integer,
  source_conflict_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_current_user_site_admin() then
    raise exception 'Site-admin authorization is required' using errcode = '42501';
  end if;
  if nullif(p_validated_preview ->> 'importKind', '') is null then
    raise exception 'Historical Pro preview importKind is required';
  end if;
  return query
    select *
    from public.commit_historical_pro_preview_v2(
      p_validated_preview ->> 'importKind',
      p_source_filename,
      p_source_sha256,
      p_preview_fingerprint,
      p_parser_version,
      p_validated_preview
    );
end;
$$;
