-- READ-ONLY GLOBAL PLAYER DISCORD IDENTITY AUDIT

-- A. Canonical players with a Discord user ID.
select
  'A_CANONICAL_DISCORD_ID_SET'::text as conflict_category,
  player.id as player_id,
  player.screen_name,
  'public.players'::text as source_table
from public.players as player
where nullif(btrim(player.discord_id), '') is not null
order by player.screen_name, player.id;

-- B. Canonical players with a Discord name but no canonical Discord user ID.
select
  'B_NAME_WITHOUT_CANONICAL_ID'::text as conflict_category,
  player.id as player_id,
  player.screen_name,
  'public.players'::text as source_table,
  case
    when nullif(btrim(player.discord_name), '') is not null then 'discord_name'
    when nullif(btrim(player.discord_username), '') is not null then 'discord_username'
  end as populated_name_field
from public.players as player
where nullif(btrim(player.discord_id), '') is null
  and (
    nullif(btrim(player.discord_name), '') is not null
    or nullif(btrim(player.discord_username), '') is not null
  )
order by player.screen_name, player.id;

-- C. Discord-member identities not present on any canonical player.
select
  'C_DISCORD_MEMBER_ID_NOT_CANONICAL'::text as conflict_category,
  member.player_id,
  coalesce(linked_player.screen_name, member.walkabout_name, member.discord_name) as screen_name,
  'public.discord_members'::text as source_table
from public.discord_members as member
left join public.players as linked_player on linked_player.id = member.player_id
where nullif(btrim(member.discord_id), '') is not null
  and not exists (
    select 1 from public.players as player
    where nullif(btrim(player.discord_id), '') = nullif(btrim(member.discord_id), '')
  )
order by screen_name nulls last, member.player_id;

-- D. Player-tracker Discord identities not present on canonical players.
select
  'D_PLAYER_TRACKER_ID_NOT_CANONICAL'::text as conflict_category,
  null::uuid as player_id,
  tracker.screen_name,
  'public.player_tracker'::text as source_table
from public.player_tracker as tracker
where nullif(btrim(tracker.discord_id), '') is not null
  and not exists (
    select 1 from public.players as player
    where nullif(btrim(player.discord_id), '') = nullif(btrim(tracker.discord_id), '')
  )
order by tracker.screen_name;

-- E. Waitlist Discord identities not present on canonical players.
select
  'E_WAITLIST_ID_NOT_CANONICAL'::text as conflict_category,
  null::uuid as player_id,
  waitlist.screen_name,
  'public.player_waitlist'::text as source_table
from public.player_waitlist as waitlist
where nullif(btrim(waitlist.discord_id), '') is not null
  and not exists (
    select 1 from public.players as player
    where nullif(btrim(player.discord_id), '') = nullif(btrim(waitlist.discord_id), '')
  )
order by waitlist.screen_name;

-- F. Duplicate canonical Discord IDs. The ID itself is intentionally omitted here.
select
  'F_DUPLICATE_CANONICAL_DISCORD_ID'::text as conflict_category,
  count(*)::integer as player_count,
  array_agg(player.id order by player.id) as player_ids,
  array_agg(player.screen_name order by player.id) as screen_names
from public.players as player
where nullif(btrim(player.discord_id), '') is not null
group by nullif(btrim(player.discord_id), '')
having count(*) > 1
order by screen_names;

-- G. Discord-member rows whose linked UUID conflicts with canonical identity.
select
  'G_DISCORD_MEMBER_PLAYER_MISMATCH'::text as conflict_category,
  member.player_id,
  linked_player.screen_name,
  'public.discord_members -> public.players'::text as source_table,
  case
    when linked_player.id is null then 'member references a missing canonical player'
    when nullif(btrim(linked_player.discord_id), '') is null then 'linked canonical player has no Discord ID'
    when nullif(btrim(linked_player.discord_id), '') <> nullif(btrim(member.discord_id), '') then 'member and canonical player Discord IDs differ'
    when exists (
      select 1 from public.players as other_player
      where other_player.id <> linked_player.id
        and nullif(btrim(other_player.discord_id), '') = nullif(btrim(member.discord_id), '')
    ) then 'same Discord ID also belongs to another canonical player'
  end as mismatch_reason
from public.discord_members as member
left join public.players as linked_player on linked_player.id = member.player_id
where member.player_id is not null
  and (
    linked_player.id is null
    or nullif(btrim(linked_player.discord_id), '') is distinct from nullif(btrim(member.discord_id), '')
    or exists (
      select 1 from public.players as other_player
      where other_player.id <> linked_player.id
        and nullif(btrim(other_player.discord_id), '') = nullif(btrim(member.discord_id), '')
    )
  )
order by linked_player.screen_name nulls last, member.player_id;

-- H. Potential duplicate canonical players. Screen-name similarity is evidence only.
select
  'H_POTENTIAL_DUPLICATE_PLAYER'::text as conflict_category,
  first_player.id as first_player_id,
  first_player.screen_name as first_screen_name,
  second_player.id as second_player_id,
  second_player.screen_name as second_screen_name,
  case
    when nullif(btrim(first_player.discord_id), '') is not null
      and nullif(btrim(second_player.discord_id), '') is not null
      and nullif(btrim(first_player.discord_id), '') = nullif(btrim(second_player.discord_id), '')
      then 'same Discord ID'
    else 'equivalent normalized screen name with Discord identity on at least one row'
  end as evidence
from public.players as first_player
join public.players as second_player on second_player.id > first_player.id
where lower(regexp_replace(btrim(first_player.screen_name), '[^a-zA-Z0-9]+', '', 'g'))
    = lower(regexp_replace(btrim(second_player.screen_name), '[^a-zA-Z0-9]+', '', 'g'))
  and (
    nullif(btrim(first_player.discord_id), '') is not null
    or nullif(btrim(second_player.discord_id), '') is not null
  )
order by first_player.screen_name, second_player.screen_name;

-- SITE-ADMIN DETAILED AUDIT: exact Discord IDs for manual conflict repair only.
select
  source.source_table,
  source.player_id,
  source.screen_name,
  source.discord_id
from (
  select 'public.players'::text as source_table, player.id as player_id,
    player.screen_name, nullif(btrim(player.discord_id), '') as discord_id
  from public.players as player
  union all
  select 'public.discord_members', member.player_id,
    coalesce(linked_player.screen_name, member.walkabout_name, member.discord_name),
    nullif(btrim(member.discord_id), '')
  from public.discord_members as member
  left join public.players as linked_player on linked_player.id = member.player_id
  union all
  select 'public.player_tracker', null::uuid, tracker.screen_name,
    nullif(btrim(tracker.discord_id), '')
  from public.player_tracker as tracker
  union all
  select 'public.player_waitlist', null::uuid, waitlist.screen_name,
    nullif(btrim(waitlist.discord_id), '')
  from public.player_waitlist as waitlist
) as source
where source.discord_id is not null
order by source.discord_id, source.source_table, source.player_id nulls last;
