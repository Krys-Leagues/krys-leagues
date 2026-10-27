begin;

-- Additive Trophy Manager upgrade. Existing KWT results, standings, templates,
-- and player trophy rows are preserved.
alter table public.kwt_trophy_templates
  add column if not exists award_scope text not null default 'division';
alter table public.kwt_trophy_templates
  add column if not exists template_kind text not null default 'individual';
alter table public.kwt_trophy_batches
  add column if not exists award_scope text not null default 'division';
alter table public.kwt_trophy_awards
  add column if not exists award_scope text not null default 'division';
alter table public.kwt_trophy_awards
  add column if not exists profile_trophy_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kwt_trophy_templates_award_scope_check') then
    alter table public.kwt_trophy_templates add constraint kwt_trophy_templates_award_scope_check
      check (award_scope in ('overall', 'division', 'historical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kwt_trophy_templates_kind_check') then
    alter table public.kwt_trophy_templates add constraint kwt_trophy_templates_kind_check
      check (template_kind in ('individual', 'historical_personalized', 'commemorative'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kwt_trophy_batches_award_scope_check') then
    alter table public.kwt_trophy_batches add constraint kwt_trophy_batches_award_scope_check
      check (award_scope in ('overall', 'division', 'historical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kwt_trophy_awards_award_scope_check') then
    alter table public.kwt_trophy_awards add constraint kwt_trophy_awards_award_scope_check
      check (award_scope in ('overall', 'division', 'historical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kwt_trophy_awards_profile_trophy_fk') then
    alter table public.kwt_trophy_awards add constraint kwt_trophy_awards_profile_trophy_fk
      foreign key (profile_trophy_id) references public.player_trophies(id);
  end if;
end $$;

alter table public.player_trophies
  add column if not exists kwt_award_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_trophies_kwt_award_fk') then
    alter table public.player_trophies add constraint player_trophies_kwt_award_fk
      foreign key (kwt_award_id) references public.kwt_trophy_awards(id);
  end if;
end $$;

create unique index if not exists player_trophies_kwt_award_unique
  on public.player_trophies (kwt_award_id) where kwt_award_id is not null;
create index if not exists kwt_trophy_awards_scope_idx
  on public.kwt_trophy_awards (award_scope, status, recipient_player_id);

-- The bucket already exists in Production and is private. This is intentionally
-- insert-only so an existing bucket's privacy or limits cannot be weakened.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'tournament-trophies', 'tournament-trophies', false, 15728640, array['image/png']::text[]
where not exists (select 1 from storage.buckets where id = 'tournament-trophies');

commit;
