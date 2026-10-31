begin;

alter table public.shared_scorecard_evidence
  add column if not exists component_key text not null default 'primary';

alter table public.shared_scorecard_evidence
  drop constraint if exists shared_scorecard_evidence_component_key_check,
  add constraint shared_scorecard_evidence_component_key_check
    check (component_key ~ '^[a-z][a-z0-9_]{0,39}$');

drop index if exists public.shared_scorecard_one_active_evidence;
create unique index if not exists shared_scorecard_one_active_evidence_component
  on public.shared_scorecard_evidence (context_id, component_key)
  where review_status in ('uploading', 'submitted', 'under_review', 'verified');

create index if not exists shared_scorecard_evidence_component_queue
  on public.shared_scorecard_evidence (context_id, component_key, review_status, submitted_at);

create table if not exists public.shared_scorecard_context_components (
  id uuid primary key default gen_random_uuid(),
  context_id uuid not null references public.shared_scorecard_contexts(id) on delete restrict,
  component_key text not null check (component_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  course_id uuid not null references public.all_time_courses(id) on delete restrict,
  course_code text not null,
  course_name_snapshot text not null,
  difficulty text not null check (difficulty in ('Easy', 'Hard')),
  par_snapshot smallint[] not null check (array_length(par_snapshot, 1) = 18),
  total_par smallint not null check (total_par > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (context_id, component_key)
);

alter table public.shared_scorecard_context_components enable row level security;
alter table public.shared_scorecard_context_components force row level security;
revoke all on table public.shared_scorecard_context_components from public, anon, authenticated;
grant select, insert, update on table public.shared_scorecard_context_components to service_role;

commit;
