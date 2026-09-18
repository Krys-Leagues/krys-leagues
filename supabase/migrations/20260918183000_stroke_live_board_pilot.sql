begin;

create table if not exists public.stroke_discord_boards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null check (division_number between 1 and 5),
  discord_channel_id text not null check (discord_channel_id ~ '^[0-9]+$'),
  discord_message_id text check (discord_message_id is null or discord_message_id ~ '^[0-9]+$'),
  last_payload_hash text check (last_payload_hash is null or last_payload_hash ~ '^[a-f0-9]{64}$'),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, division_number),
  unique (discord_channel_id, discord_message_id)
);

create table if not exists public.stroke_discord_board_sync_outbox (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  division_number integer not null check (division_number between 1 and 5),
  reason text not null,
  sync_state text not null default 'pending' check (sync_state in ('pending', 'claimed', 'succeeded', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, division_number)
);

alter table public.stroke_discord_boards enable row level security;
alter table public.stroke_discord_boards force row level security;
alter table public.stroke_discord_board_sync_outbox enable row level security;
alter table public.stroke_discord_board_sync_outbox force row level security;
revoke all on table public.stroke_discord_boards from public, anon, authenticated;
revoke all on table public.stroke_discord_board_sync_outbox from public, anon, authenticated;
grant select, insert, update on table public.stroke_discord_boards to service_role;
grant select, insert, update on table public.stroke_discord_board_sync_outbox to service_role;

create or replace function public.claim_stroke_discord_board_sync_tasks_service(
  p_claim_token uuid,
  p_limit integer default 5
)
returns table (season_id uuid, division_number integer)
language sql
security definer
set search_path = ''
as $function$
  with candidates as (
    select item.id
    from public.stroke_discord_board_sync_outbox as item
    where item.next_attempt_at <= now()
      and (
        item.sync_state in ('pending', 'failed')
        or (item.sync_state = 'claimed' and item.claimed_at < now() - interval '5 minutes')
      )
    order by item.next_attempt_at, item.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 10))
  ), claimed as (
    update public.stroke_discord_board_sync_outbox as item
    set sync_state = 'claimed', claim_token = p_claim_token, claimed_at = now(),
        attempt_count = item.attempt_count + 1, updated_at = now()
    from candidates
    where item.id = candidates.id
    returning item.season_id, item.division_number
  )
  select claimed.season_id, claimed.division_number from claimed;
$function$;

revoke all on function public.claim_stroke_discord_board_sync_tasks_service(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_stroke_discord_board_sync_tasks_service(uuid, integer) to service_role;

create or replace function public.queue_stroke_discord_board_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_season_id uuid;
  v_division integer;
  v_league_type text;
begin
  if tg_table_name = 'schedule' then
    v_season_id := coalesce(new.season_id, old.season_id);
    v_division := coalesce(new.division_number, old.division_number);
    v_league_type := coalesce(new.league_type, old.league_type);
  elsif tg_table_name = 'results' then
    select fixture.season_id, fixture.division_number, fixture.league_type
      into v_season_id, v_division, v_league_type
    from public.schedule as fixture
    where fixture.id = coalesce(new.schedule_id, old.schedule_id);
  elsif tg_table_name = 'stroke_division_roster_slots' then
    v_division := coalesce(new.division_number, old.division_number);
    v_league_type := 'stroke';
    select roster.season_id into v_season_id
    from public.stroke_roster_versions as roster
    where roster.id = coalesce(new.roster_version_id, old.roster_version_id);
  end if;
  if v_league_type = 'stroke' and v_season_id is not null and v_division between 1 and 5 then
    insert into public.stroke_discord_board_sync_outbox (
      season_id, division_number, reason, sync_state, next_attempt_at, updated_at
    ) values (
      v_season_id, v_division, tg_table_name || '_' || lower(tg_op), 'pending', now(), now()
    )
    on conflict (season_id, division_number) do update
    set reason = excluded.reason, sync_state = 'pending', next_attempt_at = now(),
        last_error = null, updated_at = now();
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function public.queue_stroke_discord_board_sync() from public, anon, authenticated;

drop trigger if exists queue_stroke_board_from_schedule on public.schedule;
create trigger queue_stroke_board_from_schedule
after insert or update or delete on public.schedule
for each row execute function public.queue_stroke_discord_board_sync();

drop trigger if exists queue_stroke_board_from_results on public.results;
create trigger queue_stroke_board_from_results
after insert or update or delete on public.results
for each row execute function public.queue_stroke_discord_board_sync();

drop trigger if exists queue_stroke_board_from_roster_slots on public.stroke_division_roster_slots;
create trigger queue_stroke_board_from_roster_slots
after insert or update or delete on public.stroke_division_roster_slots
for each row execute function public.queue_stroke_discord_board_sync();

commit;
