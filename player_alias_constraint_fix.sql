begin;

-- Exact duplicate history for one UUID would violate the replacement key.
-- Stop without changing anything so an administrator can review those rows.
do $check$
begin
  if exists (
    select 1
    from public.player_aliases as alias_row
    group by alias_row.player_id, alias_row.alias
    having count(*) > 1
  ) then
    raise exception 'Cannot install player alias constraints: duplicate exact aliases exist for the same player UUID';
  end if;
end;
$check$;

-- normalized_alias is matching/search evidence, not identity.
drop index if exists public.player_aliases_normalized_unique;

-- Preserve each exact historical spelling once per canonical UUID.
drop index if exists public.player_aliases_player_exact_alias_uidx;
create unique index player_aliases_player_exact_alias_uidx
  on public.player_aliases(player_id, alias);

-- Multiple exact aliases and multiple UUIDs may share one normalized lookup key.
drop index if exists public.player_aliases_normalized_lookup_idx;
create index player_aliases_normalized_lookup_idx
  on public.player_aliases(normalized_alias);

commit;
