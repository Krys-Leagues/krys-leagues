-- READ-ONLY inspection for a failed or partial major_live_scoring.sql install.
-- This file contains catalog SELECTs only. It does not create, alter, insert,
-- update, delete, grant, revoke, execute an application RPC, or mutate anything.

with object_state as (
  select
    to_regclass('public.major_scoring_sessions') as sessions_oid,
    to_regclass('public.major_scoring_participants') as participants_oid,
    to_regclass('public.major_hole_scores') as scores_oid,
    to_regprocedure('public.create_major_scoring_session(uuid,text,uuid[])') as create_session_oid,
    to_regprocedure('public.save_major_scorecard_theme(uuid,text,text,text)') as save_theme_oid,
    to_regprocedure('public.update_major_scoring_session(uuid,text,integer,boolean,boolean)') as update_session_oid,
    to_regprocedure('public.save_major_hole_scores(uuid,integer,jsonb)') as save_scores_oid,
    to_regprocedure('public.clear_major_hole_score(uuid,uuid,integer)') as clear_score_oid,
    to_regprocedure('public.get_public_major_scoreboard(uuid)') as public_scoreboard_oid
),
checks as (
  select
    10 as display_order,
    'public.major_scoring_sessions table'::text as object_name,
    sessions_oid is not null as installed,
    'Persistent Major broadcast/scoring session state.'::text as explanation
  from object_state

  union all
  select
    20,
    'public.major_scoring_participants table',
    participants_oid is not null,
    'Canonical player UUIDs and exact display-name snapshots.'
  from object_state

  union all
  select
    30,
    'public.major_hole_scores table',
    scores_oid is not null,
    'Persistent hole-by-hole scoring values.'
  from object_state

  union all
  select
    40,
    'major_events.scorecard_background_url column',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'major_events'
        and column_name = 'scorecard_background_url'
        and data_type = 'text'
    ),
    'Stores the locked Major scorecard artwork path or HTTPS URL.'

  union all
  select
    50,
    'major_events.scorecard_accent_color column',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'major_events'
        and column_name = 'scorecard_accent_color'
        and data_type = 'text'
    ),
    'Stores the Major broadcast accent color.'

  union all
  select
    60,
    'major_events.scorecard_text_color column',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'major_events'
        and column_name = 'scorecard_text_color'
        and data_type = 'text'
    ),
    'Stores the Major broadcast text color.'

  union all
  select
    70,
    'Admin SELECT policy on scoring sessions',
    exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = sessions_oid
        and policy.polname = 'Site admins can read Major scoring sessions'
        and policy.polcmd = 'r'
        and (select oid from pg_catalog.pg_roles where rolname = 'authenticated') = any(policy.polroles)
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          like '%is_current_user_site_admin%'
    ),
    'Expected authenticated site-admin-only read policy.'
  from object_state

  union all
  select
    80,
    'Admin SELECT policy on scoring participants',
    exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = participants_oid
        and policy.polname = 'Site admins can read Major scoring participants'
        and policy.polcmd = 'r'
        and (select oid from pg_catalog.pg_roles where rolname = 'authenticated') = any(policy.polroles)
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          like '%is_current_user_site_admin%'
    ),
    'Expected authenticated site-admin-only read policy.'
  from object_state

  union all
  select
    90,
    'Admin SELECT policy on hole scores',
    exists (
      select 1
      from pg_catalog.pg_policy as policy
      where policy.polrelid = scores_oid
        and policy.polname = 'Site admins can read Major hole scores'
        and policy.polcmd = 'r'
        and (select oid from pg_catalog.pg_roles where rolname = 'authenticated') = any(policy.polroles)
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
          like '%is_current_user_site_admin%'
    ),
    'Expected authenticated site-admin-only read policy.'
  from object_state

  union all
  select
    100,
    'RLS enabled on all three scoring tables',
    coalesce((select relrowsecurity from pg_catalog.pg_class where oid = sessions_oid), false)
      and coalesce((select relrowsecurity from pg_catalog.pg_class where oid = participants_oid), false)
      and coalesce((select relrowsecurity from pg_catalog.pg_class where oid = scores_oid), false),
    'All live-scoring tables must enforce Row Level Security.'
  from object_state

  union all
  select 110, 'public.create_major_scoring_session(uuid,text,uuid[])',
    create_session_oid is not null, 'Protected admin session-creation RPC.'
  from object_state

  union all
  select 120, 'public.save_major_scorecard_theme(uuid,text,text,text)',
    save_theme_oid is not null, 'Protected admin theme-configuration RPC.'
  from object_state

  union all
  select 130, 'public.update_major_scoring_session(uuid,text,integer,boolean,boolean)',
    update_session_oid is not null, 'Protected admin session-state RPC.'
  from object_state

  union all
  select 140, 'public.save_major_hole_scores(uuid,integer,jsonb)',
    save_scores_oid is not null, 'Protected admin scoring RPC.'
  from object_state

  union all
  select 150, 'public.clear_major_hole_score(uuid,uuid,integer)',
    clear_score_oid is not null, 'Protected admin score-correction RPC.'
  from object_state

  union all
  select 160, 'public.get_public_major_scoreboard(uuid)',
    public_scoreboard_oid is not null, 'Restricted read-only published-scoreboard RPC.'
  from object_state
),
overall as (
  select
    count(*) filter (where installed) as installed_count,
    count(*) as expected_count
  from checks
),
report as (
  select
    0 as display_order,
    case
      when installed_count = 0 then 'NOT INSTALLED'
      when installed_count = expected_count then 'COMPLETE'
      else 'PARTIAL'
    end as status,
    'OVERALL LIVE-SCORING INSTALLATION'::text as object_name,
    format('%s of %s required checks passed.', installed_count, expected_count) as explanation
  from overall

  union all
  select
    display_order,
    case when installed then 'OK' else 'MISSING' end,
    object_name,
    explanation
  from checks
)
select status, object_name, explanation
from report
order by display_order;
