-- KWT Trophy Manager: additive, private workflow tables.
-- This proposal intentionally does not change KWT scores, standings, Handicaps,
-- existing player_trophies, or Lynne's Tournament Builder tables.
begin;

create table if not exists public.kwt_trophy_templates (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null check (season_number > 0),
  week_number integer not null check (week_number > 0),
  course_code text not null check (btrim(course_code) <> ''),
  award_category text not null check (award_category in ('GROSS', 'NET', 'OTHER')),
  division text not null default 'OVERALL' check (btrim(division) <> ''),
  placement integer not null check (placement between 1 and 3),
  template_name text not null check (btrim(template_name) <> ''),
  original_storage_path text not null check (original_storage_path like 'kwt/%'),
  original_sha256 text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text not null check (mime_type = 'image/png'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  nameplate jsonb not null default '{"x":50,"y":80,"fontSize":32,"color":"#ffffff","align":"center"}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_number, week_number, course_code, award_category, division, placement)
);

create table if not exists public.kwt_trophy_batches (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null check (season_number > 0),
  week_number integer not null check (week_number > 0),
  course_code text not null check (btrim(course_code) <> ''),
  award_category text not null check (award_category in ('GROSS', 'NET', 'OTHER')),
  status text not null default 'template_ready' check (status in ('template_ready', 'recipients_verified', 'personalized_preview', 'approved', 'awarded')),
  source_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_number, week_number, course_code, award_category)
);

create table if not exists public.kwt_trophy_awards (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.kwt_trophy_batches(id) on delete cascade,
  template_id uuid not null references public.kwt_trophy_templates(id),
  recipient_player_id uuid not null references public.players(id),
  recipient_name_snapshot text not null check (btrim(recipient_name_snapshot) <> ''),
  division text not null check (btrim(division) <> ''),
  placement integer not null check (placement between 1 and 3),
  source_kind text not null check (source_kind in ('kwt_operational_result', 'kwt_net_result', 'historical_evidence', 'manual_review')),
  source_reference text,
  personalized_storage_path text check (personalized_storage_path is null or personalized_storage_path like 'kwt/%'),
  render_sha256 text check (render_sha256 is null or render_sha256 ~ '^[0-9a-f]{64}$'),
  render_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('candidate', 'personalized', 'approved', 'awarded', 'revoked')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  awarded_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, template_id, recipient_player_id)
);

create table if not exists public.kwt_trophy_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('template', 'batch', 'award')),
  entity_id uuid not null,
  action text not null check (btrim(action) <> ''),
  actor_user_id uuid not null references auth.users(id),
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists kwt_trophy_templates_scope_idx on public.kwt_trophy_templates (season_number, week_number, course_code, award_category);
create index if not exists kwt_trophy_batches_scope_idx on public.kwt_trophy_batches (season_number, week_number, course_code, award_category, status);
create index if not exists kwt_trophy_awards_recipient_idx on public.kwt_trophy_awards (recipient_player_id, status);
create index if not exists kwt_trophy_audit_entity_idx on public.kwt_trophy_audit_log (entity_type, entity_id, created_at desc);

alter table public.kwt_trophy_templates enable row level security;
alter table public.kwt_trophy_batches enable row level security;
alter table public.kwt_trophy_awards enable row level security;
alter table public.kwt_trophy_audit_log enable row level security;

revoke all on public.kwt_trophy_templates, public.kwt_trophy_batches, public.kwt_trophy_awards, public.kwt_trophy_audit_log from public, anon, authenticated;
grant all on public.kwt_trophy_templates, public.kwt_trophy_batches, public.kwt_trophy_awards, public.kwt_trophy_audit_log to service_role;

commit;
