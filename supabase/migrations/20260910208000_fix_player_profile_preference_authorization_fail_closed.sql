-- Staging-only fix: make profile preference ownership checks fail closed.

create or replace function public.can_edit_player_profile_preferences(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  with current_identity as (
    select public.current_user_canonical_player_id() as canonical_player_id
  )
  select coalesce(
    auth.uid() is not null
    and current_identity.canonical_player_id is not null
    and current_identity.canonical_player_id = public.resolve_canonical_player_id(p_player_id),
    false
  )
  from current_identity;
$function$;
