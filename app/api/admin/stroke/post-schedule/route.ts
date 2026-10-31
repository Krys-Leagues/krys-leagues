import { createClient } from "@supabase/supabase-js"

type SeasonRow = {
  id: string
  league_type: string
  season_number: number
  due_date: string | null
}

type RosterRow = {
  id: string
  division_count: number
  status: string
}

type ScheduleStateRow = {
  change_revision: number
  generated_revision: number
  reviewed_revision: number
  posted_revision: number
}

type FixtureRow = {
  division_number: number
  game_number: number
  course: string | null
  player1_id: string
  player2_id: string
  player1: string | null
  player2: string | null
  player1_name: string | null
  player2_name: string | null
  status: string | null
}

type PlayerRow = {
  id: string
  discord_id: string | null
}

function getStrokeWebhook(divisionNumber: number) {
  const webhooks: Record<number, string | undefined> = {
    1: process.env.DISCORD_WEBHOOK_STROKE_D1,
    2: process.env.DISCORD_WEBHOOK_STROKE_D2,
    3: process.env.DISCORD_WEBHOOK_STROKE_D3,
    4: process.env.DISCORD_WEBHOOK_STROKE_D4,
    5: process.env.DISCORD_WEBHOOK_STROKE_D5,
  }

  return webhooks[divisionNumber]
}

function formatDate(value: string | null) {
  if (!value) return "Not set"

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}

function displayPlayer(
  playerId: string,
  snapshot: string | null,
  discordIds: Map<string, string>
) {
  const discordId = discordIds.get(playerId)
  return discordId ? `<@${discordId}>` : snapshot || playerId
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || ""
  const [scheme, accessToken] = authorization.split(" ")

  if (scheme?.toLowerCase() !== "bearer" || !accessToken) {
    return Response.json(
      { error: "Authentication is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(
    accessToken
  )

  if (userError || !userData.user) {
    return Response.json(
      { error: "The authenticated session is invalid." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }

  const { data: authorized, error: authorizationError } = await supabase.rpc(
    "is_current_user_site_admin"
  )

  if (authorizationError) {
    return Response.json(
      { error: "Administrator authorization could not be verified." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }

  if (!authorized) {
    return Response.json(
      { error: "Administrator authorization is required." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    )
  }

  let body: { season_id?: unknown }

  try {
    body = (await request.json()) as { season_id?: unknown }
  } catch {
    return Response.json({ error: "A valid request body is required." }, { status: 400 })
  }

  const seasonId =
    typeof body.season_id === "string" ? body.season_id.trim() : ""

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seasonId)) {
    return Response.json({ error: "A valid season ID is required." }, { status: 400 })
  }

  const [seasonResponse, rosterResponse, stateResponse] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, league_type, season_number, due_date")
      .eq("id", seasonId)
      .maybeSingle(),
    supabase
      .from("stroke_roster_versions")
      .select("id, division_count, status")
      .eq("season_id", seasonId)
      .eq("status", "approved"),
    supabase
      .from("stroke_schedule_state")
      .select(
        "change_revision, generated_revision, reviewed_revision, posted_revision"
      )
      .eq("season_id", seasonId)
      .maybeSingle(),
  ])

  if (seasonResponse.error || !seasonResponse.data) {
    return Response.json(
      { error: seasonResponse.error?.message || "Stroke season was not found." },
      { status: 404 }
    )
  }

  const season = seasonResponse.data as SeasonRow

  if (season.league_type?.trim().toLowerCase() !== "stroke") {
    return Response.json({ error: "The requested season is not Stroke." }, { status: 400 })
  }

  if (rosterResponse.error) {
    return Response.json(
      { error: `Approved roster could not be loaded: ${rosterResponse.error.message}` },
      { status: 500 }
    )
  }

  const rosters = (rosterResponse.data || []) as RosterRow[]

  if (rosters.length !== 1) {
    return Response.json(
      { error: "Exactly one approved managed Stroke roster is required." },
      { status: 409 }
    )
  }

  if (stateResponse.error || !stateResponse.data) {
    return Response.json(
      { error: stateResponse.error?.message || "Schedule workflow state was not found." },
      { status: 409 }
    )
  }

  const roster = rosters[0]
  const scheduleState = stateResponse.data as ScheduleStateRow

  if (
    scheduleState.generated_revision <= 0 ||
    scheduleState.generated_revision !== scheduleState.change_revision ||
    scheduleState.reviewed_revision !== scheduleState.change_revision
  ) {
    return Response.json(
      { error: "The Stroke schedule must be current and reviewed before posting." },
      { status: 409 }
    )
  }

  if (scheduleState.posted_revision === scheduleState.change_revision) {
    return Response.json(
      { error: "This Stroke schedule revision was already posted to Discord." },
      { status: 409 }
    )
  }

  const missingDestinations = Array.from(
    { length: roster.division_count },
    (_, index) => index + 1
  ).filter((divisionNumber) => !getStrokeWebhook(divisionNumber))

  if (missingDestinations.length > 0) {
    return Response.json(
      {
        error: `Missing Discord destination for: ${missingDestinations
          .map((divisionNumber) => `Stroke D${divisionNumber}`)
          .join(", ")}.`,
      },
      { status: 500 }
    )
  }

  const { data: fixtureData, error: fixtureError } = await supabase
    .from("schedule")
    .select(
      "division_number, game_number, course, player1_id, player2_id, player1, player2, player1_name, player2_name, status"
    )
    .eq("league_type", "stroke")
    .eq("season_id", seasonId)
    .eq("roster_version_id", roster.id)
    .order("division_number", { ascending: true })
    .order("game_number", { ascending: true })

  if (fixtureError) {
    return Response.json(
      { error: `Managed Stroke fixtures could not be loaded: ${fixtureError.message}` },
      { status: 500 }
    )
  }

  const fixtures = (fixtureData || []) as FixtureRow[]

  if (
    fixtures.some(
      (fixture) =>
        !fixture.player1_id ||
        !fixture.player2_id ||
        fixture.player1_id === fixture.player2_id ||
        fixture.division_number < 1 ||
        fixture.division_number > roster.division_count ||
        fixture.game_number < 1 ||
        fixture.game_number > 3
    )
  ) {
    return Response.json(
      { error: "The managed Stroke schedule contains an invalid fixture." },
      { status: 409 }
    )
  }

  const playerIds = Array.from(
    new Set(fixtures.flatMap((fixture) => [fixture.player1_id, fixture.player2_id]))
  )
  const discordIds = new Map<string, string>()

  if (playerIds.length > 0) {
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .select("id, discord_id")
      .in("id", playerIds)

    if (playerError) {
      return Response.json(
        { error: `Player Discord identities could not be loaded: ${playerError.message}` },
        { status: 500 }
      )
    }

    for (const player of (playerData || []) as PlayerRow[]) {
      const discordId = player.discord_id?.trim()
      if (discordId && /^\d+$/.test(discordId)) {
        discordIds.set(player.id, discordId)
      }
    }
  }

  const succeededDivisions: number[] = []
  const failedDivisions: Array<{ division_number: number; error: string }> = []

  for (let divisionNumber = 1; divisionNumber <= roster.division_count; divisionNumber++) {
    const divisionFixtures = fixtures.filter(
      (fixture) => fixture.division_number === divisionNumber
    )
    const fields = [1, 2, 3].map((gameNumber) => {
      const gameFixtures = divisionFixtures.filter(
        (fixture) => fixture.game_number === gameNumber
      )
      const value = gameFixtures.length
        ? gameFixtures
            .map((fixture) => {
              const player1 = displayPlayer(
                fixture.player1_id,
                fixture.player1_name || fixture.player1,
                discordIds
              )
              const player2 = displayPlayer(
                fixture.player2_id,
                fixture.player2_name || fixture.player2,
                discordIds
              )
              return `${player1} vs ${player2}\nCourse: ${fixture.course || "Not set"}`
            })
            .join("\n\n")
        : "No real-player fixtures."

      return { name: `Game ${gameNumber}`, value, inline: false }
    })
    const webhookUrl = getStrokeWebhook(divisionNumber)!

    try {
      const discordResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Krys League Bot",
          embeds: [
            {
              title: `Stroke D${divisionNumber} • Season ${season.season_number}`,
              description: `Complete all games by ${formatDate(season.due_date)}.`,
              color: 3447003,
              fields,
            },
          ],
        }),
      })

      if (!discordResponse.ok) {
        failedDivisions.push({
          division_number: divisionNumber,
          error: `Discord returned status ${discordResponse.status}.`,
        })
      } else {
        succeededDivisions.push(divisionNumber)
      }
    } catch {
      failedDivisions.push({
        division_number: divisionNumber,
        error: "Discord could not be reached.",
      })
    }
  }

  if (failedDivisions.length > 0) {
    return Response.json(
      {
        error: "The schedule was not posted to every required division.",
        succeeded_divisions: succeededDivisions,
        failed_divisions: failedDivisions,
      },
      { status: 502 }
    )
  }

  const { data: postedState, error: postedStateError } = await supabase
    .rpc("mark_stroke_schedule_posted", { p_season_id: seasonId })
    .single()

  if (postedStateError || !postedState) {
    return Response.json(
      {
        error: `Discord delivery succeeded, but posted revision tracking failed: ${
          postedStateError?.message || "No state was returned."
        }`,
        succeeded_divisions: succeededDivisions,
        failed_divisions: [],
      },
      { status: 500 }
    )
  }

  return Response.json({
    success: true,
    posted_revision: scheduleState.change_revision,
    succeeded_divisions: succeededDivisions,
    failed_divisions: [],
  })
}
