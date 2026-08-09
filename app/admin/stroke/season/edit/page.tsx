"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SeasonRow = {
  id: string
  season_number: number
  is_active: boolean
  start_date: string | null
  due_date: string | null
  end_date: string | null
  game1_course: string | null
  game2_course: string | null
  game3_course: string | null
}

type RosterVersionRow = {
  id: string
  season_id: string
  division_count: number
  status: "draft" | "approved" | "locked"
}

type SavedSeasonDetails = {
  season_id: string
  season_number: number
  division_count: number
  roster_status: "draft" | "approved" | "locked"
  start_date: string
  due_date: string
  end_date: string
  game1_course: string
  game2_course: string
  game3_course: string
  schedule_changes_detected: boolean
  change_revision: number
}

const LEAGUE_TYPE = "stroke"

export default function EditCurrentStrokeSeasonPage() {
  const router = useRouter()

  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [rosterVersions, setRosterVersions] = useState<RosterVersionRow[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState("")
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsMessage, setDetailsMessage] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [game1Course, setGame1Course] = useState("")
  const [game2Course, setGame2Course] = useState("")
  const [game3Course, setGame3Course] = useState("")

  useEffect(() => {
    async function loadStrokeSeasons() {
      setLoading(true)
      setErrorMessage("")

      const { data: seasonData, error: seasonError } = await supabase
        .from("seasons")
        .select(
          "id, season_number, is_active, start_date, due_date, end_date, game1_course, game2_course, game3_course"
        )
        .eq("league_type", LEAGUE_TYPE)
        .is("division", null)
        .order("is_active", { ascending: false })
        .order("season_number", { ascending: false })

      if (seasonError) {
        setErrorMessage(`Could not load Stroke seasons: ${seasonError.message}`)
        setLoading(false)
        return
      }

      const loadedSeasons = (seasonData || []) as SeasonRow[]

      if (loadedSeasons.length === 0) {
        setSeasons([])
        setRosterVersions([])
        setSelectedSeasonId("")
        setLoading(false)
        return
      }

      const { data: rosterData, error: rosterError } = await supabase
        .from("stroke_roster_versions")
        .select("id, season_id, division_count, status")
        .in(
          "season_id",
          loadedSeasons.map((season) => season.id)
        )
        .in("status", ["draft", "approved", "locked"])

      if (rosterError) {
        setErrorMessage(
          `Could not load Stroke roster versions: ${rosterError.message}`
        )
        setLoading(false)
        return
      }

      setSeasons(loadedSeasons)
      setRosterVersions((rosterData || []) as RosterVersionRow[])
      setSelectedSeasonId(loadedSeasons[0].id)
      setLoading(false)
    }

    void loadStrokeSeasons()
  }, [])

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === selectedSeasonId) || null,
    [seasons, selectedSeasonId]
  )

  useEffect(() => {
    if (!selectedSeason) return

    setStartDate(selectedSeason.start_date || "")
    setEndDate(selectedSeason.end_date || selectedSeason.due_date || "")
    setGame1Course(selectedSeason.game1_course || "")
    setGame2Course(selectedSeason.game2_course || "")
    setGame3Course(selectedSeason.game3_course || "")
    setDetailsMessage("")
  }, [selectedSeason])

  const selectedRoster = useMemo(() => {
    const versions = rosterVersions.filter(
      (roster) => roster.season_id === selectedSeasonId
    )

    return (
      versions.find((roster) => roster.status === "draft") ||
      versions.find((roster) => roster.status === "approved") ||
      versions.find((roster) => roster.status === "locked") ||
      null
    )
  }, [rosterVersions, selectedSeasonId])

  const divisions = useMemo(() => {
    if (!selectedRoster) return []

    return Array.from(
      { length: selectedRoster.division_count },
      (_, index) => index + 1
    )
  }, [selectedRoster])

  function openDivision(divisionNumber: number) {
    if (!selectedSeason) return

    const params = new URLSearchParams({
      seasonId: selectedSeason.id,
      division: String(divisionNumber),
    })

    router.push(`/admin/stroke/setup?${params.toString()}`)
  }

  function resetSeasonDetails() {
    if (!selectedSeason) return

    setStartDate(selectedSeason.start_date || "")
    setEndDate(selectedSeason.end_date || selectedSeason.due_date || "")
    setGame1Course(selectedSeason.game1_course || "")
    setGame2Course(selectedSeason.game2_course || "")
    setGame3Course(selectedSeason.game3_course || "")
    setDetailsMessage("")
  }

  async function saveSeasonDetails() {
    if (!selectedSeason || !selectedRoster || selectedRoster.status === "locked") return

    setDetailsMessage("")

    if (!startDate) {
      setDetailsMessage("Choose a start date.")
      return
    }

    if (!endDate) {
      setDetailsMessage("Choose an end date.")
      return
    }

    if (endDate < startDate) {
      setDetailsMessage("End date cannot be before the start date.")
      return
    }

    if (!game1Course.trim() || !game2Course.trim() || !game3Course.trim()) {
      setDetailsMessage("Game 1, Game 2, and Game 3 courses are required.")
      return
    }

    setSavingDetails(true)

    const { data, error } = await supabase
      .rpc("update_stroke_season_details", {
        p_season_id: selectedSeason.id,
        p_start_date: startDate,
        p_end_date: endDate,
        p_game1_course: game1Course.trim(),
        p_game2_course: game2Course.trim(),
        p_game3_course: game3Course.trim(),
      })
      .single()

    setSavingDetails(false)

    if (error || !data) {
      setDetailsMessage(
        `Stroke season changes were not saved: ${error?.message || "No saved season data was returned."}`
      )
      return
    }

    const saved = data as SavedSeasonDetails

    setSeasons((current) =>
      current.map((season) =>
        season.id === saved.season_id
          ? {
              ...season,
              start_date: saved.start_date,
              due_date: saved.due_date,
              end_date: saved.end_date,
              game1_course: saved.game1_course,
              game2_course: saved.game2_course,
              game3_course: saved.game3_course,
            }
          : season
      )
    )
    setStartDate(saved.start_date)
    setEndDate(saved.end_date)
    setGame1Course(saved.game1_course)
    setGame2Course(saved.game2_course)
    setGame3Course(saved.game3_course)
    setDetailsMessage(
      saved.schedule_changes_detected
        ? "Season changes saved. Schedule changes detected. Regenerate and review the schedule."
        : "Season changes saved."
    )
  }

  const rosterIsLocked = selectedRoster?.status === "locked"

  return (
    <main style={page}>
      <div style={container}>
        <nav style={topBar} aria-label="Stroke admin navigation">
          <Link href="/admin/stroke/season" style={backButtonPrimary}>
            ← Stroke Season
          </Link>
          <Link href="/admin/stroke" style={backButtonSecondary}>
            ← Stroke Hub
          </Link>
        </nav>

        <h1 style={title}>
          {selectedSeason
            ? `Edit Stroke Season ${selectedSeason.season_number}`
            : "Edit Current Stroke Season"}
        </h1>
        <p style={subtitle}>
          Select an existing season, then choose the division that needs editing.
        </p>

        <section style={panel}>
          <h2 style={sectionTitle}>SELECT SEASON</h2>

          {loading ? (
            <p style={mutedText}>Loading Stroke seasons...</p>
          ) : errorMessage ? (
            <p role="alert" style={errorText}>
              {errorMessage}
            </p>
          ) : seasons.length === 0 ? (
            <p style={mutedText}>No Stroke seasons were found.</p>
          ) : (
            <label style={fieldLabel}>
              Stroke Season
              <select
                value={selectedSeasonId}
                onChange={(event) => setSelectedSeasonId(event.target.value)}
                style={select}
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    Season {season.season_number}
                    {season.is_active ? " (Active)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {!loading && !errorMessage && selectedSeason && (
          <>
            <section style={panel}>
              <h2 style={sectionTitle}>EDIT SEASON DETAILS</h2>
              <p style={sectionDescription}>
                Update the season dates and default courses. Season identity and
                roster size are managed separately and cannot be changed here.
              </p>

              <div style={detailsGrid}>
                <EditField label="Season Number">
                  <input
                    value={selectedSeason.season_number}
                    readOnly
                    aria-readonly="true"
                    style={readOnlyInput}
                  />
                </EditField>

                <EditField label="Number of Divisions">
                  <input
                    value={selectedRoster?.division_count ?? "Unavailable"}
                    readOnly
                    aria-readonly="true"
                    style={readOnlyInput}
                  />
                </EditField>

                <EditField label="Start Date">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    disabled={savingDetails || rosterIsLocked || !selectedRoster}
                    style={input}
                  />
                </EditField>

                <EditField label="End Date">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    disabled={savingDetails || rosterIsLocked || !selectedRoster}
                    style={input}
                  />
                </EditField>

                <EditField label="Game 1 Course">
                  <input
                    value={game1Course}
                    onChange={(event) => setGame1Course(event.target.value)}
                    disabled={savingDetails || rosterIsLocked || !selectedRoster}
                    style={input}
                  />
                </EditField>

                <EditField label="Game 2 Course">
                  <input
                    value={game2Course}
                    onChange={(event) => setGame2Course(event.target.value)}
                    disabled={savingDetails || rosterIsLocked || !selectedRoster}
                    style={input}
                  />
                </EditField>

                <EditField label="Game 3 Course">
                  <input
                    value={game3Course}
                    onChange={(event) => setGame3Course(event.target.value)}
                    disabled={savingDetails || rosterIsLocked || !selectedRoster}
                    style={input}
                  />
                </EditField>
              </div>

              {rosterIsLocked && (
                <p style={lockedText}>This historical season is locked and read-only.</p>
              )}

              <div style={detailsActions}>
                <button
                  type="button"
                  onClick={saveSeasonDetails}
                  disabled={savingDetails || rosterIsLocked || !selectedRoster}
                  style={saveDetailsButton}
                >
                  {savingDetails ? "Saving Season Changes..." : "Save Season Changes"}
                </button>
                <button
                  type="button"
                  onClick={resetSeasonDetails}
                  disabled={savingDetails}
                  style={cancelButton}
                >
                  Cancel
                </button>
              </div>

              {detailsMessage && (
                <p role="status" style={detailsMessageStyle}>{detailsMessage}</p>
              )}
            </section>

            <section style={panel}>
              <h2 style={sectionTitle}>EDIT A DIVISION</h2>
              <p style={sectionDescription}>
                Division changes are made on the existing Stroke setup page.
              </p>

              {!selectedRoster ? (
                <p role="alert" style={errorText}>
                  No draft, approved, or locked roster was found for Stroke Season{" "}
                  {selectedSeason.season_number}.
                </p>
              ) : (
                <>
                  <p style={rosterIsLocked ? lockedText : mutedText}>
                    Roster status: {selectedRoster.status}.{" "}
                    {rosterIsLocked
                      ? "This historical roster is locked and can only be viewed."
                      : `Choose one of ${selectedRoster.division_count} divisions.`}
                  </p>

                  <div style={divisionList}>
                    {divisions.map((divisionNumber) => (
                      <div key={divisionNumber} style={divisionRow}>
                        <span style={divisionName}>Stroke D{divisionNumber}</span>
                        <button
                          type="button"
                          onClick={() => openDivision(divisionNumber)}
                          style={rosterIsLocked ? viewButton : editButton}
                        >
                          {rosterIsLocked ? "View" : "Edit"}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

          </>
        )}
      </div>
    </main>
  )
}

function EditField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={fieldLabel}>
      {label}
      {children}
    </label>
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
  maxWidth: 900,
  padding: 30,
}

const topBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 20,
}

const backButtonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  textDecoration: "none",
}

const backButtonSecondary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#222",
  border: "1px solid #555",
  borderRadius: 8,
  color: "white",
  textDecoration: "none",
}

const title: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 36,
}

const subtitle: React.CSSProperties = {
  margin: "0 0 28px",
  color: "#cfcfcf",
}

const panel: React.CSSProperties = {
  marginTop: 18,
  padding: 20,
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0b0b0b",
}

const sectionTitle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 17,
  letterSpacing: "0.04em",
}

const sectionDescription: React.CSSProperties = {
  margin: "0 0 16px",
  color: "#aaa",
}

const fieldLabel: React.CSSProperties = {
  display: "flex",
  maxWidth: 420,
  flexDirection: "column",
  gap: 8,
  fontWeight: 700,
}

const detailsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
}

const input: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: 12,
  background: "#111",
  border: "1px solid #555",
  color: "white",
  borderRadius: 8,
}

const readOnlyInput: React.CSSProperties = {
  ...input,
  background: "#080808",
  color: "#a1a1aa",
}

const detailsActions: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
}

const saveDetailsButton: React.CSSProperties = {
  padding: "10px 16px",
  background: "#16a34a",
  border: "none",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const cancelButton: React.CSSProperties = {
  ...saveDetailsButton,
  background: "#27272a",
  border: "1px solid #52525b",
}

const detailsMessageStyle: React.CSSProperties = {
  margin: "16px 0 0",
  padding: 12,
  border: "1px solid #444",
  borderRadius: 8,
  background: "#080808",
  color: "#facc15",
}

const select: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: 12,
  background: "#111",
  border: "1px solid #444",
  color: "white",
  borderRadius: 8,
}

const divisionList: React.CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 16,
}

const divisionRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: 14,
  background: "#111",
  border: "1px solid #333",
  borderRadius: 9,
}

const divisionName: React.CSSProperties = {
  fontWeight: 700,
}

const editButton: React.CSSProperties = {
  padding: "8px 16px",
  background: "#7c3aed",
  color: "white",
  border: "none",
  borderRadius: 7,
  cursor: "pointer",
  fontWeight: 700,
}

const viewButton: React.CSSProperties = {
  ...editButton,
  background: "#334155",
}

const mutedText: React.CSSProperties = {
  margin: 0,
  color: "#aaa",
}

const lockedText: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
}

const errorText: React.CSSProperties = {
  margin: 0,
  color: "#fca5a5",
}
