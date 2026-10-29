begin;

-- Staging-only prerequisite for the already-authorized Global Players avatar workflow.
-- Keep the bucket public for direct display URLs, but allow object mutations only to site admins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-avatars',
  'player-avatars',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admin_player_avatar_insert'
  ) then
    create policy admin_player_avatar_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'player-avatars'
        and public.is_current_user_site_admin()
        and exists (
          select 1
          from public.players as player
          where player.id::text = (storage.foldername(name))[1]
            and not exists (
              select 1
              from public.player_identity_links as link
              where link.historical_player_id = player.id
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admin_player_avatar_update'
  ) then
    create policy admin_player_avatar_update
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'player-avatars' and public.is_current_user_site_admin())
      with check (bucket_id = 'player-avatars' and public.is_current_user_site_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'admin_player_avatar_delete'
  ) then
    create policy admin_player_avatar_delete
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'player-avatars' and public.is_current_user_site_admin());
  end if;
end
$$;

commit;
