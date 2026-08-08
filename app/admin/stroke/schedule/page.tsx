"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SeasonRow = {
  id: string
  league_type: string
  season_number: number
  due_date: string | null
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

type PostScheduleResponse = {
  success?: boolean
  error?: string
  posted_revision?: number
  succeeded_divisions?: number[]
  failed_divisions?: Array<{ division_number: number; error: string }>
}

const divisionThemes: Record<
  number,
  { background: string; border: string; accent: string }
> = {
  1: { background: "rgba(124, 45, 18, 0.18)", border: "#9a3412", accent: "#fb923c" },
  2: { background: "rgba(30, 64, 175, 0.16)", border: "#1d4ed8", accent: "#60a5fa" },
  3: { background: "rgba(20, 83, 45, 0.18)", border: "#15803d", accent: "#4ade80" },
  4: { background: "rgba(113, 63, 18, 0.18)", border: "#a16207", accent: "#facc15" },
  5: { background: "rgba(88, 28, 135, 0.18)", border: "#7e22ce", accent: "#c084fc" },
}

export default function StrokeScheduleReviewPage() {
  const router = useRouter()
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [roster, setRoster] = useState<RosterRow | null>(null)
  const [scheduleState, setScheduleState] = useState<ScheduleStateRow | null>(
    null
  )
  const [fixtures, setFixtures] = useState<FixtureRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [postMessage, setPostMessage] = useState("")
  const [postError, setPostError] = useState("")

  useEffect(() => {
    void loadSchedule()
  }, [])

  async function loadSchedule() {
    setLoading(true)
    setError("")

    const params = new URLSearchParams(window.location.search)
    const requestedSeasonId = params.get("seasonId")?.trim() || ""

    if (!requestedSeasonId) {
      setError("A seasonId is required to review a Stroke schedule.")
      setLoading(false)
      return
    }

    const { data: seasonData, error: seasonError } = await supabase
      .from("seasons")
      .select("id, league_type, season_number, due_date")
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

    if (selectedSeason.league_type.trim().toLowerCase() !== "stroke") {
      setError("The requested season is not a Stroke season.")
      setLoading(false)
      return
    }

    const { data: rosterData, error: rosterError } = await supabase
      .from("stroke_roster_versions")
      .select("id, division_count, status")
      .eq("season_id", requestedSeasonId)
      .in("status", ["draft", "approved", "locked"])

    if (rosterError) {
      setError(`Could not load the Stroke roster: ${rosterError.message}`)
      setLoading(false)
      return
    }

    const rosterVersions = (rosterData || []) as RosterRow[]
    const selectedRoster =
      rosterVersions.find((item) => item.status === "approved") ||
      rosterVersions.find((item) => item.status === "locked") ||
      rosterVersions.find((item) => item.status === "draft")

    if (!selectedRoster) {
      setError("No Stroke roster was found for this season.")
      setLoading(false)
      return
    }

    const [stateResponse, fixtureResponse] = await Promise.all([
      supabase
        .from("stroke_schedule_state")
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
        .eq("league_type", "stroke")
        .eq("season_id", requestedSeasonId)
        .order("division_number", { ascending: true })
        .order("game_number", { ascending: true })
        .order("id", { ascending: true }),
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

    setSeason(selectedSeason)
    setRoster(selectedRoster)
    setScheduleState(
      (stateResponse.data as ScheduleStateRow | null) || null
    )
    setFixtures((fixtureResponse.data || []) as FixtureRow[])
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
      .rpc("review_stroke_schedule", {
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
        ? "Stroke schedule reviewed and approved."
        : "This Stroke schedule was already reviewed."
    )
    setReviewing(false)
  }

  async function postScheduleToDiscord() {
    if (!season || !roster || !scheduleState) return

    const canPost =
      roster.status === "approved" &&
      scheduleState.generated_revision > 0 &&
      scheduleState.generated_revision === scheduleState.change_revision &&
      scheduleState.reviewed_revision === scheduleState.change_revision &&
      scheduleState.posted_revision !== scheduleState.change_revision

    if (!canPost) return

    setPosting(true)
    setPostMessage("")
    setPostError("")

    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      const session = data.session

      if (sessionError || !session) {
        setPostError("An authenticated administrator session is required.")
        return
      }

      const response = await fetch("/api/admin/stroke/post-schedule", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ season_id: season.id }),
      })
      const result = (await response.json().catch(() => ({}))) as PostScheduleResponse

      if (!response.ok || !result.success) {
        const succeeded = result.succeeded_divisions?.length
          ? ` Posted successfully: ${result.succeeded_divisions
              .map((divisionNumber) => `D${divisionNumber}`)
              .join(", ")}.`
          : ""
        const failed = result.failed_divisions?.length
          ? ` Failed: ${result.failed_divisions
              .map((item) => `D${item.division_number} (${item.error})`)
              .join(", ")}.`
          : ""

        setPostError(
          `${result.error || "Schedule posting failed."}${succeeded}${failed}`
        )
        return
      }

      await loadSchedule()
      setPostMessage("The current reviewed schedule was posted to Discord.")
    } catch {
      setPostError("The Discord posting request could not be completed.")
    } finally {
      setPosting(false)
    }
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
  const canPost = Boolean(
    roster?.status === "approved" && scheduleIsReviewed && !scheduleIsPosted
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
      return fixture.player1_name || fixture.player1 || fixture.player1_id
    }

    return fixture.player2_name || fixture.player2 || fixture.player2_id
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
                    `/admin/stroke/setup?seasonId=${encodeURIComponent(
                      season.id
                    )}&division=${roster.division_count}`
                  )
                : router.push("/admin/stroke")
            }
            style={primaryButton}
          >
            ← Stroke Setup
          </button>

          <button
            type="button"
            onClick={() => router.push("/admin/stroke")}
            style={secondaryButton}
          >
            ← Stroke Hub
          </button>
        </div>

        <h1>Review Stroke Schedule</h1>

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
                      Stroke D{divisionNumber}
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
                                <span>
                                  {playerName(fixture, 1)} vs {playerName(fixture, 2)}
                                </span>
                                <span>{fixture.course || "Course not set"}</span>
                                <span>{fixture.status || "assigned"}</span>
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
                  Schedule is stale — return to Stroke Setup and regenerate it before review.
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

              {canPost && (
                <button
                  type="button"
                  onClick={postScheduleToDiscord}
                  disabled={posting}
                  style={{
                    ...postButton,
                    opacity: posting ? 0.6 : 1,
                    cursor: posting ? "not-allowed" : "pointer",
                  }}
                >
                  {posting
                    ? "Posting Schedule to Discord..."
                    : "Post Schedule to Discord"}
                </button>
              )}

              {message && (
                <p role="status" style={successText}>
                  {message}
                </p>
              )}

              {postMessage && (
                <p role="status" style={successText}>
                  {postMessage}
                </p>
              )}

              {postError && (
                <p role="alert" style={errorText}>
                  {postError}
                </p>
              )}
            </section>
          </>
        )}
      </div>
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
  display: "grid",
  gridTemplateColumns: "minmax(240px, 2fr) minmax(160px, 1fr) 100px",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid #222",
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

const postButton: React.CSSProperties = {
  ...reviewButton,
  background: "#5865f2",
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
