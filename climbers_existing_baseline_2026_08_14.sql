-- Existing Climbers baseline from:
--   All Time Leaderboard To 14th Aug 2026 Dawn (1).xlsm / Climbers
--
-- READ BEFORE RUNNING:
--   1. Install all_time_normal_entry_climbers.sql first.
--   2. Review identity_status in climbers_legacy_baseline_source_rows.
--   3. Do not apply until every source name is safely linked through the
--      existing Global Player identity system.
--   4. This file is not executed by the application and has not been run here.

begin;

do $$
begin
  if to_regclass('public.climbers_events') is null
     or to_regclass('public.climbers_year_to_date') is null then
    raise exception 'Install all_time_normal_entry_climbers.sql before the Climbers baseline migration';
  end if;
end;
$$;

create table if not exists public.climbers_legacy_baseline_imports (
  import_key text primary key,
  source_workbook text not null,
  cutoff_at timestamptz not null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete restrict
);

insert into public.climbers_legacy_baseline_imports(import_key,source_workbook,cutoff_at)
values (
  'all_time_leaderboard_2026_08_14',
  'All Time Leaderboard To 14th Aug 2026 Dawn (1).xlsm / Climbers',
  '2026-08-15 00:00:00+00'
)
on conflict (import_key) do update
set source_workbook = excluded.source_workbook,
    cutoff_at = excluded.cutoff_at
where public.climbers_legacy_baseline_imports.applied_at is null;

create table if not exists public.climbers_legacy_baseline_source_rows (
  id uuid primary key default gen_random_uuid(),
  import_key text not null references public.climbers_legacy_baseline_imports(import_key) on delete restrict,
  source_name text not null,
  ytd_points integer,
  period_points integer,
  canonical_player_id uuid references public.players(id) on delete restrict,
  identity_status text not null default 'review_required'
    check (identity_status in ('resolved','review_required')),
  identity_review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  check (ytd_points is not null or period_points is not null),
  check (coalesce(ytd_points,0) >= 0 and coalesce(period_points,0) >= 0),
  unique(import_key,source_name)
);

create index if not exists climbers_legacy_source_identity_idx
  on public.climbers_legacy_baseline_source_rows(import_key,identity_status,source_name);

-- One row per distinct workbook name. Ranks are deliberately not used as
-- arithmetic inputs; the point columns are the authoritative values.
with source_rows(source_name,ytd_points,period_points) as (
  values
    ('THE REAL JB',1876,62),
    ('ZOEDARLIN',1868,null),
    ('LAURENT',863,null),
    ('PRINCESS SPICY',818,16),
    ('MAMMOTHREPT',730,null),
    ('PLUCKY',636,14),
    ('GOMARINO13',412,54),
    ('TRICKYDICKY',389,null),
    ('CATWEAZEL',318,47),
    ('LARRYR',317,null),
    ('SERENITYMOON',315,null),
    ('YANKEEDUDE08',300,null),
    ('INDIANCHIEF',266,20),
    ('GUYB',237,null),
    ('KD0017',234,53),
    ('CHELLE',229,null),
    ('ZANETTI',216,7),
    ('KEIRAROBERT',213,32),
    ('GOBSON',210,null),
    ('BADWOLFF',199,null),
    ('ROKNHORSEBRAT',199,null),
    ('MAXIMUS',191,96),
    ('LEANIN2IT',190,54),
    ('KNOCKOUTG',186,null),
    ('ALYSSA38',179,null),
    ('SLABDADDY',169,14),
    ('CHIPNPUTT',169,52),
    ('EL JORGE',163,null),
    ('PAULV-PPP',161,null),
    ('PEACH',156,null),
    ('D3BB13',137,null),
    ('INDY',133,null),
    ('DAISYSHAW',118,null),
    ('UROPA',118,null),
    ('DUCKK',116,2),
    ('AWESOME KRIS',115,null),
    ('BIGJA',109,null),
    ('NUTTY GRANDPA',106,null),
    ('NEO IMPOSSIBLE',105,null),
    ('DMD-ENDITNOW',83,null),
    ('SLUGJUG33',82,null),
    ('JENNEM',76,null),
    ('DABIGWILLO',74,null),
    ('METUM',73,null),
    ('L7JAZZ',69,null),
    ('DREW 0706',69,null),
    ('DEEBEE',68,3),
    ('SANDTRAP24',67,null),
    ('KILL ER BEE',66,null),
    ('GOLFSHARK',66,null),
    ('ULTRAFOX LYNNE',62,null),
    ('EARTHLING',61,null),
    ('LYNNIEBODD',60,64),
    ('MASTER KP',58,null),
    ('STICKY80',54,null),
    ('DJ TWIGG',53,null),
    ('STONEYMAN69',52,null),
    ('XEROFORMGIRL',51,null),
    ('GRIPRIP',50,null),
    ('MUSICAL ATV',48,null),
    ('PRINCESS BANKSHOT',45,null),
    ('MULLIGAN',42,null),
    ('FRY LOCK',39,null),
    ('SHOOTER MCGAVIN',38,null),
    ('WYNDEMERE',38,null),
    ('BUBBAFRAME',36,null),
    ('WICKEDSHACK',31,null),
    ('CAPTAIN',30,null),
    ('MATT916',24,null),
    ('SLAPPY',23,9),
    ('AWSOME KRIS',22,null),
    ('SARAHLOO',15,null),
    ('SJ',8,null),
    ('BEARDED DRIVER',7,null),
    ('STEWIE',2,null),
    ('STROKELIMITREACHED',1,null),
    ('MINI G',1,null),
    ('MAXIMUS',null,96),
    ('LYNNIEBODD',null,64),
    ('THE REAL JB',null,62),
    ('ANDREWBCA',null,61),
    ('GOMARINO13',null,54),
    ('LEANIN2IT',null,54),
    ('KD0017',null,53),
    ('CHIPNPUTT',null,52),
    ('CATWEAZEL',null,47),
    ('KEIRAROBERT',null,32),
    ('RACCOONS WHISKER',null,22),
    ('INDIANCHIEF',null,20),
    ('PRINCESS SPICY',null,16),
    ('PLUCKY',null,14),
    ('SLABDADDY',null,14),
    ('SLAPPY',null,9),
    ('ZANETTI',null,7),
    ('DEEBEE',null,3),
    ('DUCKK',null,2)
), merged as (
  select source_name,max(ytd_points) as ytd_points,max(period_points) as period_points
  from source_rows
  group by source_name
)
insert into public.climbers_legacy_baseline_source_rows(import_key,source_name,ytd_points,period_points)
select 'all_time_leaderboard_2026_08_14',source_name,ytd_points,period_points
from merged
on conflict (import_key,source_name) do nothing;

-- Final server-backed canonical mappings from the protected Climbers review.
-- Source spellings remain unchanged; canonical IDs are the only arithmetic key.
with resolved(source_name,canonical_player_id) as (
  values
    ('THE REAL JB','55d9c7f0-ba6b-4245-91de-a90189276744'::uuid),
    ('LAURENT','fbd60e4a-9d17-4556-9062-dc005a0c5723'::uuid),
    ('GOMARINO13','c0707ed3-323f-4e0d-b119-99dd9790f8f4'::uuid),
    ('TRICKYDICKY','6f38b6b4-46bf-4ae6-9bb5-2230be6fb3f4'::uuid),
    ('CATWEAZEL','66629910-223c-43f7-b563-bcab2da902a2'::uuid),
    ('LARRYR','67bf10e5-19f6-4e48-82f6-ae15732edb63'::uuid),
    ('SERENITYMOON','db88e65e-5b26-4627-9331-b07738276116'::uuid),
    ('INDIANCHIEF','768ccb1a-567c-4f4b-a4e0-f2c709583ab4'::uuid),
    ('ZANETTI','2e4ce1d8-afd6-44a2-9560-f85c16f23747'::uuid),
    ('GOBSON','bc5bda4d-8977-4119-95a5-848733e9c6b5'::uuid),
    ('MAXIMUS','ba91585f-04b5-440a-a5fa-9e70352ece91'::uuid),
    ('LEANIN2IT','9ac6ad68-7590-470d-8d35-122fcebed394'::uuid),
    ('ALYSSA38','c60ed0d8-1f05-4675-b635-342707607c18'::uuid),
    ('SLABDADDY','ee250925-578a-4b26-a549-c4dc88d42b23'::uuid),
    ('CHIPNPUTT','d38c0220-8a80-45a6-86e8-d495f523d5ab'::uuid),
    ('EL JORGE','8832eacf-2433-4ea3-b97e-5d0d25da3099'::uuid),
    ('PEACH','d74bba7c-a0a8-4976-b7f7-1b9deb23b8b5'::uuid),
    ('D3BB13','f1bab752-d5cf-4001-b2ad-bafd6af83d8b'::uuid),
    ('INDY','d4e37778-8a69-4878-9ec3-6b6fddb03425'::uuid),
    ('DAISYSHAW','532e0834-e808-49a2-ae74-b66c97ce72f2'::uuid),
    ('UROPA','1ce077b9-5d7a-49ae-bbcd-a714a443af4f'::uuid),
    ('DUCKK','dbc70bf7-5239-440c-aad1-b2b288311a7d'::uuid),
    ('BIGJA','69c0daa5-70b8-481b-94e5-a9d033bc75fb'::uuid),
    ('DMD-ENDITNOW','fb35bddc-4e71-4cc5-bd18-3efcfb488e22'::uuid),
    ('JENNEM','72bd3518-f11a-458c-a37f-3fb90cf0c5c8'::uuid),
    ('DABIGWILLO','6da4e335-3218-4711-b5db-e3faf558e68b'::uuid),
    ('METUM','ba5a3695-4e76-4820-a489-5eac43aec5cc'::uuid),
    ('DEEBEE','b77d2644-31eb-4b82-9f76-f124a25b9a06'::uuid),
    ('GOLFSHARK','35928d1d-a4b5-481b-8081-eae90acd9ac5'::uuid),
    ('EARTHLING','78b95430-f473-41a2-b770-5bb5c36545e4'::uuid),
    ('LYNNIEBODD','b98df6d3-7e16-450f-bd17-f39d9903d1e1'::uuid),
    ('STONEYMAN69','dfdd9e81-01ff-4284-b910-acdf41ee7bdd'::uuid),
    ('GRIPRIP','3299fa06-716f-4c62-89d3-7bd72fb39b0c'::uuid),
    ('BUBBAFRAME','dede8d19-e92b-4e3e-8af3-4050b8e40fd2'::uuid),
    ('CAPTAIN','100a9131-fd1e-49cd-b194-2c1c2f07387f'::uuid),
    ('MATT916','432fb05b-1506-41ea-86e9-41bf07763b48'::uuid),
    ('SLAPPY','e28db184-9399-478d-9989-26db76e40619'::uuid),
    ('STROKELIMITREACHED','aa804558-799e-46c0-8971-b51ff4bd38de'::uuid),
    ('KEIRAROBERT','f81f64b6-4990-4d08-86a9-c23c18a24fa3'::uuid),
    ('RACCOONS WHISKER','8b29287c-0696-4cb9-8bb1-b161e0940808'::uuid),
    ('PRINCESS SPICY','95b55b59-45bc-4eaa-a3fe-8c89ab150488'::uuid),
    ('PLUCKY','c7c85811-6bb8-4824-a288-2f3ae0af89c9'::uuid),
    ('GUYB','6845f4bf-d395-47e7-b5d0-8cb02f881c20'::uuid),
    ('CHELLE','e2af01d7-90d5-4963-9d9f-0493df9fefb2'::uuid),
    ('BADWOLFF','9976197b-dc3d-4cf6-9200-603a3d1acbf9'::uuid),
    ('ROKNHORSEBRAT','6d74f565-dc1d-41e3-81e5-fd7e6b38e28d'::uuid),
    ('KNOCKOUTG','ae096f1e-4adc-464b-9947-bf8b635e4d9f'::uuid),
    ('PAULV-PPP','eb95bd85-5cee-437b-b458-abedf5a368d3'::uuid),
    ('AWESOME KRIS','706ba7c0-9efd-4b2c-9366-94b6354a82ce'::uuid),
    ('NUTTY GRANDPA','ebcdd3f4-1a69-40f6-819e-899fbe9998d7'::uuid),
    ('NEO IMPOSSIBLE','c19d0b98-ed0b-462c-8b31-6b54221127d9'::uuid),
    ('KILL ER BEE','e2741a95-19e9-440c-a605-f1c1498aa5c1'::uuid),
    ('ULTRAFOX LYNNE','e249815d-ac23-4ef7-9c20-7ed9ba0c57c4'::uuid),
    ('MASTER KP','c50cb21a-de40-4900-b02f-866207521fe3'::uuid),
    ('DJ TWIGG','7f5d015a-1397-4fa6-918c-5bac4a0dd5ba'::uuid),
    ('MUSICAL ATV','c4198d7c-dbe7-442f-bc89-908b3b1803d0'::uuid),
    ('PRINCESS BANKSHOT','cb01e4af-b57b-4424-a00f-7697f1c5f90f'::uuid),
    ('SARAHLOO','ec5c8f36-444f-4c7e-8309-f358d0475c27'::uuid),
    ('SJ','ec943c83-bd7f-46b9-a9a9-8d2d6a3a71b0'::uuid),
    ('BEARDED DRIVER','5f293732-47a3-4407-a8a6-887d8d885c61'::uuid),
    ('MINI G','45150b1f-ffa0-4bdf-a9b3-e69a5d79bcaa'::uuid),
    ('SANDTRAP24','b82b24ba-da94-42e2-8c2e-2c9ce1076142'::uuid),
    ('ZOEDARLIN','3aec83ee-9082-4703-b19f-7f33f0f7e995'::uuid),
    ('MAMMOTHREPT','d1621cfd-1841-435e-b97b-cf369f6aecd7'::uuid),
    ('YANKEEDUDE08','9a3b0702-8240-400f-afab-00b5412192c7'::uuid),
    ('KD0017','83343490-426d-4275-a557-b1fab48b76f0'::uuid),
    ('SLUGJUG33','334cceb8-df81-4499-b73d-0d9f242f8274'::uuid),
    ('L7JAZZ','406dc09d-2d51-4ba3-af11-8b549421be80'::uuid),
    ('DREW 0706','e8d466fe-1fa8-498c-b8ab-fbc050ab7059'::uuid),
    ('STICKY80','036372cc-f3a5-4da9-aaa5-6edae9e6c1ca'::uuid),
    ('XEROFORMGIRL','32a7cbdb-4446-4d64-b9cd-261a4338dfb5'::uuid),
    ('MULLIGAN','db682f5a-3352-4490-a2cb-013573c8a1c0'::uuid),
    ('FRY LOCK','3a608d22-c3e8-43ee-bb64-6bab95c7233b'::uuid),
    ('SHOOTER MCGAVIN','eb44d050-2082-4f66-a926-c26d5bee1765'::uuid),
    ('WYNDEMERE','7befb54f-6eec-4c7c-9881-c75d1acfb8d8'::uuid),
    ('WICKEDSHACK','c5c9c0a1-941a-4145-b31f-77323499af21'::uuid),
    ('AWSOME KRIS','706ba7c0-9efd-4b2c-9366-94b6354a82ce'::uuid),
    ('STEWIE','6309b9d7-93a8-4047-99af-2f0dcb58d054'::uuid),
    ('ANDREWBCA','1ac34b97-06fc-4aff-a837-9d387544f21b'::uuid)
)
update public.climbers_legacy_baseline_source_rows s
set canonical_player_id = r.canonical_player_id,
    identity_status = 'resolved',
    identity_review_note = 'Existing canonical/approved identity evidence; verify against current persistent mapping before apply.',
    reviewed_at = coalesce(s.reviewed_at,now())
from resolved r
where s.import_key='all_time_leaderboard_2026_08_14'
  and s.source_name=r.source_name
  and s.identity_status='review_required';

create table if not exists public.climbers_legacy_baselines (
  import_key text not null references public.climbers_legacy_baseline_imports(import_key) on delete restrict,
  canonical_player_id uuid not null references public.players(id) on delete restrict,
  source_workbook text not null,
  cutoff_at timestamptz not null,
  ytd_points integer not null check (ytd_points >= 0),
  period_points integer not null check (period_points >= 0),
  combined_points integer not null check (combined_points = ytd_points + period_points),
  source_names text[] not null,
  created_at timestamptz not null default now(),
  primary key(import_key,canonical_player_id)
);

create index if not exists climbers_legacy_baselines_player_idx
  on public.climbers_legacy_baselines(canonical_player_id,cutoff_at desc);

create or replace function public.apply_climbers_legacy_baseline(p_import_key text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_import public.climbers_legacy_baseline_imports%rowtype;
  v_count integer;
begin
  if auth.uid() is null or not public.is_current_user_site_admin() then
    raise exception 'Administrator authorization is required' using errcode='42501';
  end if;
  select * into v_import
  from public.climbers_legacy_baseline_imports
  where import_key=p_import_key
  for update;
  if not found then raise exception 'Unknown Climbers baseline import'; end if;
  if v_import.applied_at is not null then
    select count(*)::integer into v_count from public.climbers_legacy_baselines where import_key=p_import_key;
    return v_count;
  end if;
  if exists (
    select 1 from public.climbers_legacy_baseline_source_rows
    where import_key=p_import_key and identity_status<>'resolved'
  ) then
    raise exception 'Every workbook source name must be resolved before applying the Climbers baseline';
  end if;
  if exists (
    select 1 from public.climbers_legacy_baseline_source_rows
    where import_key=p_import_key and canonical_player_id is null
  ) then
    raise exception 'Resolved Climbers source rows require a canonical public.players.id';
  end if;
  insert into public.climbers_legacy_baselines(
    import_key,canonical_player_id,source_workbook,cutoff_at,ytd_points,period_points,combined_points,source_names
  )
  select p_import_key,s.canonical_player_id,v_import.source_workbook,v_import.cutoff_at,
    sum(coalesce(s.ytd_points,0))::integer,
    sum(coalesce(s.period_points,0))::integer,
    sum(coalesce(s.ytd_points,0)+coalesce(s.period_points,0))::integer,
    array_agg(s.source_name order by s.source_name)
  from public.climbers_legacy_baseline_source_rows s
  where s.import_key=p_import_key
  group by s.canonical_player_id
  on conflict (import_key,canonical_player_id) do update set
    ytd_points=excluded.ytd_points,
    period_points=excluded.period_points,
    combined_points=excluded.combined_points,
    source_names=excluded.source_names;
  get diagnostics v_count = row_count;
  update public.climbers_legacy_baseline_imports
  set applied_at=now(),applied_by=auth.uid()
  where import_key=p_import_key;
  return v_count;
end;
$function$;
revoke all on function public.apply_climbers_legacy_baseline(text) from public,anon,authenticated;
grant execute on function public.apply_climbers_legacy_baseline(text) to authenticated;

create or replace view public.climbers_year_to_date as
with control as (
  select * from public.climbers_legacy_baseline_imports
  where import_key='all_time_leaderboard_2026_08_14' and applied_at is not null and now() >= cutoff_at
),
legacy as (
  select b.canonical_player_id as player_id,b.combined_points as points,0::integer as event_count
  from public.climbers_legacy_baselines b
  join control c on c.import_key=b.import_key and c.cutoff_at=b.cutoff_at
  where extract(year from c.cutoff_at at time zone 'UTC')=extract(year from now() at time zone 'UTC')
),
new_events as (
  select e.player_id,e.points,1::integer as event_count
  from public.climbers_events e
  join control c on true
  where e.voided_at is null and e.created_at >= c.cutoff_at and e.created_at >= date_trunc('year',now())
),
all_points as (
  select * from legacy
  union all
  select * from new_events
)
select player_id,sum(points)::integer as points,sum(event_count)::integer as event_count
from all_points
group by player_id;

alter table public.climbers_legacy_baseline_imports enable row level security;
alter table public.climbers_legacy_baseline_source_rows enable row level security;
alter table public.climbers_legacy_baselines enable row level security;

drop policy if exists climbers_legacy_import_admin_select on public.climbers_legacy_baseline_imports;
create policy climbers_legacy_import_admin_select on public.climbers_legacy_baseline_imports
  for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists climbers_legacy_source_admin_select on public.climbers_legacy_baseline_source_rows;
create policy climbers_legacy_source_admin_select on public.climbers_legacy_baseline_source_rows
  for select to authenticated using (public.is_current_user_site_admin());
drop policy if exists climbers_legacy_baselines_admin_select on public.climbers_legacy_baselines;
create policy climbers_legacy_baselines_admin_select on public.climbers_legacy_baselines
  for select to authenticated using (public.is_current_user_site_admin());

grant select on public.climbers_legacy_baseline_imports,public.climbers_legacy_baseline_source_rows,
  public.climbers_legacy_baselines to authenticated;
revoke insert,update,delete on public.climbers_legacy_baseline_imports,
  public.climbers_legacy_baseline_source_rows,public.climbers_legacy_baselines
  from public,anon,authenticated;

commit;
