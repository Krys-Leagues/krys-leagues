begin;

create table public.kwt_room_signup_cleanup_audit (
  id uuid primary key default gen_random_uuid(),
  operation text not null default 'clear_kwt_room_signups'
    check (operation = 'clear_kwt_room_signups'),
  target_channel_id text not null
    check (target_channel_id = '1270449279340904518'),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  deleted_count integer not null default 0 check (deleted_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  protected_count integer not null default 0 check (protected_count >= 0),
  protected_breakdown jsonb not null default '{}'::jsonb,
  failure_details jsonb not null default '[]'::jsonb,
  final_status text not null default 'running'
    check (final_status in ('running', 'success', 'already_clear', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index kwt_room_signup_cleanup_one_running_idx
  on public.kwt_room_signup_cleanup_audit(target_channel_id)
  where final_status = 'running';

create index kwt_room_signup_cleanup_created_idx
  on public.kwt_room_signup_cleanup_audit(created_at desc);

alter table public.kwt_room_signup_cleanup_audit enable row level security;
alter table public.kwt_room_signup_cleanup_audit force row level security;

revoke all on table public.kwt_room_signup_cleanup_audit from public, anon, authenticated;
grant select, insert, update on table public.kwt_room_signup_cleanup_audit to service_role;

commit;
