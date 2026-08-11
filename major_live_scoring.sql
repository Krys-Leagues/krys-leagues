-- Install after majors_foundation.sql. Do not run before the Four Majors tables exist.
-- Neutral hole-by-hole scoring only: no cuts, advancement, winners, ties, or format rules.

alter table public.major_events
  add column if not exists scorecard_background_url text,
  add column if not exists scorecard_accent_color text,
  add column if not exists scorecard_text_color text;

alter table public.major_events
  drop constraint if exists major_events_scorecard_background_url_check;
alter table public.major_events
  add constraint major_events_scorecard_background_url_check
  check (
    scorecard_background_url is null
    or scorecard_background_url like '/%'
    or scorecard_background_url ~ '^https://'
  );

alter table public.major_events
  drop constraint if exists major_events_scorecard_accent_color_check;
alter table public.major_events
  add constraint major_events_scorecard_accent_color_check
  check (scorecard_accent_color is null or scorecard_accent_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.major_events
  drop constraint if exists major_events_scorecard_text_color_check;
alter table public.major_events
  add constraint major_events_scorecard_text_color_check
  check (scorecard_text_color is null or scorecard_text_color ~ '^#[0-9A-Fa-f]{6}$');

create table if not exists public.major_scoring_sessions (
  id uuid primary key default gen_random_uuid(),
  major_event_id uuid not null references public.major_events(id) on delete restrict,
  label text not null check (btrim(label) <> ''),
  participant_count smallint not null check (participant_count in (2, 3)),
  current_hole smallint not null default 1 check (current_hole between 1 and 18),
  is_active boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.major_scoring_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.major_scoring_sessions(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  player_id uuid not null references public.players(id) on delete restrict,
  player_screen_name_snapshot text not null check (btrim(player_screen_name_snapshot) <> ''),
  created_at timestamptz not null default now(),
  unique (session_id, position),
  unique (session_id, player_id)
);

create table if not exists public.major_hole_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.major_scoring_sessions(id) on delete cascade,
  participant_id uuid not null references public.major_scoring_participants(id) on delete cascade,
  hole_number smallint not null check (hole_number between 1 and 18),
  strokes smallint not null check (strokes between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, participant_id, hole_number)
);

create index if not exists major_scoring_sessions_event_idx
  on public.major_scoring_sessions (major_event_id, updated_at desc);
create index if not exists major_scoring_participants_session_idx
  on public.major_scoring_participants (session_id, position);
create index if not exists major_hole_scores_session_idx
  on public.major_hole_scores (session_id, hole_number, participant_id);

alter table public.major_scoring_sessions enable row level security;
alter table public.major_scoring_participants enable row level security;
alter table public.major_hole_scores enable row level security;

revoke all on table public.major_scoring_sessions from public, anon, authenticated;
revoke all on table public.major_scoring_participants from public, anon, authenticated;
revoke all on table public.major_hole_scores from public, anon, authenticated;
grant select on table public.major_scoring_sessions to authenticated;
grant select on table public.major_scoring_participants to authenticated;
grant select on table public.major_hole_scores to authenticated;

drop policy if exists "Site admins can read Major scoring sessions"
on public.major_scoring_sessions;
create policy "Site admins can read Major scoring sessions"
on public.major_scoring_sessions for select to authenticated
using (public.is_current_user_site_admin());

drop policy if exists "Site admins can read Major scoring participants"
on public.major_scoring_participants;
create policy "Site admins can read Major scoring participants"
on public.major_scoring_participants for select to authenticated
using (public.is_current_user_site_admin());

drop policy if exists "Site admins can read Major hole scores"
on public.major_hole_scores;
create policy "Site admins can read Major hole scores"
on public.major_hole_scores for select to authenticated
using (public.is_current_user_site_admin());

drop trigger if exists major_scoring_sessions_touch_updated_at on public.major_scoring_sessions;
create trigger major_scoring_sessions_touch_updated_at
before update on public.major_scoring_sessions
for each row execute function public.touch_major_updated_at();

drop trigger if exists major_hole_scores_touch_updated_at on public.major_hole_scores;
create trigger major_hole_scores_touch_updated_at
before update on public.major_hole_scores
for each row execute function public.touch_major_updated_at();

create or replace function public.create_major_scoring_session(
  p_major_event_id uuid,
  p_label text,
  p_player_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_session_id uuid;
  requested_count integer;
  found_count integer;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  requested_count := coalesce(array_length(p_player_ids, 1), 0);
  if requested_count not in (2, 3) then
    raise exception 'A Major scoring session requires exactly 2 or 3 players';
  end if;
  if (select count(distinct player_id) from unnest(p_player_ids) player_id) <> requested_count then
    raise exception 'Each scoring participant must be a different canonical player';
  end if;
  if not exists (select 1 from public.major_events event where event.id = p_major_event_id) then
    raise exception 'Major event not found';
  end if;

  select count(*) into found_count
  from public.players player where player.id = any(p_player_ids);
  if found_count <> requested_count then raise exception 'One or more players were not found'; end if;

  insert into public.major_scoring_sessions (major_event_id, label, participant_count)
  values (p_major_event_id, btrim(p_label), requested_count)
  returning id into new_session_id;

  insert into public.major_scoring_participants (
    session_id, position, player_id, player_screen_name_snapshot
  )
  select new_session_id, selected.ordinality, player.id, player.screen_name
  from unnest(p_player_ids) with ordinality selected(player_id, ordinality)
  join public.players player on player.id = selected.player_id;

  return new_session_id;
end;
$function$;

revoke all on function public.create_major_scoring_session(uuid,text,uuid[])
from public, anon, authenticated;

create or replace function public.save_major_scorecard_theme(
  p_major_event_id uuid,
  p_background_url text,
  p_accent_color text,
  p_text_color text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  update public.major_events set
    scorecard_background_url = nullif(btrim(p_background_url), ''),
    scorecard_accent_color = nullif(btrim(p_accent_color), ''),
    scorecard_text_color = nullif(btrim(p_text_color), '')
  where id = p_major_event_id;
  if not found then raise exception 'Major event not found'; end if;
end;
$function$;

revoke all on function public.save_major_scorecard_theme(uuid,text,text,text)
from public, anon, authenticated;

create or replace function public.update_major_scoring_session(
  p_session_id uuid,
  p_label text,
  p_current_hole integer,
  p_is_active boolean,
  p_is_public boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  update public.major_scoring_sessions set
    label = btrim(p_label),
    current_hole = p_current_hole,
    is_active = p_is_active,
    is_public = p_is_public
  where id = p_session_id;
  if not found then raise exception 'Major scoring session not found'; end if;
end;
$function$;

revoke all on function public.update_major_scoring_session(uuid,text,integer,boolean,boolean)
from public, anon, authenticated;

create or replace function public.save_major_hole_scores(
  p_session_id uuid,
  p_hole_number integer,
  p_scores jsonb
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  score_item jsonb;
  score_participant_id uuid;
  score_value integer;
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  if p_hole_number not between 1 and 18 then raise exception 'Hole must be between 1 and 18'; end if;
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'Scores must be an array'; end if;

  for score_item in select value from jsonb_array_elements(p_scores)
  loop
    score_participant_id := (score_item ->> 'participant_id')::uuid;
    score_value := (score_item ->> 'strokes')::integer;
    if score_value not between 1 and 99 then raise exception 'Score must be between 1 and 99'; end if;
    if not exists (
      select 1 from public.major_scoring_participants participant
      where participant.id = score_participant_id and participant.session_id = p_session_id
    ) then raise exception 'Participant does not belong to this scoring session'; end if;

    insert into public.major_hole_scores (session_id, participant_id, hole_number, strokes)
    values (p_session_id, score_participant_id, p_hole_number, score_value)
    on conflict (session_id, participant_id, hole_number)
    do update set strokes = excluded.strokes;
  end loop;

  update public.major_scoring_sessions set current_hole = p_hole_number where id = p_session_id;
end;
$function$;

revoke all on function public.save_major_hole_scores(uuid,integer,jsonb)
from public, anon, authenticated;

create or replace function public.clear_major_hole_score(
  p_session_id uuid,
  p_participant_id uuid,
  p_hole_number integer
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;
  delete from public.major_hole_scores
  where session_id = p_session_id
    and participant_id = p_participant_id
    and hole_number = p_hole_number;
end;
$function$;

revoke all on function public.clear_major_hole_score(uuid,uuid,integer)
from public, anon, authenticated;

create or replace function public.get_public_major_scoreboard(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', session.id,
      'label', session.label,
      'participant_count', session.participant_count,
      'current_hole', session.current_hole,
      'is_active', session.is_active,
      'updated_at', session.updated_at
    ),
    'event', jsonb_build_object(
      'id', event.id,
      'slug', event.slug,
      'name', event.name,
      'year', event.year,
      'scorecard_background_url', event.scorecard_background_url,
      'scorecard_accent_color', event.scorecard_accent_color,
      'scorecard_text_color', event.scorecard_text_color
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', participant.id,
        'position', participant.position,
        'player_id', participant.player_id,
        'player_screen_name_snapshot', participant.player_screen_name_snapshot
      ) order by participant.position)
      from public.major_scoring_participants participant
      where participant.session_id = session.id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'participant_id', score.participant_id,
        'hole_number', score.hole_number,
        'strokes', score.strokes
      ) order by score.hole_number, score.participant_id)
      from public.major_hole_scores score
      where score.session_id = session.id
    ), '[]'::jsonb)
  )
  from public.major_scoring_sessions session
  join public.major_events event on event.id = session.major_event_id
  where session.id = p_session_id
    and session.is_public
    and event.is_public;
$function$;

revoke all on function public.get_public_major_scoreboard(uuid)
from public, anon, authenticated;

grant execute on function public.create_major_scoring_session(uuid,text,uuid[]) to authenticated;
grant execute on function public.save_major_scorecard_theme(uuid,text,text,text) to authenticated;
grant execute on function public.update_major_scoring_session(uuid,text,integer,boolean,boolean) to authenticated;
grant execute on function public.save_major_hole_scores(uuid,integer,jsonb) to authenticated;
grant execute on function public.clear_major_hole_score(uuid,uuid,integer) to authenticated;
grant execute on function public.get_public_major_scoreboard(uuid) to anon, authenticated;
