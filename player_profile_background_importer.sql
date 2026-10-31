begin;

create table if not exists public.approved_player_profile_backgrounds (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  storage_path text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_profile_background_name check (char_length(btrim(display_name)) between 1 and 80),
  constraint approved_profile_background_path check (storage_path ~ '^approved/background-[0-9a-f-]+[.](png|jpg|webp)$')
);

alter table public.approved_player_profile_backgrounds enable row level security;
revoke all on table public.approved_player_profile_backgrounds from public,anon,authenticated;

alter table public.player_profile_preferences
  add column if not exists background_id uuid references public.approved_player_profile_backgrounds(id) on delete set null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('player-profile-backgrounds','player-profile-backgrounds',true,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Site admins read player profile backgrounds" on storage.objects;
create policy "Site admins read player profile backgrounds" on storage.objects for select to authenticated
using (bucket_id='player-profile-backgrounds' and public.is_current_user_site_admin());
drop policy if exists "Site admins upload player profile backgrounds" on storage.objects;
create policy "Site admins upload player profile backgrounds" on storage.objects for insert to authenticated
with check (bucket_id='player-profile-backgrounds' and public.is_current_user_site_admin() and (storage.foldername(name))[1]='approved');
drop policy if exists "Site admins remove player profile backgrounds" on storage.objects;
create policy "Site admins remove player profile backgrounds" on storage.objects for delete to authenticated
using (bucket_id='player-profile-backgrounds' and public.is_current_user_site_admin());

create or replace function public.get_approved_player_profile_backgrounds()
returns table(id uuid,display_name text,storage_path text)
language sql stable security definer set search_path to '' as $function$
  select background.id,background.display_name,background.storage_path
  from public.approved_player_profile_backgrounds as background
  where background.active
  order by background.display_name,background.id;
$function$;

create or replace function public.admin_create_player_profile_background(p_display_name text,p_storage_path text,p_active boolean default true)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_id uuid;
begin
  if not public.is_current_user_site_admin() then raise exception 'Administrator authorization is required'; end if;
  insert into public.approved_player_profile_backgrounds(display_name,storage_path,active)
  values (btrim(p_display_name),btrim(p_storage_path),coalesce(p_active,true)) returning id into v_id;
  return v_id;
end;
$function$;

drop function if exists public.get_public_player_profile_preferences(uuid);
create function public.get_public_player_profile_preferences(p_player_id uuid)
returns table(player_id uuid,background_color text,glow_color text,text_color text,about_me text,background_id uuid,background_path text)
language sql stable security definer set search_path to '' as $function$
  select canonical.id,coalesce(pref.background_color,'#07111f'),coalesce(pref.glow_color,'#ff2bd6'),coalesce(pref.text_color,'#f8fafc'),nullif(btrim(pref.about_me),''),
    case when background.active then background.id end,case when background.active then background.storage_path end
  from public.players as canonical
  left join public.player_profile_preferences as pref on pref.player_id=canonical.id
  left join public.approved_player_profile_backgrounds as background on background.id=pref.background_id
  where canonical.id=public.resolve_canonical_player_id(p_player_id);
$function$;

drop function if exists public.save_player_profile_preferences(uuid,text,text,text,text);
create function public.save_player_profile_preferences(p_player_id uuid,p_background_color text,p_glow_color text,p_text_color text,p_about_me text,p_background_id uuid)
returns table(player_id uuid,background_color text,glow_color text,text_color text,about_me text,background_id uuid,background_path text)
language plpgsql security definer set search_path to '' as $function$
declare v_player_id uuid:=public.resolve_canonical_player_id(p_player_id); v_background text:=lower(btrim(p_background_color)); v_glow text:=lower(btrim(p_glow_color)); v_text text:=lower(btrim(p_text_color)); v_about text:=nullif(btrim(replace(replace(p_about_me,chr(13)||chr(10),chr(10)),chr(13),chr(10))),'');
begin
  if not public.can_edit_player_profile_preferences(v_player_id) then raise exception 'You may edit only your own player profile' using errcode='42501'; end if;
  if v_background !~ '^#[0-9a-f]{6}$' or v_glow !~ '^#[0-9a-f]{6}$' or v_text !~ '^#[0-9a-f]{6}$' then raise exception 'Profile colors must be six-digit hexadecimal colors'; end if;
  if char_length(v_about)>500 then raise exception 'About Me must be 500 characters or fewer'; end if;
  if p_background_id is not null and not exists(select 1 from public.approved_player_profile_backgrounds as background where background.id=p_background_id and background.active) then raise exception 'Choose an approved Player Profile background'; end if;
  insert into public.player_profile_preferences as pref(player_id,background_color,glow_color,text_color,about_me,background_id)
  values(v_player_id,v_background,v_glow,v_text,v_about,p_background_id)
  on conflict(player_id) do update set background_color=excluded.background_color,glow_color=excluded.glow_color,text_color=excluded.text_color,about_me=excluded.about_me,background_id=excluded.background_id,updated_at=now();
  return query select pref.player_id,pref.background_color,pref.glow_color,pref.text_color,pref.about_me,pref.background_id,background.storage_path
  from public.player_profile_preferences as pref left join public.approved_player_profile_backgrounds as background on background.id=pref.background_id where pref.player_id=v_player_id;
end;
$function$;

revoke all on function public.get_approved_player_profile_backgrounds() from public,anon,authenticated;
grant execute on function public.get_approved_player_profile_backgrounds() to anon,authenticated;
revoke all on function public.admin_create_player_profile_background(text,text,boolean) from public,anon,authenticated;
grant execute on function public.admin_create_player_profile_background(text,text,boolean) to authenticated;
revoke all on function public.get_public_player_profile_preferences(uuid) from public,anon,authenticated;
grant execute on function public.get_public_player_profile_preferences(uuid) to anon,authenticated;
revoke all on function public.save_player_profile_preferences(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.save_player_profile_preferences(uuid,text,text,text,text,uuid) to authenticated;

commit;
