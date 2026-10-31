import { ManagedLeaguePlayersPage } from "@/components/admin/ManagedLeaguePlayersPage"

export default function PypSeasonPlayersPage() {
  return <ManagedLeaguePlayersPage leagueKey="pyp" leagueName="PYP" rosterTable="pyp_roster_versions" slotTable="pyp_division_roster_slots" />
}
