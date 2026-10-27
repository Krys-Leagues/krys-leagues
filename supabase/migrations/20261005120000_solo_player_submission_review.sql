begin;

-- Additive Solo player-submission layer. Existing numeric attempts and frozen
-- snapshots remain unchanged and continue to represent legacy/admin history.
create table if not exists public.solo_submissions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  week_id uuid not null references public.solo_weeks(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  difficulty text not null check (difficulty in ('easy','hard')),
  submission_intent text not null check (submission_intent in ('score','ace')),
  stroke_score integer,
  hn1_count integer not null check (hn1_count >= 0),
  evidence_storage_path text not null,
  original_filename text not null,
  content_type text not null,
  evidence_sha256 text not null,
  status text not null default 'provisional' check (status in ('provisional','superseded_for_score','superseded_for_hn1','verified','rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  rejection_reason text
);

create index if not exists solo_submissions_context_idx
  on public.solo_submissions(week_id, player_id, difficulty, status, submitted_at desc);
create index if not exists solo_submissions_evidence_hash_idx
  on public.solo_submissions(player_id, week_id, evidence_sha256);

alter table public.solo_submissions enable row level security;
alter table public.solo_submissions force row level security;
revoke all on public.solo_submissions from public, anon, authenticated;

-- Server routes use the service role after independently resolving the session
-- identity and admin authorization. No client can read evidence or submissions.

create or replace view public.solo_live_submission_attempts as
select id, season_id, week_id, player_id, difficulty, stroke_score, hn1_count,
       submitted_at as entered_at, status, id as source_submission_id
from public.solo_submissions
where status in ('provisional','verified') and stroke_score is not null;

create or replace view public.solo_live_best_attempts_v2 as
select id, season_id, week_id, player_id, difficulty, stroke_score, hn1_count,
       entered_at, status, source_submission_id
from (
  select a.id, a.season_id, a.week_id, a.player_id, a.difficulty,
         a.stroke_score, a.hn1_count, a.entered_at,
         'verified'::text as status, null::uuid as source_submission_id
  from public.solo_score_attempts a
  where a.stroke_score is not null
  union all
  select s.id, s.season_id, s.week_id, s.player_id, s.difficulty,
         s.stroke_score, s.hn1_count, s.entered_at, s.status,
         s.source_submission_id
  from public.solo_live_submission_attempts s
) candidates
where not exists (
  select 1 from (
    select a2.stroke_score, a2.hn1_count, a2.entered_at
    from public.solo_score_attempts a2
    where a2.week_id=candidates.week_id and a2.player_id=candidates.player_id
      and a2.difficulty=candidates.difficulty and a2.stroke_score is not null
    union all
    select s2.stroke_score, s2.hn1_count, s2.entered_at
    from public.solo_live_submission_attempts s2
    where s2.week_id=candidates.week_id and s2.player_id=candidates.player_id
      and s2.difficulty=candidates.difficulty
  ) better
  where better.stroke_score < candidates.stroke_score
     or (better.stroke_score = candidates.stroke_score and better.hn1_count > candidates.hn1_count)
     or (better.stroke_score = candidates.stroke_score and better.hn1_count = candidates.hn1_count and better.entered_at < candidates.entered_at)
);

create or replace view public.solo_live_hn1_recognition_v2 as
select distinct on (candidate.season_id,candidate.week_id,candidate.player_id,candidate.difficulty)
  candidate.season_id, candidate.week_id, candidate.player_id,
  candidate.difficulty, candidate.hn1_count as most_hn1,
  candidate.status, candidate.source_submission_id
from (
  select a.season_id,a.week_id,a.player_id,a.difficulty,a.hn1_count,
         a.entered_at,'verified'::text as status,null::uuid as source_submission_id
  from public.solo_score_attempts a
  union all
  select s.season_id,s.week_id,s.player_id,s.difficulty,s.hn1_count,
         s.entered_at,s.status,s.source_submission_id
  from public.solo_live_submission_attempts s
) candidate
order by candidate.season_id,candidate.week_id,candidate.player_id,candidate.difficulty,
         candidate.hn1_count desc,candidate.entered_at,candidate.source_submission_id;

create or replace function public.get_my_solo_submission_context()
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_player_id uuid; v_week public.solo_weeks%rowtype; v_season public.seasons%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select p.id into v_player_id from public.players p
  where p.discord_id = coalesce((select raw_user_meta_data->>'provider_id' from auth.users where id=auth.uid()), (select raw_user_meta_data->>'sub' from auth.users where id=auth.uid()))
  limit 1;
  if v_player_id is null then return jsonb_build_object('authorized',false,'reason','canonical_identity_unavailable'); end if;
  select s.* into v_season from public.seasons s where lower(btrim(s.league_type))='solo' and s.is_active order by s.season_number desc limit 1;
  if v_season.id is null then return jsonb_build_object('authorized',false,'reason','no_active_season'); end if;
  if not exists (select 1 from public.solo_roster_entries e join public.solo_roster_versions r on r.id=e.roster_version_id where e.season_id=v_season.id and e.player_id=v_player_id and r.status in ('approved','locked')) then
    return jsonb_build_object('authorized',false,'reason','not_rostered');
  end if;
  select w.* into v_week from public.solo_weeks w where w.season_id=v_season.id and w.status='open' order by case when w.due_date is not null and w.due_date <= current_date then 0 else 1 end, case when w.due_date is not null and w.due_date <= current_date then w.week_number end desc, w.week_number limit 1;
  return jsonb_build_object('authorized',true,'player_id',v_player_id,'screen_name',(select p.screen_name from public.players p where p.id=v_player_id),'season_id',v_season.id,'season_number',v_season.season_number,'week_id',v_week.id,'week_number',v_week.week_number,'course_name',v_week.course_name,'course_code',v_week.course_code,'due_date',v_week.due_date);
end;
$function$;

revoke all on function public.get_my_solo_submission_context() from public,anon,authenticated;
grant execute on function public.get_my_solo_submission_context() to authenticated;

-- Finalization is blocked when a selected score or HN1 leader is provisional.
create or replace function public.solo_assert_week_finalizable(p_week_id uuid)
returns void language plpgsql security definer set search_path to '' as $function$
declare v_name text; v_difficulty text;
begin
  select e.player_screen_name, b.difficulty into v_name, v_difficulty
  from public.solo_roster_entries e
  join public.solo_roster_versions r on r.id=e.roster_version_id and r.status='approved'
  join public.solo_live_best_attempts_v2 b on b.week_id=p_week_id and b.player_id=e.player_id
  where b.status='provisional' limit 1;
  if v_name is not null then raise exception 'WEEK CANNOT BE FINALIZED: % % result still requires verification.', v_name, upper(v_difficulty); end if;
  select e.player_screen_name, h.difficulty into v_name, v_difficulty
  from public.solo_roster_entries e
  join public.solo_roster_versions r on r.id=e.roster_version_id and r.status='approved'
  join public.solo_live_hn1_recognition_v2 h on h.week_id=p_week_id and h.player_id=e.player_id
  where h.status='provisional' limit 1;
  if v_name is not null then raise exception 'WEEK CANNOT BE FINALIZED: % % HN1 result still requires verification.', v_name, upper(v_difficulty); end if;
end;
$function$;

revoke all on function public.solo_assert_week_finalizable(uuid) from public,anon,authenticated;
grant execute on function public.solo_assert_week_finalizable(uuid) to authenticated;

create or replace function public.solo_finalization_guard_trigger()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if old.status='open' and new.status='closed' then perform public.solo_assert_week_finalizable(old.id); end if;
  return new;
end;
$function$;

drop trigger if exists solo_finalization_guard on public.solo_weeks;
create trigger solo_finalization_guard before update of status on public.solo_weeks for each row execute function public.solo_finalization_guard_trigger();

create or replace function public.review_solo_submission(p_submission_id uuid, p_decision text, p_reason text default null)
returns public.solo_submissions language plpgsql security definer set search_path to '' as $function$
declare v_row public.solo_submissions%rowtype;
begin
  if auth.uid() is null or not public.can_current_user_admin_solo() then raise exception 'Solo administrator authorization is required' using errcode='42501'; end if;
  if p_decision not in ('verified','rejected') then raise exception 'Solo review decision is invalid'; end if;
  select * into v_row from public.solo_submissions where id=p_submission_id for update;
  if not found then raise exception 'Solo submission was not found'; end if;
  if v_row.status not in ('provisional','superseded_for_score','superseded_for_hn1') then raise exception 'Solo submission is already resolved'; end if;
  update public.solo_submissions set status=p_decision, reviewed_at=now(), reviewed_by=auth.uid(), rejection_reason=case when p_decision='rejected' then nullif(btrim(p_reason),'') else null end where id=p_submission_id returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.review_solo_submission(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_solo_submission(uuid,text,text) to authenticated;

create or replace function public.get_public_solo_live_v2() returns jsonb language sql stable security definer set search_path to '' as $function$
with seasons as (
  select id,season_number from public.seasons where lower(btrim(league_type))='solo'
), weeks as (
  select w.id,w.season_id,w.week_number,w.course_name,w.course_code,w.status,w.due_date from public.solo_weeks w join seasons s on s.id=w.season_id
), current_open as (
  select distinct on (season_id) * from weeks where status='open'
  order by season_id,case when due_date is null or due_date > current_date then 0 else 1 end,case when due_date is null or due_date > current_date then week_number end asc nulls last,week_number desc
), closed_rows as (
  select s.season_number,e.week_number,e.division,e.player_screen_name,e.easy_stroke_score,e.easy_hn1_count,e.hard_stroke_score,e.hard_hn1_count,e.most_hn1_easy,e.most_hn1_hard,'verified'::text easy_status,'verified'::text hard_status,'verified'::text easy_hn1_status,'verified'::text hard_hn1_status
  from public.solo_week_snapshot_entries e join public.solo_week_snapshots sn on sn.id=e.snapshot_id and sn.is_current join seasons s on s.id=e.season_id
), live_rows as (
  select s.season_number,w.week_number,e.division,e.player_screen_name,eb.stroke_score easy_stroke_score,eb.hn1_count easy_hn1_count,hb.stroke_score hard_stroke_score,hb.hn1_count hard_hn1_count,er.most_hn1 most_hn1_easy,hr.most_hn1 most_hn1_hard,coalesce(eb.status,'verified') easy_status,coalesce(hb.status,'verified') hard_status,coalesce(er.status,'verified') easy_hn1_status,coalesce(hr.status,'verified') hard_hn1_status
  from current_open w join seasons s on s.id=w.season_id join public.solo_roster_versions rv on rv.season_id=w.season_id and rv.status='approved' join public.solo_roster_entries e on e.roster_version_id=rv.id left join public.solo_live_best_attempts_v2 eb on eb.week_id=w.id and eb.player_id=e.player_id and eb.difficulty='easy' left join public.solo_live_best_attempts_v2 hb on hb.week_id=w.id and hb.player_id=e.player_id and hb.difficulty='hard' left join public.solo_live_hn1_recognition_v2 er on er.week_id=w.id and er.player_id=e.player_id and er.difficulty='easy' left join public.solo_live_hn1_recognition_v2 hr on hr.week_id=w.id and hr.player_id=e.player_id and hr.difficulty='hard'
), all_rows as (select * from closed_rows union all select * from live_rows)
select jsonb_build_object('seasons',(select coalesce(jsonb_agg(to_jsonb(s) order by season_number desc),'[]') from seasons s),'weeks',(select coalesce(jsonb_agg((to_jsonb(w)-'id'-'season_id')||jsonb_build_object('season_number',s.season_number) order by s.season_number desc,w.week_number),'[]') from weeks w join seasons s on s.id=w.season_id),'rows',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from all_rows r),'trophies',(select coalesce(jsonb_agg(jsonb_build_object('season_number',s.season_number,'division',t.division,'winner_screen_name',t.winner_screen_name,'trophy_image_path',t.trophy_image_path)),'[]') from public.solo_trophies t join seasons s on s.id=t.season_id));
$function$;

revoke all on function public.get_public_solo_live_v2() from public,authenticated;
grant execute on function public.get_public_solo_live_v2() to anon,authenticated;

commit;
