begin;

-- The site-wide Masters admin alert needs only pending counts and the newest
-- scorecard id. Keep the full verification queue (including rosters and all
-- hole rows) for the review desk, but do not rebuild it for background polls.
create or replace function public.get_major_scorecard_verification_summary(
  p_major_event_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
select case
  when public.is_current_user_site_admin() then jsonb_build_object(
    'rooms', count(distinct coalesce(membership.group_id::text, 'score:' || card.id::text)),
    'scores', count(*),
    'latestId', (array_agg(card.id order by card.submitted_at desc nulls last, card.id desc))[1]
  )
  else jsonb_build_object('rooms', 0, 'scores', 0, 'latestId', null)
end
from public.major_player_scorecards card
left join public.major_schedule_group_members membership
  on membership.entry_id = card.entry_id
 and membership.play_day_id = card.play_day_id
where card.major_event_id = p_major_event_id
  and card.status in ('submitted', 'reopened')
$function$;

revoke all on function public.get_major_scorecard_verification_summary(uuid)
from public, anon, authenticated;
grant execute on function public.get_major_scorecard_verification_summary(uuid)
to authenticated;

commit;
