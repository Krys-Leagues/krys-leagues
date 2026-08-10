import { ManagedLeaguePlayersPage } from "@/components/admin/ManagedLeaguePlayersPage"

export default function StrokeSeasonPlayersPage() {
  return <ManagedLeaguePlayersPage leagueKey="stroke" leagueName="Stroke" rosterTable="stroke_roster_versions" slotTable="stroke_division_roster_slots" />
}
