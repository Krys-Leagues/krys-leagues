-- Install after solo_results_foundation.sql, solo_result_management.sql,
-- solo_week_setup.sql, and solo_week_close.sql. Preserves all existing data.
begin;

alter table public.solo_weeks add column if not exists course_code text;
alter table public.solo_week_snapshots add column if not exists course_code text;
alter table public.solo_week_snapshot_entries add column if not exists course_code text;
alter table public.solo_score_attempts alter column stroke_score drop not null;

create or replace function public.solo_snapshot_course_code() returns trigger language plpgsql security definer set search_path to '' as $function$
begin select course_code into new.course_code from public.solo_weeks where id=new.week_id;return new;end;$function$;
drop trigger if exists solo_snapshot_course_code_trigger on public.solo_week_snapshots;
create trigger solo_snapshot_course_code_trigger before insert on public.solo_week_snapshots for each row execute function public.solo_snapshot_course_code();
create or replace function public.solo_snapshot_entry_course_code() returns trigger language plpgsql security definer set search_path to '' as $function$
begin select course_code into new.course_code from public.solo_weeks where id=new.week_id;return new;end;$function$;
drop trigger if exists solo_snapshot_entry_course_code_trigger on public.solo_week_snapshot_entries;
create trigger solo_snapshot_entry_course_code_trigger before insert on public.solo_week_snapshot_entries for each row execute function public.solo_snapshot_entry_course_code();

alter table public.solo_score_attempts drop constraint if exists solo_score_attempts_hn1_count_check;
alter table public.solo_score_attempts add constraint solo_score_attempts_hn1_count_check check (hn1_count >= 0);

create or replace view public.solo_live_best_attempts as
select id,season_id,week_id,player_id,difficulty,stroke_score,hn1_count,entered_at
from (select a.*,row_number() over(partition by a.week_id,a.player_id,a.difficulty order by a.stroke_score,a.hn1_count desc,a.entered_at,a.id) selection_order
from public.solo_score_attempts a where a.stroke_score is not null) ranked where selection_order=1;

create or replace function public.save_solo_card(p_attempt_id uuid,p_season_id uuid,p_week_id uuid,p_player_id uuid,p_difficulty text,p_stroke_score integer,p_hn1_count integer)
returns public.solo_score_attempts language plpgsql security definer set search_path to '' as $function$
declare v_week public.solo_weeks%rowtype;v_result public.solo_score_attempts%rowtype;
begin
 if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501';end if;
 if lower(p_difficulty) not in ('easy','hard') or p_hn1_count is null or p_hn1_count<0 then raise exception 'Difficulty and non-negative HN1 are required';end if;
 select * into v_week from public.solo_weeks where id=p_week_id and season_id=p_season_id for update;
 if not found or v_week.status<>'open' then raise exception 'Exact current Solo week was not found';end if;
 if p_week_id<>(select id from public.solo_weeks where season_id=p_season_id and status='open' order by week_number limit 1) then raise exception 'Future Solo weeks are coming soon';end if;
 if not exists(select 1 from public.solo_roster_entries e join public.solo_roster_versions r on r.id=e.roster_version_id where e.season_id=p_season_id and e.player_id=p_player_id and r.status='approved') then raise exception 'Player is not on the approved Solo roster';end if;
 if p_attempt_id is null then insert into public.solo_score_attempts(season_id,week_id,player_id,difficulty,stroke_score,hn1_count,entered_by) values(p_season_id,p_week_id,p_player_id,lower(p_difficulty),p_stroke_score,p_hn1_count,auth.uid()) returning * into v_result;
 else update public.solo_score_attempts set stroke_score=p_stroke_score,hn1_count=p_hn1_count,updated_by=auth.uid(),updated_at=now() where id=p_attempt_id and season_id=p_season_id and week_id=p_week_id and player_id=p_player_id returning * into v_result;if not found then raise exception 'Solo card not found';end if;end if;
 return v_result;
end;$function$;
revoke all on function public.save_solo_card(uuid,uuid,uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.save_solo_card(uuid,uuid,uuid,uuid,text,integer,integer) to authenticated;

create or replace function public.update_solo_week(p_season_id uuid,p_week_number integer,p_course_name text,p_course_code text,p_due_date date)
returns public.solo_weeks language plpgsql security definer set search_path to '' as $function$
declare v_week public.solo_weeks%rowtype;
begin
 if auth.uid() is null or not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required' using errcode='42501';end if;
 select * into v_week from public.solo_weeks where season_id=p_season_id and week_number=p_week_number for update;
 if not found or v_week.status<>'open' then raise exception 'Exact open Solo week was not found';end if;
 update public.solo_weeks set course_name=nullif(btrim(p_course_name),''),course_code=nullif(btrim(p_course_code),''),due_date=p_due_date where id=v_week.id returning * into v_week;return v_week;
end;$function$;
revoke all on function public.update_solo_week(uuid,integer,text,text,date) from public,anon,authenticated;
grant execute on function public.update_solo_week(uuid,integer,text,text,date) to authenticated;

create table if not exists public.solo_trophies(
 id uuid primary key default gen_random_uuid(),season_id uuid not null references public.seasons(id) on delete restrict,division text not null,player_id uuid references public.players(id) on delete restrict,winner_screen_name text not null,trophy_image_path text,created_at timestamptz not null default now(),finalized_at timestamptz,created_by uuid references auth.users(id) on delete restrict,unique(season_id,division)
);
alter table public.solo_trophies enable row level security;

-- Sanitized public document: frozen names for closed weeks, live approved-roster names
-- only for the current open week; no UUIDs or audit/auth fields are returned.
create or replace function public.get_public_solo() returns jsonb language sql stable security definer set search_path to '' as $function$
with seasons as(select id,season_number from public.seasons where lower(btrim(league_type))='solo'),
weeks as(select w.id,w.season_id,w.week_number,w.course_name,w.course_code,w.status from public.solo_weeks w join seasons s on s.id=w.season_id),
current_open as(select distinct on(season_id) * from weeks where status='open' order by season_id,week_number),
closed_rows as(select s.season_number,e.week_number,e.division,e.player_screen_name,e.easy_stroke_score,e.easy_hn1_count,e.hard_stroke_score,e.hard_hn1_count,e.most_hn1_easy,e.most_hn1_hard from public.solo_week_snapshot_entries e join public.solo_week_snapshots sn on sn.id=e.snapshot_id and sn.is_current join seasons s on s.id=e.season_id),
live_rows as(select s.season_number,w.week_number,e.division,e.player_screen_name,eb.stroke_score easy_stroke_score,eb.hn1_count easy_hn1_count,hb.stroke_score hard_stroke_score,hb.hn1_count hard_hn1_count,er.most_hn1 most_hn1_easy,hr.most_hn1 most_hn1_hard from current_open w join seasons s on s.id=w.season_id join public.solo_roster_versions rv on rv.season_id=w.season_id and rv.status='approved' join public.solo_roster_entries e on e.roster_version_id=rv.id left join public.solo_live_best_attempts eb on eb.week_id=w.id and eb.player_id=e.player_id and eb.difficulty='easy' left join public.solo_live_best_attempts hb on hb.week_id=w.id and hb.player_id=e.player_id and hb.difficulty='hard' left join public.solo_live_hn1_recognition er on er.week_id=w.id and er.player_id=e.player_id and er.difficulty='easy' left join public.solo_live_hn1_recognition hr on hr.week_id=w.id and hr.player_id=e.player_id and hr.difficulty='hard'),
all_rows as(select * from closed_rows union all select * from live_rows)
select jsonb_build_object('seasons',(select coalesce(jsonb_agg(to_jsonb(s) order by season_number desc),'[]') from seasons s),'weeks',(select coalesce(jsonb_agg((to_jsonb(w)-'id'-'season_id')||jsonb_build_object('season_number',s.season_number) order by s.season_number desc,w.week_number),'[]') from weeks w join seasons s on s.id=w.season_id),'rows',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from all_rows r),'trophies',(select coalesce(jsonb_agg(jsonb_build_object('season_number',s.season_number,'division',t.division,'winner_screen_name',t.winner_screen_name,'trophy_image_path',t.trophy_image_path)),'[]') from public.solo_trophies t join seasons s on s.id=t.season_id));
$function$;
revoke all on function public.get_public_solo() from public,authenticated;
grant execute on function public.get_public_solo() to anon,authenticated;
revoke all on public.solo_trophies from anon,authenticated;
grant select on public.solo_trophies to authenticated;
commit;
