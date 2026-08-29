import { createClient } from "@supabase/supabase-js"

type MonthlyPlayer = { screen_name: string | null } | null

type MonthlyObservationRow = {
  canonical_player_id: string
  period_year: number
  period_month: number
  division: string
  course_name: string
  difficulty: "easy" | "hard"
  score: number
  hole_in_ones: number | null
  course_placement: number | null
  course_points: number | null
  overall_placement: number | null
  courses_played: number | null
  total_strokes: number | null
  overall_hole_in_ones: number | null
  overall_points: number | null
  player: MonthlyPlayer | MonthlyPlayer[]
}

type MonthlyMetadataRow = {
  period_year: number
  period_month: number
  division: string
}

type PeriodOption = {
  year: number
  month: number
  divisions: string[]
}

function publicMonthlyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Public Monthly server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function playerName(player: MonthlyObservationRow["player"]) {
  const joined = Array.isArray(player) ? player[0] : player
  return joined?.screen_name || "Unknown player"
}

async function loadAvailablePeriods(supabase: ReturnType<typeof publicMonthlyClient>) {
  const metadata: MonthlyMetadataRow[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("historical_monthly_score_observations")
      .select("period_year, period_month, division")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .order("division")
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    const page = (data ?? []) as MonthlyMetadataRow[]
    metadata.push(...page)
    if (page.length < pageSize) break
  }

  const periodMap = new Map<string, PeriodOption>()
  for (const row of metadata) {
    const key = `${row.period_year}-${row.period_month}`
    const period = periodMap.get(key) || { year: row.period_year, month: row.period_month, divisions: [] }
    if (!period.divisions.includes(row.division)) period.divisions.push(row.division)
    periodMap.set(key, period)
  }
  return Array.from(periodMap.values()).map(period => ({ ...period, divisions: period.divisions.sort((left, right) => left.localeCompare(right)) }))
    .sort((left, right) => right.year - left.year || right.month - left.month)
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams
    const playerId = searchParams.get("playerId")
    if (playerId && !isUuid(playerId)) {
      return Response.json({ error: "playerId must be a canonical Global Player UUID." }, { status: 400 })
    }

    const supabase = publicMonthlyClient()
    const availablePeriods = await loadAvailablePeriods(supabase)
    const rows: MonthlyObservationRow[] = []
    const pageSize = 1000
    const requestedYear = positiveInteger(searchParams.get("year"))
    const requestedMonth = positiveInteger(searchParams.get("month"))
    const requestedDivision = searchParams.get("division")?.trim() || ""
    const latest = availablePeriods[0]
    const selectedPeriod = playerId ? null : availablePeriods.find(period =>
      period.year === (requestedYear || latest?.year) && period.month === (requestedMonth || latest?.month)
    ) || (requestedYear ? availablePeriods.find(period => period.year === requestedYear) : null) || latest
    const selectedDivision = selectedPeriod && !playerId
      ? selectedPeriod.divisions.find(division => division === requestedDivision) || selectedPeriod.divisions[0] || ""
      : ""

    for (let offset = 0; ; offset += pageSize) {
      let query = supabase
        .from("historical_monthly_score_observations")
        .select("canonical_player_id, period_year, period_month, division, course_name, difficulty, score, hole_in_ones, course_placement, course_points, overall_placement, courses_played, total_strokes, overall_hole_in_ones, overall_points, player:players(screen_name)")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .order("division")
        .order("course_name")
        .order("difficulty")
        .range(offset, offset + pageSize - 1)

      if (playerId) {
        query = query.eq("canonical_player_id", playerId)
      } else if (selectedPeriod) {
        query = query.eq("period_year", selectedPeriod.year).eq("period_month", selectedPeriod.month).eq("division", selectedDivision)
      }

      const { data, error } = await query
      if (error) throw error
      const page = (data ?? []) as MonthlyObservationRow[]
      rows.push(...page)
      if (page.length < pageSize) break
    }

    return Response.json({
      availablePeriods,
      selected: selectedPeriod && !playerId ? { year: selectedPeriod.year, month: selectedPeriod.month, division: selectedDivision } : undefined,
      rows: rows.map(row => ({
        canonicalPlayerId: row.canonical_player_id,
        playerName: playerName(row.player),
        year: row.period_year,
        month: row.period_month,
        division: row.division,
        courseName: row.course_name,
        difficulty: row.difficulty,
        score: row.score,
        holeInOnes: row.hole_in_ones,
        coursePlacement: row.course_placement,
        coursePoints: row.course_points,
        overallPlacement: row.overall_placement,
        coursesPlayed: row.courses_played,
        totalStrokes: row.total_strokes,
        overallHoleInOnes: row.overall_hole_in_ones,
        overallPoints: row.overall_points,
      })),
    }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Public Monthly history could not be loaded."
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
