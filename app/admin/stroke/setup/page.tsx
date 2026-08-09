"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

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

type RosterVersionRow = {
  id: string
  division_count: number
  status: "draft" | "approved" | "locked"
}

type RosterSlotRow = {
  id: string
  slot_number: number
  player_id: string | null
  player_screen_name: string | null
  slot_status: "empty" | "active"
}

type CourseOverrideRow = {
  game1_course_override: string | null
  game2_course_override: string | null
  game3_course_override: string | null
}

type SavedRosterSlotRow = RosterSlotRow & {
  roster_version_id: string
  season_id: string
  division_number: number
}

type SavedCourseOverrideRow = {
  season_id: string
  division_number: number
  game1_course_override: string | null
  game2_course_override: string | null
  game3_course_override: string | null
  game1_effective_course: string | null
  game2_effective_course: string | null
  game3_effective_course: string | null
}

type ScheduleStateRow = {
  change_revision: number
  generated_revision: number
  reviewed_revision: number
  posted_revision: number
}

type GeneratedScheduleRow = {
  fixture_count: number
  completed_fixture_count: number
  inserted_count: number
  updated_count: number
  deleted_count: number
  regeneration_performed: boolean
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

export default function StrokeSetup() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>([])
  const [savingRoster, setSavingRoster] = useState(false)
  const [rosterMessage, setRosterMessage] = useState("")
  const [rosterSaveError, setRosterSaveError] = useState(false)
  const [savingCourses, setSavingCourses] = useState(false)
  const [courseMessage, setCourseMessage] = useState("")
  const [courseSaveError, setCourseSaveError] = useState(false)
  const [editingCourseOverrides, setEditingCourseOverrides] = useState(false)
  const [scheduleState, setScheduleState] = useState<ScheduleStateRow | null>(
    null
  )
  const [workflowMessage, setWorkflowMessage] = useState("")
  const [workflowError, setWorkflowError] = useState(false)
  const [approvingRoster, setApprovingRoster] = useState(false)
  const [generatingSchedule, setGeneratingSchedule] = useState(false)

  const [loadingSetup, setLoadingSetup] = useState(true)
  const [setupError, setSetupError] = useState("")
  const [seasonId, setSeasonId] = useState("")
  const [rosterVersionId, setRosterVersionId] = useState("")
  const [rosterStatus, setRosterStatus] = useState<
    "draft" | "approved" | "locked" | ""
  >("")
  const [divisionNumber, setDivisionNumber] = useState(0)
  const [slotPlayerIds, setSlotPlayerIds] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ])
  const [loadedSlotPlayerIds, setLoadedSlotPlayerIds] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ])

  const [season, setSeason] = useState("")
  const [divisionCount, setDivisionCount] = useState("")
  const [division, setDivision] = useState("")

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const [c1, setC1] = useState("")
  const [c2, setC2] = useState("")
  const [c3, setC3] = useState("")
  const [game1Default, setGame1Default] = useState("")
  const [game2Default, setGame2Default] = useState("")
  const [game3Default, setGame3Default] = useState("")
  const [game1Override, setGame1Override] = useState("")
  const [game2Override, setGame2Override] = useState("")
  const [game3Override, setGame3Override] = useState("")
  const [loadedCourseOverrides, setLoadedCourseOverrides] = useState(["", "", ""])
  const [due, setDue] = useState("")

  const divisions = useMemo(() => {
    const count = Number(divisionCount)

    if (!Number.isInteger(count) || count < 1) {
      return []
    }

    return Array.from(
      { length: count },
      (_, index) => `Stroke D${index + 1}`
    )
  }, [divisionCount])

  useEffect(() => {
    void loadSetupData()
  }, [])

  const rosterHasUnsavedChanges = slotPlayerIds.some(
    (playerId, index) => playerId !== loadedSlotPlayerIds[index]
  )
  const coursesHaveUnsavedChanges = [game1Override, game2Override, game3Override].some(
    (course, index) => course !== loadedCourseOverrides[index]
  )
  const hasUnsavedChanges = rosterHasUnsavedChanges || coursesHaveUnsavedChanges

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (divisions.length === 0) return

    if (!divisions.includes(division)) {
      setDivision(divisions[0])
    }
  }, [division, divisions])

  async function loadScheduleState(
    selectedSeasonId: string,
    reportAsSetupError = false
  ) {
    const { data, error } = await supabase
      .from("stroke_schedule_state")
      .select(
        "change_revision, generated_revision, reviewed_revision, posted_revision"
      )
      .eq("season_id", selectedSeasonId)
      .maybeSingle()

    if (error) {
      const message = `Could not load schedule workflow state: ${error.message}`

      if (reportAsSetupError) {
        setSetupError(message)
        setLoadingSetup(false)
      } else {
        setWorkflowError(true)
        setWorkflowMessage(message)
      }

      return false
    }

    setScheduleState((data as ScheduleStateRow | null) || null)
    return true
  }

  async function loadSetupData(
    seasonIdOverride?: string,
    divisionOverride?: number
  ) {
    setLoadingSetup(true)
    setSetupError("")

    const params = new URLSearchParams(window.location.search)
    const requestedSeasonId =
      seasonIdOverride || params.get("seasonId")?.trim() || ""
    const requestedDivision =
      divisionOverride ?? Number(params.get("division"))

    if (!requestedSeasonId) {
      setSetupError("A seasonId is required to load Stroke setup.")
      setLoadingSetup(false)
      return
    }

    if (!Number.isInteger(requestedDivision) || requestedDivision <= 0) {
      setSetupError("Division must be a positive whole number.")
      setLoadingSetup(false)
      return
    }

    const { data: seasonData, error: seasonError } = await supabase
      .from("seasons")
      .select(
        "id, league_type, season_number, start_date, due_date, end_date, game1_course, game2_course, game3_course"
      )
      .eq("id", requestedSeasonId)
      .maybeSingle()

    if (seasonError) {
      setSetupError(`Could not load the season: ${seasonError.message}`)
      setLoadingSetup(false)
      return
    }

    if (!seasonData) {
      setSetupError("The requested season was not found.")
      setLoadingSetup(false)
      return
    }

    const selectedSeason = seasonData as SeasonRow

    if (selectedSeason.league_type !== "stroke") {
      setSetupError("The requested season is not a Stroke season.")
      setLoadingSetup(false)
      return
    }

    const { data: rosterData, error: rosterError } = await supabase
      .from("stroke_roster_versions")
      .select("id, division_count, status")
      .eq("season_id", requestedSeasonId)
      .in("status", ["draft", "approved", "locked"])

    if (rosterError) {
      setSetupError(`Could not load the Stroke roster: ${rosterError.message}`)
      setLoadingSetup(false)
      return
    }

    const rosterVersions = (rosterData || []) as RosterVersionRow[]
    const selectedRoster =
      rosterVersions.find((roster) => roster.status === "draft") ||
      rosterVersions.find((roster) => roster.status === "approved") ||
      rosterVersions.find((roster) => roster.status === "locked")

    if (!selectedRoster) {
      setSetupError("No draft or official Stroke roster was found for this season.")
      setLoadingSetup(false)
      return
    }

    if (!(await loadScheduleState(requestedSeasonId, true))) {
      return
    }

    if (requestedDivision > selectedRoster.division_count) {
      setSetupError(
        `Division must be between 1 and ${selectedRoster.division_count}.`
      )
      setLoadingSetup(false)
      return
    }

    const { data: slotData, error: slotError } = await supabase
      .from("stroke_division_roster_slots")
      .select(
        "id, slot_number, player_id, player_screen_name, slot_status"
      )
      .eq("roster_version_id", selectedRoster.id)
      .eq("division_number", requestedDivision)
      .order("slot_number", { ascending: true })

    if (slotError) {
      setSetupError(`Could not load roster slots: ${slotError.message}`)
      setLoadingSetup(false)
      return
    }

    const slots = (slotData || []) as RosterSlotRow[]
    const expectedSlotNumbers = [1, 2, 3, 4]
    const hasExactlyFourSlots =
      slots.length === 4 &&
      slots.every(
        (slot, index) => slot.slot_number === expectedSlotNumbers[index]
      )

    if (!hasExactlyFourSlots) {
      setSetupError(
        "This division does not have exactly four persistent roster slots."
      )
      setLoadingSetup(false)
      return
    }

    const { data: overrideData, error: overrideError } = await supabase
      .from("stroke_division_course_overrides")
      .select(
        "game1_course_override, game2_course_override, game3_course_override"
      )
      .eq("season_id", requestedSeasonId)
      .eq("division_number", requestedDivision)
      .maybeSingle()

    if (overrideError) {
      setSetupError(`Could not load course overrides: ${overrideError.message}`)
      setLoadingSetup(false)
      return
    }

    const overrides = overrideData as CourseOverrideRow | null
    const currentPlayerIds = slots
      .map((slot) => slot.player_id)
      .filter((playerId): playerId is string => Boolean(playerId))

    const { data: activePlayerData, error: activePlayerError } = await supabase
      .from("players")
      .select("id, screen_name")
      .eq("active", true)
      .order("screen_name")

    if (activePlayerError) {
      setSetupError(`Could not load players: ${activePlayerError.message}`)
      setLoadingSetup(false)
      return
    }

    let rosterPlayerData: Player[] = []

    if (currentPlayerIds.length > 0) {
      const { data, error } = await supabase
        .from("players")
        .select("id, screen_name")
        .in("id", currentPlayerIds)

      if (error) {
        setSetupError(`Could not load roster players: ${error.message}`)
        setLoadingSetup(false)
        return
      }

      rosterPlayerData = (data || []) as Player[]
    }

    const playerMap = new Map<string, Player>()
    ;([...(activePlayerData || []), ...rosterPlayerData] as Player[]).forEach(
      (player) => playerMap.set(player.id, player)
    )

    const loadedPlayers = Array.from(playerMap.values()).sort((a, b) =>
      a.screen_name.localeCompare(b.screen_name)
    )
    setPlayers(loadedPlayers)
    setSeasonId(selectedSeason.id)
    setRosterVersionId(selectedRoster.id)
    setRosterStatus(selectedRoster.status)
    setDivisionNumber(requestedDivision)
    setSeason(String(selectedSeason.season_number))
    setDivisionCount(String(selectedRoster.division_count))
    setDivision(`Stroke D${requestedDivision}`)
    setStartDate(selectedSeason.start_date || "")
    setDue(selectedSeason.due_date || "")
    setEndDate(selectedSeason.end_date || "")
    const defaultGame1 = selectedSeason.game1_course || ""
    const defaultGame2 = selectedSeason.game2_course || ""
    const defaultGame3 = selectedSeason.game3_course || ""
    const overrideGame1 = overrides?.game1_course_override || ""
    const overrideGame2 = overrides?.game2_course_override || ""
    const overrideGame3 = overrides?.game3_course_override || ""

    setGame1Default(defaultGame1)
    setGame2Default(defaultGame2)
    setGame3Default(defaultGame3)
    setGame1Override(overrideGame1)
    setGame2Override(overrideGame2)
    setGame3Override(overrideGame3)
    setLoadedCourseOverrides([overrideGame1, overrideGame2, overrideGame3])
    setC1(overrideGame1 || defaultGame1)
    setC2(overrideGame2 || defaultGame2)
    setC3(overrideGame3 || defaultGame3)
    setSlotPlayerIds(slots.map((slot) => slot.player_id))
    setLoadedSlotPlayerIds(slots.map((slot) => slot.player_id))
    setRosterMessage("")
    setRosterSaveError(false)
    setCourseMessage("")
    setCourseSaveError(false)
    setEditingCourseOverrides(false)
    setLoadingSetup(false)
  }

  function confirmNavigation(ignoreRosterChanges = false) {
    const changesWouldBeDiscarded =
      (!ignoreRosterChanges && rosterHasUnsavedChanges) || coursesHaveUnsavedChanges
    return (
      !changesWouldBeDiscarded ||
      window.confirm(
        "You have unsaved roster or course changes. Leave this division without saving them?"
      )
    )
  }

  function navigateToDivision(nextDivision: number, ignoreRosterChanges = false) {
    if (!seasonId || nextDivision < 1 || nextDivision > Number(divisionCount)) return false
    if (!confirmNavigation(ignoreRosterChanges)) return false

    const params = new URLSearchParams({
      seasonId,
      division: String(nextDivision),
    })
    router.push(`/admin/stroke/setup?${params.toString()}`)
    void loadSetupData(seasonId, nextDivision)
    return true
  }

  function navigateAway(path: string) {
    if (!confirmNavigation()) return
    router.push(path)
  }

  async function saveDivisionRoster() {
    if (!rosterVersionId || !seasonId || divisionNumber <= 0) {
      setRosterSaveError(true)
      setRosterMessage("The loaded roster context is incomplete.")
      return
    }

    setSavingRoster(true)
    setRosterSaveError(false)
    setRosterMessage("")

    const { data, error } = await supabase.rpc(
      "set_stroke_division_roster_slots",
      {
        p_roster_version_id: rosterVersionId,
        p_division_number: divisionNumber,
        p_slot1_player_id: slotPlayerIds[0],
        p_slot2_player_id: slotPlayerIds[1],
        p_slot3_player_id: slotPlayerIds[2],
        p_slot4_player_id: slotPlayerIds[3],
      }
    )

    if (error) {
      setRosterSaveError(true)
      setRosterMessage(`Roster was not saved: ${error.message}`)
      setSavingRoster(false)
      return
    }

    const savedSlots = ((data || []) as SavedRosterSlotRow[]).sort(
      (a, b) => a.slot_number - b.slot_number
    )

    if (
      savedSlots.length !== 4 ||
      savedSlots.some((slot, index) => slot.slot_number !== index + 1)
    ) {
      setRosterSaveError(true)
      setRosterMessage(
        "The roster was saved, but four authoritative slot rows were not returned."
      )
      setSavingRoster(false)
      return
    }

    setSlotPlayerIds(savedSlots.map((slot) => slot.player_id))
    setLoadedSlotPlayerIds(savedSlots.map((slot) => slot.player_id))

    const count = Number(divisionCount)
    const hasNextDivision = divisionNumber < count

    if (hasNextDivision) {
      const nextDivision = divisionNumber + 1
      const savedDivision = divisionNumber
      if (navigateToDivision(nextDivision, true)) {
        setRosterMessage(
          `Stroke D${savedDivision} roster saved. Stroke D${nextDivision} is ready.`
        )
      } else {
        setRosterMessage(
          `Stroke D${savedDivision} roster saved. Unsaved course changes remain on this division.`
        )
      }
    } else if (rosterStatus === "draft") {
      setRosterMessage(
        `Stroke D${divisionNumber} roster saved. This is the final division.`
      )
    } else {
      await loadScheduleState(seasonId)
      setRosterMessage(`Stroke D${divisionNumber} roster saved.`)
    }

    setRosterSaveError(false)
    setSavingRoster(false)
  }

  async function saveCourseOverrides() {
    if (!seasonId || divisionNumber <= 0) {
      setCourseSaveError(true)
      setCourseMessage("The loaded season and division are incomplete.")
      return
    }

    setSavingCourses(true)
    setCourseSaveError(false)
    setCourseMessage("")

    const { data, error } = await supabase
      .rpc("set_stroke_division_course_overrides", {
        p_season_id: seasonId,
        p_division_number: divisionNumber,
        p_game1_course: game1Override,
        p_game2_course: game2Override,
        p_game3_course: game3Override,
      })
      .single()

    if (error || !data) {
      setCourseSaveError(true)
      setCourseMessage(
        `Division courses were not saved: ${
          error?.message || "No course data was returned."
        }`
      )
      setSavingCourses(false)
      return
    }

    const savedCourses = data as SavedCourseOverrideRow

    setGame1Override(savedCourses.game1_course_override || "")
    setGame2Override(savedCourses.game2_course_override || "")
    setGame3Override(savedCourses.game3_course_override || "")
    setLoadedCourseOverrides([
      savedCourses.game1_course_override || "",
      savedCourses.game2_course_override || "",
      savedCourses.game3_course_override || "",
    ])
    setC1(savedCourses.game1_effective_course || "")
    setC2(savedCourses.game2_effective_course || "")
    setC3(savedCourses.game3_effective_course || "")
    if (rosterStatus === "approved") {
      await loadScheduleState(seasonId)
    }
    setCourseMessage(`Stroke D${divisionNumber} division courses were saved.`)
    setCourseSaveError(false)
    setSavingCourses(false)
  }

  async function approveRoster() {
    if (!rosterVersionId || !seasonId || rosterStatus !== "draft") return

    setApprovingRoster(true)
    setWorkflowError(false)
    setWorkflowMessage("")

    const { error } = await supabase
      .rpc("approve_stroke_roster_version", {
        p_roster_version_id: rosterVersionId,
        p_approval_note: null,
      })
      .single()

    if (error) {
      setWorkflowError(true)
      setWorkflowMessage(`Roster approval failed: ${error.message}`)
      setApprovingRoster(false)
      return
    }

    await loadSetupData(seasonId, divisionNumber)
    setWorkflowError(false)
    setWorkflowMessage(
      "Roster approved. Generate the schedule when you are ready."
    )
    setApprovingRoster(false)
  }

  async function generateSchedule() {
    if (!seasonId || rosterStatus !== "approved") return

    setGeneratingSchedule(true)
    setWorkflowError(false)
    setWorkflowMessage("")

    const { data, error } = await supabase
      .rpc("generate_stroke_schedule", {
        p_season_id: seasonId,
      })
      .single()

    if (error || !data) {
      setWorkflowError(true)
      setWorkflowMessage(
        `Schedule generation failed: ${
          error?.message || "No generation result was returned."
        }`
      )
      setGeneratingSchedule(false)
      return
    }

    const result = data as GeneratedScheduleRow
    await loadScheduleState(seasonId)
    setWorkflowError(false)
    setWorkflowMessage(
      `Schedule generated: ${result.fixture_count} fixtures (${result.inserted_count} inserted, ${result.updated_count} updated, ${result.deleted_count} deleted, ${result.completed_fixture_count} completed preserved).`
    )
    setGeneratingSchedule(false)
  }

  const isFinalDivision =
    divisionNumber > 0 && divisionNumber === Number(divisionCount)
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
  const scheduleStatus = !scheduleState || scheduleState.generated_revision === 0
    ? "Not Generated"
    : scheduleIsStale
      ? "Stale — Regeneration Required"
      : scheduleIsReviewed
        ? "Reviewed"
        : scheduleIsCurrent
          ? "Current — Needs Review"
          : "Not Generated"

  const hasDivisionCourseOverrides = Boolean(
    game1Override || game2Override || game3Override
  )
  const divisionTheme = divisionThemes[divisionNumber]

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button
            onClick={() => navigateAway("/admin/stroke")}
            style={backButtonPrimary}
          >
            ← Stroke Hub
          </button>

          <button
            onClick={() => navigateAway("/admin")}
            style={backButtonSecondary}
          >
            ← Admin
          </button>
        </div>

        <h1 style={{ fontSize: 36 }}>Stroke Setup</h1>

        {loadingSetup && <p style={helperText}>Loading Stroke setup...</p>}

        {setupError && (
          <p role="alert" style={errorText}>
            {setupError}
          </p>
        )}

        {!loadingSetup && !setupError && (
          <>
        <div
          style={
            divisionTheme
              ? {
                  ...activeDivisionCard,
                  background: divisionTheme.background,
                  borderColor: divisionTheme.border,
                }
              : activeDivisionCard
          }
        >
        <div style={activeDivisionHeader}>
          <span
            style={
              divisionTheme
                ? {
                    ...divisionBadge,
                    color: divisionTheme.accent,
                    borderColor: divisionTheme.border,
                  }
                : divisionBadge
            }
          >
            Stroke D{divisionNumber}
          </span>
          <div style={divisionNavigation}>
            {divisionNumber > 1 && (
              <button
                type="button"
                onClick={() => navigateToDivision(divisionNumber - 1)}
                style={backButtonSecondary}
              >
                ← Stroke D{divisionNumber - 1}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                navigateAway(
                  `/admin/stroke/season/edit?seasonId=${encodeURIComponent(seasonId)}`
                )
              }
              style={backButtonSecondary}
            >
              Back to Season
            </button>
            <button
              type="button"
              onClick={() =>
                navigateAway(
                  `/admin/stroke/schedule?seasonId=${encodeURIComponent(seasonId)}`
                )
              }
              style={backButtonPrimary}
            >
              View Schedule
            </button>
            {divisionNumber < Number(divisionCount) && (
              <button
                type="button"
                onClick={() => navigateToDivision(divisionNumber + 1)}
                style={backButtonSecondary}
              >
                Stroke D{divisionNumber + 1} →
              </button>
            )}
          </div>
        </div>

        <section style={section}>
          <h2>Season</h2>

          <div style={row}>
            <input
              value={`Season ${season}`}
              readOnly
              aria-label="Season"
              style={input}
            />

            <input
              type="number"
              min="1"
              max="20"
              step="1"
              value={divisionCount}
              readOnly
              placeholder="Number of Divisions"
              aria-label="Number of Divisions"
              style={input}
            />

            <select
              value={division}
              onChange={(event) => {
                const nextDivision = divisions.indexOf(event.target.value) + 1

                if (nextDivision < 1) return

                navigateToDivision(nextDivision)
              }}
              style={input}
            >
              {divisions.map((divisionName) => (
                <option key={divisionName} value={divisionName}>
                  {divisionName}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={due}
              readOnly
              style={input}
            />
          </div>

          <p style={helperText}>
            Season dates: {startDate || "Not set"} through {endDate || "Not set"}.
            Division {divisionNumber} of {divisionCount} is loaded from roster {rosterVersionId} with {slotPlayerIds.filter(Boolean).length} real players.
          </p>
        </section>

        <section style={section}>
          <h2>Players</h2>

          <div style={grid}>
            {slotPlayerIds.map((playerId, index) => (
              <select
                key={index}
                value={playerId || ""}
                onChange={(event) => {
                  const selectedPlayerId = event.target.value || null
                  setSlotPlayerIds((currentIds) =>
                    currentIds.map((currentPlayerId, slotIndex) =>
                      slotIndex === index
                        ? selectedPlayerId
                        : currentPlayerId
                    )
                  )
                }}
                disabled={rosterStatus === "locked"}
                style={input}
              >
                <option value="">Player {index + 1}</option>

                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.screen_name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </section>

        <section style={section}>
          <div style={courseHeader}>
            <h2 style={courseHeading}>Courses</h2>

            <button
              type="button"
              onClick={() => setEditingCourseOverrides((current) => !current)}
              style={overrideCoursesButton}
            >
              {editingCourseOverrides
                ? "Close Overrides"
                : "Override Season Courses"}
            </button>
          </div>

          <div style={grid}>
            {[
              {
                game: 1,
                effectiveCourse: c1,
              },
              {
                game: 2,
                effectiveCourse: c2,
              },
              {
                game: 3,
                effectiveCourse: c3,
              },
            ].map((course) => (
              <div key={course.game} style={courseDisplayCard}>
                <p style={courseGameLabel}>Game {course.game}</p>
                <p style={courseName}>
                  {course.effectiveCourse || "Not set"}
                </p>
              </div>
            ))}
          </div>

          {hasDivisionCourseOverrides && (
            <p style={overrideNotice}>
              Division-specific course overrides are active.
            </p>
          )}

          {editingCourseOverrides && (
            <div style={courseOverrideEditor}>
              <div style={grid}>
                {[
                  {
                    game: 1,
                    defaultCourse: game1Default,
                    overrideCourse: game1Override,
                    setOverrideCourse: setGame1Override,
                  },
                  {
                    game: 2,
                    defaultCourse: game2Default,
                    overrideCourse: game2Override,
                    setOverrideCourse: setGame2Override,
                  },
                  {
                    game: 3,
                    defaultCourse: game3Default,
                    overrideCourse: game3Override,
                    setOverrideCourse: setGame3Override,
                  },
                ].map((course) => (
                  <div key={course.game}>
                    <label style={fieldLabel}>
                      Game {course.game} Override
                    </label>
                    <input
                      value={course.overrideCourse}
                      onChange={(event) =>
                        course.setOverrideCourse(event.target.value)
                      }
                      placeholder="Use season default"
                      disabled={rosterStatus === "locked"}
                      style={input}
                    />
                    <p style={courseHelpText}>
                      Season default: {course.defaultCourse || "Not set"}
                    </p>
                  </div>
                ))}
              </div>

              <p style={helperText}>
                Leave an override blank to use the season default for that game.
              </p>

              <button
                type="button"
                onClick={saveCourseOverrides}
                disabled={savingCourses || rosterStatus === "locked"}
                style={{
                  ...courseButton,
                  opacity:
                    savingCourses || rosterStatus === "locked" ? 0.6 : 1,
                  cursor:
                    savingCourses || rosterStatus === "locked"
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {savingCourses ? "Saving Courses..." : "Save Division Courses"}
              </button>
            </div>
          )}

          {courseMessage && (
            <p
              role={courseSaveError ? "alert" : "status"}
              style={courseSaveError ? errorText : successText}
            >
              {courseMessage}
            </p>
          )}
        </section>

        <button
          onClick={saveDivisionRoster}
          disabled={savingRoster || rosterStatus === "locked"}
          style={{
            ...button,
            opacity: savingRoster || rosterStatus === "locked" ? 0.6 : 1,
            cursor:
              savingRoster || rosterStatus === "locked"
                ? "not-allowed"
                : "pointer",
          }}
        >
          {savingRoster ? "Saving Roster..." : "Save Division Roster"}
        </button>

        {rosterMessage && (
          <p
            role={rosterSaveError ? "alert" : "status"}
            style={rosterSaveError ? errorText : successText}
          >
            {rosterMessage}
          </p>
        )}

        {isFinalDivision && (
          <section style={workflowPanel}>
            <h2>Season Workflow</h2>

            <div style={workflowStatusGrid}>
              <div>
                <strong>Roster</strong>
                <p style={workflowValue}>
                  {rosterStatus
                    ? rosterStatus.charAt(0).toUpperCase() + rosterStatus.slice(1)
                    : "Unknown"}
                </p>
              </div>

              <div>
                <strong>Schedule</strong>
                <p style={workflowValue}>{scheduleStatus}</p>
              </div>
            </div>

            {scheduleState && (
              <p style={helperText}>
                Revision {scheduleState.change_revision}; generated {scheduleState.generated_revision}; reviewed {scheduleState.reviewed_revision}.
              </p>
            )}

            {rosterStatus === "draft" && (
              <>
                <p style={helperText}>
                  Save every division before explicitly approving the roster.
                </p>
                <button
                  type="button"
                  onClick={approveRoster}
                  disabled={approvingRoster}
                  style={{
                    ...button,
                    opacity: approvingRoster ? 0.6 : 1,
                    cursor: approvingRoster ? "not-allowed" : "pointer",
                  }}
                >
                  {approvingRoster ? "Approving Roster..." : "Approve Roster"}
                </button>
              </>
            )}

            {rosterStatus === "approved" && (
              <div style={workflowActions}>
                {(!scheduleState ||
                  scheduleState.generated_revision === 0 ||
                  scheduleIsStale) && (
                  <button
                    type="button"
                    onClick={generateSchedule}
                    disabled={generatingSchedule}
                    style={{
                      ...button,
                      marginTop: 0,
                      opacity: generatingSchedule ? 0.6 : 1,
                      cursor: generatingSchedule ? "not-allowed" : "pointer",
                    }}
                  >
                    {generatingSchedule
                      ? "Generating Schedule..."
                      : scheduleIsStale
                        ? "Regenerate Schedule"
                        : "Generate Schedule"}
                  </button>
                )}

                {scheduleState && scheduleState.generated_revision > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      navigateAway(
                        `/admin/stroke/schedule?seasonId=${encodeURIComponent(
                          seasonId
                        )}`
                      )
                    }
                    style={{ ...backButtonPrimary, width: "100%" }}
                  >
                    View Schedule
                  </button>
                )}
              </div>
            )}

            {rosterStatus === "locked" && (
              <p style={helperText}>
                This historical roster is locked. Workflow actions are unavailable.
              </p>
            )}

            {workflowMessage && (
              <p
                role={workflowError ? "alert" : "status"}
                style={workflowError ? errorText : successText}
              >
                {workflowMessage}
              </p>
            )}
          </section>
        )}
        </div>
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
  maxWidth: 1200,
  padding: 30,
}

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
}

const backButtonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  border: "none",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const backButtonSecondary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#222",
  border: "1px solid #555",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const section: React.CSSProperties = {
  marginTop: 30,
}

const activeDivisionCard: React.CSSProperties = {
  marginTop: 22,
  padding: 22,
  border: "1px solid #333",
  borderRadius: 14,
  background: "#080808",
}

const activeDivisionHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
}

const divisionNavigation: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: 8,
}

const divisionBadge: React.CSSProperties = {
  display: "inline-flex",
  padding: "7px 11px",
  border: "1px solid #555",
  borderRadius: 999,
  color: "#ddd",
  background: "rgba(0, 0, 0, 0.35)",
  fontSize: 15,
  fontWeight: 800,
}

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 16,
}

const input: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: 12,
  background: "#111",
  border: "1px solid #444",
  color: "white",
  borderRadius: 8,
}

const helperText: React.CSSProperties = {
  marginTop: 10,
  color: "#aaa",
  fontSize: 14,
}

const errorText: React.CSSProperties = {
  marginTop: 20,
  padding: 12,
  color: "#fca5a5",
  background: "#1f0a0a",
  border: "1px solid #7f1d1d",
  borderRadius: 8,
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontWeight: 700,
}

const courseHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 16,
}

const courseHeading: React.CSSProperties = {
  margin: 0,
}

const overrideCoursesButton: React.CSSProperties = {
  width: "auto",
  padding: "7px 11px",
  border: "1px solid #666",
  borderRadius: 8,
  background: "transparent",
  color: "#ddd",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

const courseDisplayCard: React.CSSProperties = {
  padding: 16,
  border: "1px solid #444",
  borderRadius: 10,
  background: "#080808",
}

const courseGameLabel: React.CSSProperties = {
  margin: 0,
  color: "#aaa",
  fontSize: 14,
  fontWeight: 700,
}

const courseName: React.CSSProperties = {
  margin: "8px 0 0",
  color: "white",
  fontSize: 18,
  fontWeight: 700,
}

const overrideNotice: React.CSSProperties = {
  margin: "14px 0 0",
  color: "#facc15",
  fontWeight: 700,
}

const courseOverrideEditor: React.CSSProperties = {
  marginTop: 18,
  paddingTop: 18,
  borderTop: "1px solid #444",
}

const courseHelpText: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#aaa",
  fontSize: 14,
  lineHeight: 1.5,
}

const successText: React.CSSProperties = {
  marginTop: 20,
  padding: 12,
  color: "#bbf7d0",
  background: "#052e16",
  border: "1px solid #166534",
  borderRadius: 8,
}

const button: React.CSSProperties = {
  marginTop: 30,
  padding: 14,
  width: "100%",
  background: "#16a34a",
  border: "none",
  borderRadius: 10,
  color: "white",
  fontWeight: 700,
}

const courseButton: React.CSSProperties = {
  ...button,
  marginTop: 16,
  background: "#2563eb",
}

const workflowPanel: React.CSSProperties = {
  ...section,
  padding: 20,
  background: "#111",
  border: "1px solid #444",
  borderRadius: 10,
}

const workflowStatusGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
  marginTop: 16,
}

const workflowValue: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#d1d5db",
}

const workflowActions: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 20,
}
