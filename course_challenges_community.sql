-- Additive, preview-only preparation for public Course Challenge celebrations.
-- Reward ownership remains the single source of truth; no reward rows are copied.
begin;

create table if not exists public.course_challenge_reward_reactions (
  reward_id uuid not null references public.course_challenge_rewards(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  reaction text not null check (reaction in ('🎉','👏','🏆','🔥','❤️','⛳')),
  created_at timestamptz not null default now(),
  primary key (reward_id, player_id)
);

create index if not exists course_challenge_reward_reactions_reward_idx
  on public.course_challenge_reward_reactions(reward_id);

alter table public.course_challenge_reward_reactions enable row level security;
revoke all on table public.course_challenge_reward_reactions from public, anon, authenticated;
grant select on table public.course_challenge_reward_reactions to anon, authenticated;
grant insert, update, delete on table public.course_challenge_reward_reactions to authenticated;

drop policy if exists course_challenge_reward_reactions_public_read on public.course_challenge_reward_reactions;
create policy course_challenge_reward_reactions_public_read
  on public.course_challenge_reward_reactions
  for select to anon, authenticated using (true);

drop policy if exists course_challenge_reward_reactions_own_insert on public.course_challenge_reward_reactions;
create policy course_challenge_reward_reactions_own_insert
  on public.course_challenge_reward_reactions
  for insert to authenticated
  with check (player_id = public.current_user_canonical_player_id());

drop policy if exists course_challenge_reward_reactions_own_update on public.course_challenge_reward_reactions;
create policy course_challenge_reward_reactions_own_update
  on public.course_challenge_reward_reactions
  for update to authenticated
  using (player_id = public.current_user_canonical_player_id())
  with check (player_id = public.current_user_canonical_player_id());

drop policy if exists course_challenge_reward_reactions_own_delete on public.course_challenge_reward_reactions;
create policy course_challenge_reward_reactions_own_delete
  on public.course_challenge_reward_reactions
  for delete to authenticated
  using (player_id = public.current_user_canonical_player_id());

-- Prepared for a future optional Discord delivery path. No sender runs until the
-- dedicated webhook is configured and the feature is explicitly activated.
create table if not exists public.course_challenge_celebration_deliveries (
  reward_id uuid not null references public.course_challenge_rewards(id) on delete cascade,
  destination text not null default 'discord_celebrations',
  status text not null check (status in ('pending','sent','not_configured','failed')),
  attempted_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  primary key (reward_id, destination)
);

alter table public.course_challenge_celebration_deliveries enable row level security;
revoke all on table public.course_challenge_celebration_deliveries from public, anon, authenticated;

commit;
