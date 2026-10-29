export type MajorVipPlacement = {
  player_id: string
  player_screen_name_snapshot: string
  weekend_field: "main" | "secondary" | "qualifying" | null
  field_placement: number | null
  result_status: "pending" | "completed" | "did_not_finish" | "withdrawn" | "disqualified"
  is_finalized: boolean
}

export type MajorVipEligiblePlayer = {
  playerId: string
  screenName: string
  placement: number
}

/**
 * Major priority uses the established finalized Main Event leaderboard.
 * Every player at a published placement from 1 through 10 qualifies;
 * the cutoff is a placement, so ties are never truncated to ten people.
 */
export function getMajorVipEligiblePlayers(placements: ReadonlyArray<MajorVipPlacement>): MajorVipEligiblePlayer[] {
  return placements
    .filter((placement): placement is MajorVipPlacement & { field_placement: number } => (
      placement.is_finalized
      && placement.result_status === "completed"
      && placement.weekend_field === "main"
      && placement.field_placement !== null
      && Number.isInteger(placement.field_placement)
      && placement.field_placement >= 1
      && placement.field_placement <= 10
    ))
    .map((placement) => ({
      playerId: placement.player_id,
      screenName: placement.player_screen_name_snapshot,
      placement: placement.field_placement as number,
    }))
    .sort((left, right) => left.placement - right.placement || left.screenName.localeCompare(right.screenName))
}
