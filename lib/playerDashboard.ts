export type MatchDashboardAssignment = {
  game_number: number
  opponent_screen_name: string | null
  course: string | null
  status: "completed" | "remaining"
  completed: boolean
  due_date: string | null
}

export type MatchDashboardResult = {
  game_number: number
  opponent_screen_name: string | null
  course: string | null
  player_holes_won: number
  opponent_holes_won: number
  outcome: "win" | "loss" | "draw"
}

export type MatchDashboardLeague = {
  rostered: boolean
  season_number: number | null
  season_due_date: string | null
  division_number: number | null
  starting_rank: number | null
  current_rank: number | null
  displayed_rank: number | null
  results_started: boolean
  played: number
  wins: number
  losses: number
  draws: number
  points: number
  holes_won: number
  remaining_count: number
  assignments: MatchDashboardAssignment[]
  results: MatchDashboardResult[]
}

export type DashboardLeagueKey = "match" | "stroke" | "pyp" | "amateur-pro" | "doubles" | "skins"

export type DashboardLeagueState = {
  rostered: boolean
}

export type DashboardLeagueStates = Partial<Record<DashboardLeagueKey, DashboardLeagueState>> & {
  match: MatchDashboardLeague
}

export type DashboardLeagueOption = {
  key: DashboardLeagueKey
  label: string
}

export type PlayerDashboardPayload = {
  player: {
    screen_name: string
  }
  leagues: DashboardLeagueStates
}

const DASHBOARD_LEAGUE_OPTIONS: readonly DashboardLeagueOption[] = [
  { key: "match", label: "Match Play" },
  { key: "stroke", label: "Stroke" },
  { key: "pyp", label: "PYP" },
  { key: "amateur-pro", label: "Amateur to Pro" },
  { key: "doubles", label: "Doubles" },
  { key: "skins", label: "Skins" },
]

export function currentDashboardLeagues(leagues: DashboardLeagueStates) {
  return DASHBOARD_LEAGUE_OPTIONS.filter((option) => leagues[option.key]?.rostered === true)
}

export function selectedDashboardLeague(
  requested: DashboardLeagueKey | null,
  available: DashboardLeagueOption[],
) {
  return available.some((option) => option.key === requested) ? requested : available[0]?.key ?? null
}

const MATCH_DIVISION_ACCENTS: Record<number, string> = {
  1: "#fb923c",
  2: "#4ade80",
  3: "#60a5fa",
  4: "#facc15",
  5: "#c084fc",
}

export function matchDivisionAccent(divisionNumber: number) {
  return MATCH_DIVISION_ACCENTS[divisionNumber] || "#cbd5e1"
}

export function formatDashboardDate(value: string | null) {
  if (!value) return null
  const parts = value.slice(0, 10).split("-").map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null
  const [year, month, day] = parts
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date)
}
