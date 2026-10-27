begin;

create table if not exists public.kwt_championship_pages (
  id uuid primary key default gen_random_uuid(),
  season_number integer not null check (season_number > 0),
  week_number integer not null check (week_number > 0),
  course_code text not null check (length(trim(course_code)) > 0),
  title text not null default 'KWT Championship Story',
  article_title text not null default '',
  story_body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'archived')),
  artwork_storage_path text,
  supporting_media jsonb not null default '[]'::jsonb check (jsonb_typeof(supporting_media) = 'array'),
  created_by uuid,
  approved_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_number, week_number, course_code)
);

create index if not exists kwt_championship_pages_public_idx
  on public.kwt_championship_pages (status, season_number desc, week_number desc);
alter table public.kwt_championship_pages enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select 'kwt-championship-media', 'kwt-championship-media', false, 12582912,
       array['image/png','image/jpeg','image/webp']::text[]
where not exists (select 1 from storage.buckets where id = 'kwt-championship-media');

commit;
