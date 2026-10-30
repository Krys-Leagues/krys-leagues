export type MajorOwnerVipEvent = {
  slug: string
  name: string
}

export type MajorOwnerVipListEntry = {
  player_id: string
  player_screen_name: string
  added_at: string
  added_by: string | null
}

export function isMgaChampionshipEvent(event: MajorOwnerVipEvent | null | undefined) {
  if (!event) return false
  return event.slug === "major-2" || event.name.trim().toLocaleUpperCase() === "THE MGA CHAMPIONSHIP"
}

export function ownerVipSearchMatches(screenName: string, search: string) {
  const query = search.trim().toLocaleLowerCase()
  return !query || screenName.toLocaleLowerCase().includes(query)
}
