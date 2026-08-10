import { ManagedLeaguePlayersPage } from "@/components/admin/ManagedLeaguePlayersPage"

export default function MatchSeasonPlayersPage() {
  return <ManagedLeaguePlayersPage leagueKey="match" leagueName="Match" rosterTable="match_roster_versions" slotTable="match_division_roster_slots" />
}
