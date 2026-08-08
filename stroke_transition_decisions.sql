create table if not exists public.stroke_final_scorecard_player_decisions (
  id uuid primary key default gen_random_uuid(),
  final_scorecard_id uuid not null references public.stroke_final_scorecards(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  decision text not null check (decision in ('returning', 'not_returning')),
  decided_at timestamptz not null,
  decided_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stroke_transition_decisions_scorecard_player_key
    unique (final_scorecard_id, player_id)
);

create index if not exists stroke_final_scorecard_player_decisions_player_idx
on public.stroke_final_scorecard_player_decisions(player_id);

alter table public.stroke_final_scorecard_player_decisions enable row level security;

drop policy if exists stroke_transition_decisions_authenticated_select
on public.stroke_final_scorecard_player_decisions;

create policy stroke_transition_decisions_authenticated_select
on public.stroke_final_scorecard_player_decisions
for select
to authenticated
using (true);

revoke all on public.stroke_final_scorecard_player_decisions from public;
revoke all on public.stroke_final_scorecard_player_decisions from anon;
revoke insert, update, delete on public.stroke_final_scorecard_player_decisions from authenticated;
grant select on public.stroke_final_scorecard_player_decisions to authenticated;

create or replace function public.validate_stroke_transition_decision()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if not exists (
    select 1
    from public.stroke_final_scorecards as scorecard
    join public.stroke_final_scorecard_entries as entry
      on entry.scorecard_id = scorecard.id
    where scorecard.id = new.final_scorecard_id
      and scorecard.status = 'approved'
      and entry.player_id = new.player_id
  ) then
    raise exception
      'Return decisions require a player from an approved Stroke Final Scorecard';
  end if;

  return new;
end;
$function$;

drop trigger if exists stroke_transition_decisions_validate
on public.stroke_final_scorecard_player_decisions;

create trigger stroke_transition_decisions_validate
before insert or update
on public.stroke_final_scorecard_player_decisions
for each row
execute function public.validate_stroke_transition_decision();

create or replace function public.set_stroke_return_decision(
  p_final_scorecard_id uuid,
  p_player_id uuid,
  p_decision text
)
returns table(
  final_scorecard_id uuid,
  player_id uuid,
  decision text,
  decided_at timestamptz,
  decided_by uuid
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_decision text;
  v_row public.stroke_final_scorecard_player_decisions%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication is required to set a Stroke return decision' using errcode = '42501';
  end if;

  if p_final_scorecard_id is null or p_player_id is null then
    raise exception 'Final Scorecard ID and player ID are required';
  end if;

  v_decision := lower(btrim(p_decision));
  if v_decision not in ('returning', 'not_returning') then
    raise exception 'Decision must be returning or not_returning';
  end if;

  perform 1
  from public.stroke_final_scorecards as scorecard
  where scorecard.id = p_final_scorecard_id
    and scorecard.status = 'approved'
  for share;
  if not found then raise exception 'An approved Stroke Final Scorecard is required'; end if;

  if not exists (
    select 1 from public.stroke_final_scorecard_entries as entry
    where entry.scorecard_id = p_final_scorecard_id and entry.player_id = p_player_id
  ) then
    raise exception 'Player is not an entry on this approved Final Scorecard';
  end if;

  insert into public.stroke_final_scorecard_player_decisions (
    final_scorecard_id, player_id, decision, decided_at, decided_by
  ) values (
    p_final_scorecard_id, p_player_id, v_decision, now(), v_user_id
  )
  on conflict on constraint stroke_transition_decisions_scorecard_player_key
  do update set decision = excluded.decision, decided_at = excluded.decided_at,
    decided_by = excluded.decided_by, updated_at = now()
  returning * into v_row;

  return query select v_row.final_scorecard_id, v_row.player_id, v_row.decision,
    v_row.decided_at, v_row.decided_by;
end;
$function$;

revoke all on function public.set_stroke_return_decision(uuid, uuid, text) from public;
revoke all on function public.set_stroke_return_decision(uuid, uuid, text) from anon;
revoke all on function public.set_stroke_return_decision(uuid, uuid, text) from authenticated;
grant execute on function public.set_stroke_return_decision(uuid, uuid, text) to authenticated;
