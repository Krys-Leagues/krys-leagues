"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SeasonRow = {
  id: string
  league_type: string
  season_number: number
  start_date: string | null
  due_date: string | null
  end_date: string | null
  game1_course: string | null
  game2_course: string | null
  game3_course: string | null
}

type RosterRow = {
  id: string
  division_count: number
  status: "draft" | "approved" | "locked"
}

type ScheduleStateRow = {
  change_revision: number
  generated_revision: number
  reviewed_revision: number
  posted_revision: number
}

type FixtureRow = {
  id: string
  division_number: number
  division: string | null
  game_number: number
  game: string | null
  course: string | null
  player1: string | null
  player2: string | null
  player1_name: string | null
  player2_name: string | null
  player1_id: string
  player2_id: string
  status: string | null
  due_date: string | null
}

type ReviewResultRow = {
  review_performed: boolean
}

type GeneratedScheduleRow = {
  fixture_count: number
  completed_fixture_count: number
  inserted_count: number
  updated_count: number
  deleted_count: number
}

type RosterSlotRow = {
  division_number: number
  slot_number: number
  player_id: string | null
  player_screen_name: string | null
}

type CourseOverrideRow = {
  division_number: number
  game1_course_override: string | null
  game2_course_override: string | null
  game3_course_override: string | null
}

type ScheduleImageGame = {
  gameNumber: number
  course: string
  fixtures: string[]
  byeLine: string | null
}

type ScheduleImageData = {
  seasonNumber: number
  divisionNumber: number
  dateRange: string
  accent: string
  games: ScheduleImageGame[]
}

const divisionThemes: Record<
  number,
  { background: string; border: string; accent: string }
> = {
  1: { background: "rgba(124, 45, 18, 0.18)", border: "#9a3412", accent: "#fb923c" },
  2: { background: "rgba(20, 83, 45, 0.18)", border: "#15803d", accent: "#4ade80" },
  3: { background: "rgba(30, 64, 175, 0.16)", border: "#1d4ed8", accent: "#60a5fa" },
  4: { background: "rgba(113, 63, 18, 0.18)", border: "#a16207", accent: "#facc15" },
  5: { background: "rgba(88, 28, 135, 0.18)", border: "#7e22ce", accent: "#c084fc" },
}

const canvasFont = '"Segoe UI", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'

function formatDate(value: string | null) {
  if (!value) return "Date not set"
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day))
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const corner = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + corner, y)
  context.lineTo(x + width - corner, y)
  context.quadraticCurveTo(x + width, y, x + width, y + corner)
  context.lineTo(x + width, y + height - corner)
  context.quadraticCurveTo(x + width, y + height, x + width - corner, y + height)
  context.lineTo(x + corner, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - corner)
  context.lineTo(x, y + corner)
  context.quadraticCurveTo(x, y, x + corner, y)
  context.closePath()
}

function fitText(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
  startingSize: number,
  minimumSize = 20,
  weight = 600
) {
  let size = startingSize
  do {
    context.font = `${weight} ${size}px ${canvasFont}`
    if (context.measureText(value).width <= maximumWidth) return size
    size -= 1
  } while (size > minimumSize)
  return minimumSize
}

function renderScheduleImage(data: ScheduleImageData) {
  const width = 1080
  const gameHeights = data.games.map(
    (game) => 142 + Math.max(game.fixtures.length, 1) * 56 + (game.byeLine ? 42 : 0)
  )
  const height = 280 + gameHeights.reduce((total, value) => total + value, 0) + 86
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("This browser could not create the schedule image.")

  const background = context.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, "#07090d")
  background.addColorStop(0.55, "#10141b")
  background.addColorStop(1, "#080a0f")
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  const headerBottom = 248
  context.save()
  roundedRect(context, 22, 22, width - 44, height - 44, 28)
  context.clip()
  context.globalAlpha = 0.11
  context.fillStyle = data.accent
  context.fillRect(22, 22, width - 44, headerBottom - 22)
  context.globalAlpha = 1
  const headerShade = context.createLinearGradient(22, 22, width - 22, headerBottom)
  headerShade.addColorStop(0, "rgba(3, 6, 11, 0.18)")
  headerShade.addColorStop(0.55, "rgba(8, 12, 18, 0.48)")
  headerShade.addColorStop(1, "rgba(3, 6, 11, 0.24)")
  context.fillStyle = headerShade
  context.fillRect(22, 22, width - 44, headerBottom - 22)
  context.restore()

  context.save()
  context.strokeStyle = data.accent
  context.lineCap = "round"
  context.lineWidth = 6
  context.beginPath()
  context.moveTo(50, 25)
  context.lineTo(width - 50, 25)
  context.stroke()
  context.globalAlpha = 0.42
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(52, headerBottom)
  context.lineTo(width - 52, headerBottom)
  context.stroke()
  context.restore()

  context.strokeStyle = data.accent
  context.lineWidth = 5
  roundedRect(context, 22, 22, width - 44, height - 44, 28)
  context.stroke()

  context.fillStyle = data.accent
  context.font = `800 24px ${canvasFont}`
  context.fillText("KRYS LEAGUES  /  MATCH", 68, 78)
  context.fillStyle = "#f8fafc"
  context.font = `800 56px ${canvasFont}`
  context.fillText(`SEASON ${data.seasonNumber}`, 68, 145)
  context.fillStyle = data.accent
  const divisionLabel = `DIVISION ${data.divisionNumber}`
  const divisionSize = fitText(context, divisionLabel, 340, 46, 30, 900)
  context.font = `900 ${divisionSize}px ${canvasFont}`
  context.textAlign = "right"
  context.fillText(divisionLabel, 1012, 145)
  context.textAlign = "left"
  context.fillStyle = "#cbd5e1"
  context.font = `500 27px ${canvasFont}`
  context.fillText(data.dateRange, 68, 192)
  context.fillStyle = "#94a3b8"
  context.font = `700 21px ${canvasFont}`
  context.fillText("REVIEWED SCHEDULE", 68, 234)

  let top = 265
  data.games.forEach((game, index) => {
    const blockHeight = gameHeights[index]
    context.fillStyle = "rgba(255, 255, 255, 0.035)"
    roundedRect(context, 52, top, 976, blockHeight - 18, 20)
    context.fill()
    context.strokeStyle = "rgba(255, 255, 255, 0.10)"
    context.lineWidth = 1
    context.stroke()

    context.fillStyle = data.accent
    context.font = `800 27px ${canvasFont}`
    context.fillText(`GAME ${game.gameNumber}`, 84, top + 49)
    context.fillStyle = "#f8fafc"
    const courseSize = fitText(context, game.course, 620, 31, 21, 700)
    context.font = `700 ${courseSize}px ${canvasFont}`
    context.textAlign = "right"
    context.fillText(game.course, 996, top + 49)
    context.textAlign = "left"

    let lineY = top + 104
    const lines = game.fixtures.length ? game.fixtures : ["No real-player fixture"]
    lines.forEach((fixtureLine) => {
      context.fillStyle = game.fixtures.length ? "#e2e8f0" : "#94a3b8"
      const lineSize = fitText(context, fixtureLine, 880, 28, 18, 600)
      context.font = `600 ${lineSize}px ${canvasFont}`
      context.fillText(fixtureLine, 84, lineY)
      lineY += 56
    })

    if (game.byeLine) {
      context.fillStyle = "#94a3b8"
      const byeSize = fitText(context, game.byeLine, 880, 22, 17, 500)
      context.font = `500 ${byeSize}px ${canvasFont}`
      context.fillText(game.byeLine, 84, lineY + 2)
    }
    top += blockHeight
  })

  context.fillStyle = "#64748b"
  context.font = `500 19px ${canvasFont}`
  context.textAlign = "center"
  context.fillText("Official reviewed schedule • Save and share in Discord", width / 2, height - 48)
  context.textAlign = "left"
  return canvas
}

export default function MatchScheduleReviewPage() {
  const router = useRouter()
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [roster, setRoster] = useState<RosterRow | null>(null)
  const [scheduleState, setScheduleState] = useState<ScheduleStateRow | null>(
    null
  )
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [rosterSlots, setRosterSlots] = useState<RosterSlotRow[]>([])
  const [courseOverrides, setCourseOverrides] = useState<CourseOverrideRow[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [previewDivision, setPreviewDivision] = useState<number | null>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState("")
  const [renderingDivision, setRenderingDivision] = useState<number | null>(null)
  const [imageError, setImageError] = useState("")

  useEffect(() => {
    void loadSchedule()
  }, [])

  async function loadSchedule() {
    setLoading(true)
    setError("")

    const params = new URLSearchParams(window.location.search)
    const requestedSeasonId = params.get("seasonId")?.trim() || ""

    if (!requestedSeasonId) {
      setError("A seasonId is required to review a Match schedule.")
      setLoading(false)
      return
    }

    const { data: seasonData, error: seasonError } = await supabase
      .from("seasons")
      .select(
        "id, league_type, season_number, start_date, due_date, end_date, game1_course, game2_course, game3_course"
      )
      .eq("id", requestedSeasonId)
      .maybeSingle()

    if (seasonError || !seasonData) {
      setError(
        `Could not load the season: ${
          seasonError?.message || "Season not found."
        }`
      )
      setLoading(false)
      return
    }

    const selectedSeason = seasonData as SeasonRow

    if (selectedSeason.league_type.trim().toLowerCase() !== "match") {
      setError("The requested season is not a Match season.")
      setLoading(false)
      return
    }

    const { data: rosterData, error: rosterError } = await supabase
      .from("match_roster_versions")
      .select("id, division_count, status")
      .eq("season_id", requestedSeasonId)
      .in("status", ["draft", "approved", "locked"])

    if (rosterError) {
      setError(`Could not load the Match roster: ${rosterError.message}`)
      setLoading(false)
      return
    }

    const rosterVersions = (rosterData || []) as RosterRow[]
    const selectedRoster =
      rosterVersions.find((item) => item.status === "approved") ||
      rosterVersions.find((item) => item.status === "locked") ||
      rosterVersions.find((item) => item.status === "draft")

    if (!selectedRoster) {
      setError("No Match roster was found for this season.")
      setLoading(false)
      return
    }

    const [stateResponse, fixtureResponse, slotResponse, overrideResponse] = await Promise.all([
      supabase
        .from("match_schedule_state")
        .select(
          "change_revision, generated_revision, reviewed_revision, posted_revision"
        )
        .eq("season_id", requestedSeasonId)
        .maybeSingle(),
      supabase
        .from("schedule")
        .select(
          "id, division_number, division, game_number, game, course, player1, player2, player1_name, player2_name, player1_id, player2_id, status, due_date"
        )
        .eq("league_type", "match")
        .eq("season_id", requestedSeasonId)
        .eq("match_roster_version_id", selectedRoster.id)
        .order("division_number", { ascending: true })
        .order("game_number", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("match_division_roster_slots")
        .select("division_number, slot_number, player_id, player_screen_name")
        .eq("roster_version_id", selectedRoster.id)
        .order("division_number", { ascending: true })
        .order("slot_number", { ascending: true }),
      supabase
        .from("match_division_course_overrides")
        .select(
          "division_number, game1_course_override, game2_course_override, game3_course_override"
        )
        .eq("season_id", requestedSeasonId)
        .order("division_number", { ascending: true }),
    ])

    if (stateResponse.error) {
      setError(
        `Could not load schedule workflow state: ${stateResponse.error.message}`
      )
      setLoading(false)
      return
    }

    if (fixtureResponse.error) {
      setError(`Could not load schedule fixtures: ${fixtureResponse.error.message}`)
      setLoading(false)
      return
    }

    if (slotResponse.error) {
      setError(`Could not load roster slots for schedule images: ${slotResponse.error.message}`)
      setLoading(false)
      return
    }

    if (overrideResponse.error) {
      setError(`Could not load division courses for schedule images: ${overrideResponse.error.message}`)
      setLoading(false)
      return
    }

    const loadedFixtures = (fixtureResponse.data || []) as FixtureRow[]
    setSeason(selectedSeason)
    setRoster(selectedRoster)
    setScheduleState(
      (stateResponse.data as ScheduleStateRow | null) || null
    )
    setFixtures(loadedFixtures)
    setRosterSlots((slotResponse.data || []) as RosterSlotRow[])
    setCourseOverrides((overrideResponse.data || []) as CourseOverrideRow[])
    setLoading(false)
  }

  async function reviewSchedule() {
    if (!season || !roster || !scheduleState) return

    const canReview =
      roster.status === "approved" &&
      scheduleState.generated_revision > 0 &&
      scheduleState.generated_revision === scheduleState.change_revision &&
      scheduleState.reviewed_revision < scheduleState.generated_revision

    if (!canReview) return

    setReviewing(true)
    setError("")
    setMessage("")

    const { data, error: reviewError } = await supabase
      .rpc("review_match_schedule", {
        p_season_id: season.id,
      })
      .single()

    if (reviewError || !data) {
      setError(
        `Schedule review failed: ${
          reviewError?.message || "No review result was returned."
        }`
      )
      setReviewing(false)
      return
    }

    const result = data as ReviewResultRow
    await loadSchedule()
    setMessage(
      result.review_performed
        ? "Match schedule reviewed and approved."
        : "This Match schedule was already reviewed."
    )
    setReviewing(false)
  }

  async function generateSchedule() {
    if (!season || roster?.status !== "approved" || generating) return

    setGenerating(true)
    setError("")
    setMessage("")

    const { data, error: generationError } = await supabase
      .rpc("generate_match_schedule", {
        p_season_id: season.id,
      })
      .single()

    if (generationError || !data) {
      setError(
        `Schedule generation failed: ${
          generationError?.message || "No generation result was returned."
        }`
      )
      setGenerating(false)
      return
    }

    const result = data as GeneratedScheduleRow
    await loadSchedule()
    setMessage(
      `Schedule generated: ${result.fixture_count} fixtures (${result.inserted_count} inserted, ${result.updated_count} updated, ${result.deleted_count} deleted, ${result.completed_fixture_count} completed preserved).`
    )
    setGenerating(false)
  }

  const divisionNumbers = useMemo(() => {
    if (!roster) return []
    return Array.from({ length: roster.division_count }, (_, index) => index + 1)
  }, [roster])

  const scheduleIsCurrent = Boolean(
    scheduleState &&
      scheduleState.generated_revision > 0 &&
      scheduleState.generated_revision === scheduleState.change_revision
  )
  const scheduleIsStale = Boolean(
    scheduleState &&
      scheduleState.generated_revision > 0 &&
      scheduleState.generated_revision < scheduleState.change_revision
  )
  const scheduleIsReviewed = Boolean(
    scheduleState &&
      scheduleState.generated_revision > 0 &&
      scheduleState.reviewed_revision === scheduleState.generated_revision &&
      scheduleState.generated_revision === scheduleState.change_revision
  )
  const canReview = Boolean(
    roster?.status === "approved" &&
      scheduleState &&
      scheduleState.generated_revision > 0 &&
      scheduleState.generated_revision === scheduleState.change_revision &&
      scheduleState.reviewed_revision < scheduleState.generated_revision
  )
  const scheduleIsPosted = Boolean(
    scheduleState &&
      scheduleIsReviewed &&
      scheduleState.posted_revision === scheduleState.change_revision
  )
  const scheduleStatus = !scheduleState || scheduleState.generated_revision === 0
    ? "Not Generated"
    : scheduleIsStale
      ? "Stale — Regeneration Required"
      : scheduleIsReviewed
        ? "Reviewed"
        : scheduleIsCurrent
          ? "Current — Needs Review"
          : "Not Generated"

  function playerName(fixture: FixtureRow, playerNumber: 1 | 2) {
    if (playerNumber === 1) {
      return fixture.player1_name || fixture.player1 || "Player name unavailable"
    }

    return fixture.player2_name || fixture.player2 || "Player name unavailable"
  }

  function fixtureDisplay(fixture: FixtureRow) {
    return `${playerName(fixture, 1)}  vs  ${playerName(fixture, 2)}`
  }

  function scheduleImageData(divisionNumber: number): ScheduleImageData {
    if (!season) throw new Error("Season details are not available.")

    const divisionSlots = rosterSlots
      .filter((slot) => slot.division_number === divisionNumber && slot.player_id)
      .sort((left, right) => left.slot_number - right.slot_number)
    const divisionFixtures = fixtures.filter(
      (fixture) => fixture.division_number === divisionNumber
    )
    const override = courseOverrides.find(
      (item) => item.division_number === divisionNumber
    )
    const defaults = [season.game1_course, season.game2_course, season.game3_course]
    const overrides = [
      override?.game1_course_override,
      override?.game2_course_override,
      override?.game3_course_override,
    ]

    const games = [1, 2, 3].map((gameNumber): ScheduleImageGame => {
      const gameFixtures = divisionFixtures.filter(
        (fixture) => fixture.game_number === gameNumber
      )
      const course =
        gameFixtures.find((fixture) => fixture.course?.trim())?.course?.trim() ||
        overrides[gameNumber - 1]?.trim() ||
        defaults[gameNumber - 1]?.trim() ||
        "Course not set"
      const fixtureLines = gameFixtures.map((fixture) => fixtureDisplay(fixture))
      let byeLine: string | null = null

      if (divisionSlots.length === 3) {
        const playingIds = new Set(
          gameFixtures.flatMap((fixture) => [fixture.player1_id, fixture.player2_id])
        )
        const byePlayer = divisionSlots.find(
          (slot) => slot.player_id && !playingIds.has(slot.player_id)
        )
        if (byePlayer?.player_screen_name) {
          byeLine = `BYE — ${byePlayer.player_screen_name}`
        }
      } else if (divisionSlots.length === 2 && gameFixtures.length === 0) {
        byeLine = "BYE round — no real-player fixture"
      } else if (divisionSlots.length === 1) {
        byeLine = `${divisionSlots[0].player_screen_name || "Rostered player"} — BYE`
      } else if (divisionSlots.length === 0) {
        byeLine = "No rostered players"
      }

      return {
        gameNumber,
        course,
        fixtures: fixtureLines,
        byeLine,
      }
    })

    return {
      seasonNumber: season.season_number,
      divisionNumber,
      dateRange: `${formatDate(season.start_date)} — ${formatDate(
        season.end_date || season.due_date
      )}`,
      accent: divisionThemes[divisionNumber]?.accent || "#94a3b8",
      games,
    }
  }

  function previewScheduleImage(divisionNumber: number) {
    if (!scheduleIsReviewed) return
    setImageError("")
    try {
      const imageUrl = renderScheduleImage(scheduleImageData(divisionNumber)).toDataURL(
        "image/png"
      )
      setPreviewDivision(divisionNumber)
      setPreviewImageUrl(imageUrl)
    } catch (imageRenderError) {
      setImageError(
        imageRenderError instanceof Error
          ? imageRenderError.message
          : "The schedule image could not be created."
      )
    }
  }

  async function downloadScheduleImage(divisionNumber: number) {
    if (!season || !scheduleIsReviewed || renderingDivision !== null) return
    setRenderingDivision(divisionNumber)
    setImageError("")
    try {
      const canvas = renderScheduleImage(scheduleImageData(divisionNumber))
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value)
          else reject(new Error("The schedule image could not be exported."))
        }, "image/png")
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `match-s${season.season_number}-d${divisionNumber}-schedule.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (imageRenderError) {
      setImageError(
        imageRenderError instanceof Error
          ? imageRenderError.message
          : "The schedule image could not be downloaded."
      )
    } finally {
      setRenderingDivision(null)
    }
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button
            type="button"
            onClick={() =>
              season && roster
                ? router.push(
                    `/admin/match/setup?seasonId=${encodeURIComponent(
                      season.id
                    )}&division=${roster.division_count}`
                  )
                : router.push("/admin/match")
            }
            style={primaryButton}
          >
            ← Match Setup
          </button>

          <button
            type="button"
            onClick={() => router.push("/admin/match")}
            style={secondaryButton}
          >
            ← Match Hub
          </button>
        </div>

        <h1>Review Match Schedule</h1>

        {loading && <p style={mutedText}>Loading managed schedule...</p>}

        {error && (
          <p role="alert" style={errorText}>
            {error}
          </p>
        )}

        {!loading && season && roster && (
          <>
            <section style={panel}>
              <h2>Season {season.season_number}</h2>
              <p style={statusLine}>
                Roster: {roster.status.charAt(0).toUpperCase() + roster.status.slice(1)}
              </p>
              <p style={statusLine}>Schedule: {scheduleStatus}</p>
              {scheduleState && (
                <p style={mutedText}>
                  Revision {scheduleState.change_revision}; generated {scheduleState.generated_revision}; reviewed {scheduleState.reviewed_revision}.
                </p>
              )}
            </section>

            <section style={panel}>
              <h2>Generated Fixtures</h2>

              {fixtures.length === 0 && (
                <p style={mutedText}>
                  No real-player fixtures were generated. This is valid when divisions contain fewer than two real players.
                </p>
              )}

              {divisionNumbers.map((divisionNumber) => {
                const divisionFixtures = fixtures.filter(
                  (fixture) => fixture.division_number === divisionNumber
                )
                const divisionTheme = divisionThemes[divisionNumber]

                return (
                  <div
                    key={divisionNumber}
                    style={
                      divisionTheme
                        ? {
                            ...divisionSection,
                            background: divisionTheme.background,
                            borderColor: divisionTheme.border,
                          }
                        : divisionSection
                    }
                  >
                    <h3
                      style={
                        divisionTheme
                          ? { ...divisionHeading, color: divisionTheme.accent }
                          : divisionHeading
                      }
                    >
                      Match D{divisionNumber}
                    </h3>

                    {divisionFixtures.length === 0 ? (
                      <p style={mutedText}>No real-player fixtures.</p>
                    ) : (
                      [1, 2, 3].map((gameNumber) => {
                        const gameFixtures = divisionFixtures.filter(
                          (fixture) => fixture.game_number === gameNumber
                        )

                        if (gameFixtures.length === 0) return null

                        return (
                          <div key={gameNumber} style={gameSection}>
                            <h4>Game {gameNumber}</h4>
                            {gameFixtures.map((fixture) => (
                              <div key={fixture.id} style={fixtureRow}>
                                <span style={fixtureMatchup}>{fixtureDisplay(fixture)}</span>
                                <span>{fixture.course || "Course not set"}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </section>

            <section style={panel}>
              <h2>Schedule Review</h2>

              {scheduleIsStale && (
                <p style={warningText}>
                  Schedule is stale — return to Match Setup and regenerate it before review.
                </p>
              )}

              {scheduleIsReviewed && (
                <p style={successText}>Reviewed</p>
              )}

              {scheduleIsPosted && (
                <p style={successText}>Posted to Discord</p>
              )}

              {!scheduleState || scheduleState.generated_revision === 0 ? (
                <p style={mutedText}>Generate the schedule before reviewing it.</p>
              ) : null}

              {roster.status === "locked" && (
                <p style={mutedText}>
                  This historical roster is locked. Review actions are unavailable.
                </p>
              )}

              {roster.status === "approved" &&
                (!scheduleState ||
                  scheduleState.generated_revision === 0 ||
                  scheduleIsStale) && (
                  <button
                    type="button"
                    onClick={() => void generateSchedule()}
                    disabled={generating}
                    style={{
                      ...reviewButton,
                      background: "#2563eb",
                      opacity: generating ? 0.6 : 1,
                      cursor: generating ? "not-allowed" : "pointer",
                    }}
                  >
                    {generating
                      ? "Generating Schedule..."
                      : scheduleIsStale
                        ? "Regenerate Schedule"
                        : "Generate Schedule"}
                  </button>
                )}

              {canReview && (
                <button
                  type="button"
                  onClick={reviewSchedule}
                  disabled={reviewing}
                  style={{
                    ...reviewButton,
                    opacity: reviewing ? 0.6 : 1,
                    cursor: reviewing ? "not-allowed" : "pointer",
                  }}
                >
                  {reviewing ? "Reviewing Schedule..." : "Review Schedule"}
                </button>
              )}

              {message && (
                <p role="status" style={successText}>
                  {message}
                </p>
              )}
            </section>

            {scheduleIsReviewed && (
              <section style={panel}>
                <h2>Schedule Images</h2>
                <p style={mutedText}>
                  Download a division schedule image and post it manually to that division&apos;s Discord channel.
                </p>

                <div style={imageGrid}>
                  {divisionNumbers.map((divisionNumber) => {
                    const divisionTheme = divisionThemes[divisionNumber]
                    const isRendering = renderingDivision === divisionNumber
                    return (
                      <div
                        key={divisionNumber}
                        style={{
                          ...imageCard,
                          background: divisionTheme?.background || "#0b0b0b",
                          borderColor: divisionTheme?.border || "#333",
                        }}
                      >
                        <div>
                          <strong style={{ color: divisionTheme?.accent || "#ddd" }}>
                            Match D{divisionNumber}
                          </strong>
                          <div style={imageCardStatus}>Reviewed Schedule</div>
                        </div>
                        <div style={imageActions}>
                          <button
                            type="button"
                            onClick={() => previewScheduleImage(divisionNumber)}
                            style={imageSecondaryButton}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => void downloadScheduleImage(divisionNumber)}
                            disabled={renderingDivision !== null}
                            style={{
                              ...imageDownloadButton,
                              opacity: renderingDivision !== null ? 0.6 : 1,
                              cursor: renderingDivision !== null ? "not-allowed" : "pointer",
                            }}
                          >
                            {isRendering
                              ? "Creating PNG..."
                              : `Download Match D${divisionNumber} Image`}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {imageError && (
                  <p role="alert" style={errorText}>
                    {imageError}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {previewDivision !== null && previewImageUrl && (
        <div style={previewOverlay} role="dialog" aria-modal="true" aria-label={`Match D${previewDivision} schedule image preview`}>
          <div style={previewPanel}>
            <div style={previewHeader}>
              <div>
                <strong>Match D{previewDivision} Schedule Image</strong>
                <div style={imageCardStatus}>Preview of the downloadable PNG</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewDivision(null)
                  setPreviewImageUrl("")
                }}
                style={imageSecondaryButton}
              >
                Close
              </button>
            </div>
            {/* Canvas-generated data URLs are intentionally previewed directly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImageUrl}
              alt={`Reviewed Match D${previewDivision} schedule`}
              style={previewImage}
            />
            <div style={previewFooter}>
              <button
                type="button"
                onClick={() => void downloadScheduleImage(previewDivision)}
                disabled={renderingDivision !== null}
                style={imageDownloadButton}
              >
                Download Match D{previewDivision} Image
              </button>
              {divisionNumbers.indexOf(previewDivision) < divisionNumbers.length - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = divisionNumbers.indexOf(previewDivision)
                    previewScheduleImage(divisionNumbers[currentIndex + 1])
                  }}
                  style={imageSecondaryButton}
                >
                  Next Division →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  display: "flex",
  justifyContent: "center",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  padding: 30,
}

const topBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 20,
}

const primaryButton: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  border: "none",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const secondaryButton: React.CSSProperties = {
  ...primaryButton,
  background: "#222",
  border: "1px solid #555",
}

const panel: React.CSSProperties = {
  marginTop: 24,
  padding: 20,
  background: "#111",
  border: "1px solid #444",
  borderRadius: 10,
}

const statusLine: React.CSSProperties = {
  margin: "8px 0",
  fontWeight: 700,
}

const mutedText: React.CSSProperties = {
  color: "#aaa",
  lineHeight: 1.5,
}

const divisionSection: React.CSSProperties = {
  marginTop: 24,
  padding: 18,
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0b0b0b",
}

const divisionHeading: React.CSSProperties = {
  margin: 0,
  color: "#ddd",
}

const gameSection: React.CSSProperties = {
  marginTop: 16,
}

const fixtureRow: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "minmax(240px, 2fr) minmax(160px, 1fr)",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #222",
}

const fixtureMatchup: React.CSSProperties = {
  display: "block",
}

const reviewButton: React.CSSProperties = {
  marginTop: 16,
  width: "100%",
  padding: 14,
  background: "#16a34a",
  border: "none",
  borderRadius: 10,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const errorText: React.CSSProperties = {
  marginTop: 20,
  padding: 12,
  color: "#fca5a5",
  background: "#1f0a0a",
  border: "1px solid #7f1d1d",
  borderRadius: 8,
}

const warningText: React.CSSProperties = {
  ...errorText,
  color: "#fde68a",
  background: "#2a1f05",
  border: "1px solid #92400e",
}

const successText: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  color: "#bbf7d0",
  background: "#052e16",
  border: "1px solid #166534",
  borderRadius: 8,
}

const imageGrid: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 18,
}

const imageCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 14,
  padding: 16,
  border: "1px solid #333",
  borderRadius: 10,
}

const imageCardStatus: React.CSSProperties = {
  marginTop: 4,
  color: "#94a3b8",
  fontSize: 13,
}

const imageActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
}

const imageSecondaryButton: React.CSSProperties = {
  padding: "9px 13px",
  color: "#e2e8f0",
  background: "#171717",
  border: "1px solid #525252",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
}

const imageDownloadButton: React.CSSProperties = {
  padding: "9px 13px",
  color: "white",
  background: "#2563eb",
  border: "1px solid #3b82f6",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
}

const previewOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0, 0, 0, 0.86)",
}

const previewPanel: React.CSSProperties = {
  width: "min(1120px, 100%)",
  maxHeight: "94vh",
  overflowY: "auto",
  padding: 18,
  background: "#101010",
  border: "1px solid #444",
  borderRadius: 12,
}

const previewHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
}

const previewImage: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  marginBottom: 14,
  borderRadius: 10,
  border: "1px solid #333",
}

const previewFooter: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 10,
}
