"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type SeasonRow = {
  id: string
  season_number: number
  is_active: boolean
}

type RosterVersionRow = {
  id: string
  season_id: string
  division_count: number
  status: "draft" | "approved" | "locked"
}

const LEAGUE_TYPE = "stroke"

export default function EditCurrentStrokeSeasonPage() {
  const router = useRouter()

  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [rosterVersions, setRosterVersions] = useState<RosterVersionRow[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState("")
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    async function loadStrokeSeasons() {
      setLoading(true)
      setErrorMessage("")

      const { data: seasonData, error: seasonError } = await supabase
        .from("seasons")
        .select("id, season_number, is_active")
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

        <h1 style={title}>Edit Current Stroke Season</h1>
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

            <section style={secondaryPanel}>
              <h2 style={sectionTitle}>EDIT ENTIRE SEASON</h2>
              <p style={sectionDescription}>
                Use this only for season-wide details such as dates, default
                courses, season number, or division count.
              </p>
              <Link href="/admin/stroke/season" style={seasonDetailsButton}>
                Edit Season Details
              </Link>
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

const secondaryPanel: React.CSSProperties = {
  ...panel,
  background: "#080808",
  borderColor: "#2a2a2a",
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

const seasonDetailsButton: React.CSSProperties = {
  display: "inline-block",
  padding: "9px 14px",
  background: "#222",
  color: "white",
  border: "1px solid #555",
  borderRadius: 7,
  fontWeight: 700,
  textDecoration: "none",
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
