begin;

-- Evidence replacement is fixture-scoped and auditable. It never deletes the
-- previous private upload and it cannot replace an already verified upload.
alter table public.shared_scorecard_evidence
  add column if not exists replaced_by_evidence_id uuid references public.shared_scorecard_evidence(id) on delete restrict,
  add column if not exists replaced_from_status text,
  add column if not exists replaced_at timestamptz,
  add column if not exists replaced_by_player_id uuid references public.players(id) on delete restrict,
  add column if not exists replaced_by_discord_user_id text,
  add column if not exists replacement_audit_id uuid;

alter table public.shared_scorecard_evidence
  drop constraint if exists shared_scorecard_evidence_review_status_check,
  add constraint shared_scorecard_evidence_review_status_check
    check (review_status in ('uploading', 'submitted', 'under_review', 'verified', 'replaced', 'reopened', 'upload_failed'));

drop index if exists public.shared_scorecard_one_active_evidence_component;
create unique index if not exists shared_scorecard_one_active_evidence_component
  on public.shared_scorecard_evidence (context_id, component_key)
  where review_status in ('uploading', 'submitted', 'under_review', 'reopened', 'verified');

create table if not exists public.shared_scorecard_evidence_replacements (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.shared_scorecard_contexts(id) on delete restrict,
  component_key text not null check (component_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  previous_evidence_id uuid not null references public.shared_scorecard_evidence(id) on delete restrict,
  new_evidence_id uuid not null unique references public.shared_scorecard_evidence(id) on delete restrict,
  replaced_by_player_id uuid references public.players(id) on delete restrict,
  replaced_by_discord_user_id text,
  previous_review_status text not null,
  replacement_status text not null default 'reserved' check (replacement_status in ('reserved', 'completed', 'rolled_back')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.shared_scorecard_evidence_replacements enable row level security;
alter table public.shared_scorecard_evidence_replacements force row level security;
revoke all on table public.shared_scorecard_evidence_replacements from public, anon, authenticated;
grant select, insert, update on table public.shared_scorecard_evidence_replacements to service_role;

create index if not exists shared_scorecard_evidence_replacements_context_idx
  on public.shared_scorecard_evidence_replacements (context_id, component_key, created_at desc);

commit;
