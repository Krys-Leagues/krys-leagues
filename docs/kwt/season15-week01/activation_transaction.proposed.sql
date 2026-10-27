-- KWT Season 15 Week 01 activation proposal
-- Project: jfbndcwdsvsjgnzwvexp
-- Supersedes the earlier 10-player preparation; this is the 14-player source package.
-- Source SHA-256: 8C9A20EFB45B6399AD4F7DBCFB3633B8C63A6F9F5C6A7A5385069B1A8A0D8D7D
-- Preparation only. Execute only after separate owner authorization.
-- This transaction does not publish ratings or Handicaps.

begin;
select pg_advisory_xact_lock(hashtextextended('kwt-s15-w01-activation:8C9A20EFB45B6399AD4F7DBCFB3633B8C63A6F9F5C6A7A5385069B1A8A0D8D7D', 0));

do $activation$
declare
  v_constraint text;
  v_image_constraint text;
  v_season_id uuid;
  v_setup_label text := $label${"eventIdentifier":"KWTS15W01","courseName":"Raptor Cliffs","easyCourseCode":"RCE","hardCourseCode":"RCH","freezeCutoff":"2026-10-23T04:00:00Z","freezeTimezone":"America/New_York","officialDate":"2026-10-24","sourceSha256":"8C9A20EFB45B6399AD4F7DBCFB3633B8C63A6F9F5C6A7A5385069B1A8A0D8D7D"}$label$;
begin
  if to_regclass('public.seasons') is null or to_regclass('public.players') is null or to_regclass('public.kwt_public_content') is null or to_regclass('public.kwt_operational_results') is null or to_regclass('public.handicap_rating_snapshots') is null or to_regclass('public.handicap_review_decisions') is null or to_regclass('public.all_time_courses') is null then
    raise exception 'Required KWT activation tables are missing';
  end if;

  if not exists (select 1 from public.all_time_courses where code = 'RCE' and base_map = 'Raptor Cliff''s' and difficulty = 'Easy' and active)
     or not exists (select 1 from public.all_time_courses where code = 'RCH' and base_map = 'Raptor Cliff''s' and difficulty = 'Hard' and active) then
    raise exception 'Verified active Raptor Cliffs course pair RCE/RCH is missing or mismatched';
  end if;

  select pg_get_constraintdef(oid) into v_constraint from pg_constraint where conrelid = 'public.kwt_public_content'::regclass and conname = 'kwt_public_content_content_type_check';
  if v_constraint is null then raise exception 'Expected kwt_public_content content-type guard is missing'; end if;
  if position('weekly_feature' in v_constraint) = 0 or position('calendar_week' in v_constraint) = 0 then raise exception 'Unexpected kwt_public_content content-type guard: %', v_constraint; end if;
  if position('kwt_week_setup' in v_constraint) = 0 then
    alter table public.kwt_public_content drop constraint kwt_public_content_content_type_check;
    alter table public.kwt_public_content add constraint kwt_public_content_content_type_check check (content_type = any (array['weekly_feature'::text,'calendar_week'::text,'kwt_week_setup'::text]));
  end if;

  select pg_get_constraintdef(oid) into v_image_constraint from pg_constraint where conrelid = 'public.kwt_public_content'::regclass and conname = 'kwt_feature_image_required';
  if v_image_constraint is null or position('calendar_week' in lower(v_image_constraint)) = 0 or position('image_url is not null' in lower(v_image_constraint)) = 0 then
    raise exception 'Unexpected kwt_public_content image requirement: %', v_image_constraint;
  end if;
  if position('kwt_week_setup' in lower(v_image_constraint)) = 0 then
    alter table public.kwt_public_content drop constraint kwt_feature_image_required;
    alter table public.kwt_public_content add constraint kwt_feature_image_required check ((content_type = any (array['calendar_week'::text,'kwt_week_setup'::text])) or image_url is not null);
  end if;

  if (select count(*) from public.handicap_rating_snapshots where id = 'b470397b-b07a-5bb4-8575-b83804d7df34'::uuid and course_id = 'Raptor Cliff''s_easy' and difficulty = 'easy' and course_rating = -22.211 and slope = 9.053 and review_scope = 'KWT_ONLY' and publication_status = 'UNPUBLISHED' and model_version = 'krys-course-rating-elite-lowest-12-v1') <> 1
     or (select count(*) from public.handicap_rating_snapshots where id = '0f19e813-655f-521f-bf29-1397ec14ccb1'::uuid and course_id = 'Raptor Cliff''s_hard' and difficulty = 'hard' and course_rating = -13.895 and slope = 12.197 and review_scope = 'KWT_ONLY' and publication_status = 'UNPUBLISHED' and model_version = 'krys-course-rating-elite-lowest-12-v1') <> 1 then
    raise exception 'Approved KWT-only Raptor Cliffs rating references do not match exactly';
  end if;
  if not exists (select 1 from public.handicap_review_decisions where subject_key = 'b470397b-b07a-5bb4-8575-b83804d7df34' and decision = 'ACCEPT') or not exists (select 1 from public.handicap_review_decisions where subject_key = '0f19e813-655f-521f-bf29-1397ec14ccb1' and decision = 'ACCEPT') then
    raise exception 'Both Raptor Cliffs rating references require ACCEPT review evidence';
  end if;

  if exists (select 1 from public.kwt_public_content where content_type = 'kwt_week_setup' and season_number = 15 and week_number = 1 and active and label <> v_setup_label) then raise exception 'Conflicting active KWTS15W01 Week Setup already exists'; end if;
  if exists (select 1 from public.kwt_public_content where content_type = 'kwt_week_setup' and season_number = 15 and week_number = 1 and active and label = v_setup_label and (start_date is distinct from date '2026-10-24' or end_date is distinct from date '2026-10-24')) then raise exception 'Existing KWTS15W01 Week Setup has conflicting verified dates'; end if;
  if exists (select 1 from public.kwt_operational_results where season_number = 15 and week_number = 1) then raise exception 'KWTS15W01 operational results already exist; review for idempotency instead of inserting'; end if;

  select id into v_season_id from public.seasons where league_type = 'kwt' and season_number = 15;
  if v_season_id is null then
    insert into public.seasons (league_type, season_number, start_date, end_date, is_locked, is_active, division, game1_course, game2_course, game3_course)
    values ('kwt', 15, '2026-10-24', '2026-10-24', false, true, null, 'RCE', 'RCH', null)
    returning id into v_season_id;
  else
    if exists (select 1 from public.seasons where id = v_season_id and (start_date is distinct from date '2026-10-24' or end_date is distinct from date '2026-10-24' or game1_course is distinct from 'RCE' or game2_course is distinct from 'RCH')) then raise exception 'Existing KWT Season 15 anchor has conflicting verified metadata'; end if;
  end if;

  if not exists (select 1 from public.kwt_public_content where content_type = 'kwt_week_setup' and season_number = 15 and week_number = 1 and active and label = v_setup_label) then
    insert into public.kwt_public_content (content_type, season_number, week_number, start_date, end_date, display_order, image_url, label, active)
    values ('kwt_week_setup', 15, 1, '2026-10-24', '2026-10-24', 1, null, v_setup_label, true);
  end if;

  insert into public.kwt_operational_results (season_id, season_number, week_number, player_id, division, easy_course_code, hard_course_code, easy_score, hard_score, total_score, overall_placement, division_placement, points, status, source_type, source_reference)
  values
    (v_season_id,15,1,'2e4ce1d8-afd6-44a2-9560-f85c16f23747','Elite','RCE','RCH',-24,-21,-45,1,1,25,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=2'),
    (v_season_id,15,1,'a0eaf23c-0784-4eb9-ab1d-530b077121a9','Pro','RCE','RCH',-19,-14,-33,2,1,21,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=3'),
    (v_season_id,15,1,'69c0daa5-70b8-481b-94e5-a9d033bc75fb','Elite','RCE','RCH',-19,-6,-25,3,2,18,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=4'),
    (v_season_id,15,1,'d38c0220-8a80-45a6-86e8-d495f523d5ab','Pro','RCE','RCH',-20,-3,-23,4,2,16,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=5'),
    (v_season_id,15,1,'fbd60e4a-9d17-4556-9062-dc005a0c5723','Pro','RCE','RCH',-18,-5,-23,4,2,16,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=6'),
    (v_season_id,15,1,'6918df0a-cc2b-495a-8c09-b8be600ed0bc','Pro','RCE','RCH',-17,-6,-23,4,2,16,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=7'),
    (v_season_id,15,1,'6d74f565-dc1d-41e3-81e5-fd7e6b38e28d','Pro','RCE','RCH',-9,-3,-12,8,5,12,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=9'),
    (v_season_id,15,1,'ebcdd3f4-1a69-40f6-819e-899fbe9998d7','Semi Pro','RCE','RCH',-14,-2,-16,7,1,13,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=8'),
    (v_season_id,15,1,'b98df6d3-7e16-450f-bd17-f39d9903d1e1','Semi Pro','RCE','RCH',-12,1,-11,9,2,11,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=10'),
    (v_season_id,15,1,'c60ed0d8-1f05-4675-b635-342707607c18','Semi Pro','RCE','RCH',-13,3,-10,10,3,10,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=11'),
    (v_season_id,15,1,'e2741a95-19e9-440c-a605-f1c1498aa5c1','Amateur','RCE','RCH',-8,10,2,12,2,8,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=13'),
    (v_season_id,15,1,'e249815d-ac23-4ef7-9c20-7ed9ba0c57c4','Amateur','RCE','RCH',-6,8,2,12,2,8,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=14'),
    (v_season_id,15,1,'ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0','Semi Pro','RCE','RCH',-6,12,6,14,4,6,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=15'),
    (v_season_id,15,1,'bed410dd-2b89-4db3-8fe4-8226c21c3f5f','Amateur','RCE','RCH',-11,6,-5,11,1,9,'official','existing_kwt_website','KWTS15W01|8c9a20efb45b6399ad4f7dbcfb3633b8c63a6f9f5c6a7a5385069b1a8a0d8d7d|row=12');
  if (select count(*) from public.kwt_operational_results where season_number = 15 and week_number = 1) <> 14
     or (select count(distinct player_id) from public.kwt_operational_results where season_number = 15 and week_number = 1) <> 14
     or (select count(*) from public.kwt_operational_results where season_number = 15 and week_number = 1 and status = 'official' and source_type = 'existing_kwt_website') <> 14 then
    raise exception 'KWTS15W01 14-player package cardinality or source guard failed';
  end if;
end;
$activation$;
commit;
