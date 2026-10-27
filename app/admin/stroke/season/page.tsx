"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { logActivity } from "@/lib/activityLog"

const LEAGUE_TYPE = "stroke"

export default function StrokeSeasonPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [seasonNumber, setSeasonNumber] = useState("")
  const [divisionCount, setDivisionCount] = useState("5")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [game1Course, setGame1Course] = useState("")
  const [game2Course, setGame2Course] = useState("")
  const [game3Course, setGame3Course] = useState("")

  function validateSeasonForm() {
    const number = Number(seasonNumber)
    const divisions = Number(divisionCount)

    if (!Number.isInteger(number) || number <= 0) {
      return "Enter a valid season number."
    }

    if (!Number.isInteger(divisions) || divisions < 1 || divisions > 20) {
      return "Number of divisions must be between 1 and 20."
    }

    if (!startDate) return "Choose a start date."
    if (!endDate) return "Choose an end date."

    if (endDate < startDate) {
      return "End date cannot be before the start date."
    }

    if (!game1Course.trim()) return "Enter the Game 1 course."
    if (!game2Course.trim()) return "Enter the Game 2 course."
    if (!game3Course.trim()) return "Enter the Game 3 course."

    return ""
  }

  async function createSeason() {
    setMessage("")

    const validationError = validateSeasonForm()

    if (validationError) {
      setMessage(validationError)
      return
    }

    const number = Number(seasonNumber)
    const count = Number(divisionCount)

    setSaving(true)

    const { data: createdSeason, error: createError } = await supabase
      .rpc("create_stroke_season_with_roster", {
        p_season_number: number,
        p_division_count: count,
        p_start_date: startDate,
        p_due_date: endDate,
        p_end_date: endDate,
        p_game1_course: game1Course.trim(),
        p_game2_course: game2Course.trim(),
        p_game3_course: game3Course.trim(),
      })
      .single()

    if (createError || !createdSeason) {
      const errorMessage = createError?.message || "No season data was returned."

      await logActivity({
        userType: "admin",
        action: "Create Stroke Season Failed",
        status: "error",
        leagueType: LEAGUE_TYPE,
        page: "/admin/stroke/season",
        details: {
          seasonNumber: number,
          divisionCount: count,
          startDate,
          dueDate: endDate,
          endDate,
          game1Course,
          game2Course,
          game3Course,
          error: errorMessage,
        },
      })

      setMessage(`Stroke season was not created: ${errorMessage}`)
      setSaving(false)
      return
    }

    const result = createdSeason as {
      season_id: string
      roster_version_id: string
      season_number: number
      division_count: number
      first_division_number: number
    }

    await logActivity({
      userType: "admin",
      action: "Created Stroke Season",
      status: "success",
      leagueType: LEAGUE_TYPE,
      page: "/admin/stroke/season",
      details: {
        seasonNumber: number,
        divisionCount: count,
        startDate,
        dueDate: endDate,
        endDate,
        game1Course,
        game2Course,
        game3Course,
        seasonId: result.season_id,
        rosterVersionId: result.roster_version_id,
      },
    })

    setSeasonNumber("")
    setDivisionCount("5")
    setStartDate("")
    setEndDate("")
    setGame1Course("")
    setGame2Course("")
    setGame3Course("")
    setSaving(false)

    const setupParams = new URLSearchParams({
      seasonId: result.season_id,
      division: String(result.first_division_number),
    })

    router.push(`/admin/stroke/setup?${setupParams.toString()}`)
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button
            type="button"
            onClick={() => router.push("/admin/stroke")}
            style={backButtonPrimary}
          >
            ← Stroke Hub
          </button>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            style={backButtonSecondary}
          >
            ← Admin
          </button>
        </div>

        <h1 style={title}>Stroke Season</h1>
        <p style={subtitle}>
          Create and manage Stroke Play seasons inside the Stroke hub.
        </p>

        <section style={panel}>
          <h2 style={sectionTitle}>Create Stroke Season</h2>

          <div style={formGrid}>
            <Field label="Season Number">
              <input
                type="number"
                min="1"
                step="1"
                value={seasonNumber}
                onChange={(event) => setSeasonNumber(event.target.value)}
                placeholder="Example: 84"
                style={input}
                disabled={saving}
              />
            </Field>

            <Field label="Number of Divisions">
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                value={divisionCount}
                onChange={(event) => setDivisionCount(event.target.value)}
                placeholder="Example: 5"
                style={input}
                disabled={saving}
              />
            </Field>

            <Field label="Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                style={input}
                disabled={saving}
              />
            </Field>

            <Field label="End Date">
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                style={input}
                disabled={saving}
              />
            </Field>

            <Field label="Game 1 Course">
              <input
                value={game1Course}
                onChange={(event) => setGame1Course(event.target.value)}
                placeholder="Game 1 course"
                style={input}
                disabled={saving}
              />
            </Field>

            <Field label="Game 2 Course">
              <input
                value={game2Course}
                onChange={(event) => setGame2Course(event.target.value)}
                placeholder="Game 2 course"
                style={input}
                disabled={saving}
              />
            </Field>

            <Field label="Game 3 Course">
              <input
                value={game3Course}
                onChange={(event) => setGame3Course(event.target.value)}
                placeholder="Game 3 course"
                style={input}
                disabled={saving}
              />
            </Field>
          </div>

          <p style={helperText}>
            This creates one Stroke season row with a draft roster containing
            the requested number of divisions and four persistent slots per
            division.
          </p>

          <button
            type="button"
            onClick={createSeason}
            disabled={saving}
            style={{
              ...createButton,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Creating Stroke Season..." : "Create Stroke Season"}
          </button>

          {message && <p style={messageStyle}>{message}</p>}
        </section>

        <section style={panel}>
          <h2 style={sectionTitle}>Edit Current Season</h2>
          <p style={helperText}>
            Select a managed Stroke season and open one of its roster divisions.
          </p>

          <button
            type="button"
            onClick={() => router.push("/admin/stroke/season/edit")}
            style={editCurrentSeasonButton}
          >
            Edit Current Season
          </button>
        </section>
      </div>
    </main>
  )
}

function Field({
  label: fieldLabel,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label style={label}>{fieldLabel}</label>
      {children}
    </div>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1250,
  margin: "0 auto",
}

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 22,
}

const backButtonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  border: "none",
  borderRadius: 9,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const backButtonSecondary: React.CSSProperties = {
  ...backButtonPrimary,
  background: "#181818",
  border: "1px solid #555",
}

const title: React.CSSProperties = {
  fontSize: 38,
  marginBottom: 8,
}

const subtitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 26,
  color: "#cfcfcf",
  fontSize: 17,
}

const panel: React.CSSProperties = {
  padding: 22,
  marginBottom: 20,
  borderRadius: 15,
  border: "1px solid #333",
  background: "#111",
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 20,
}

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
}

const label: React.CSSProperties = {
  display: "block",
  marginBottom: 7,
  color: "#ddd",
  fontWeight: 700,
}

const input: React.CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: 12,
  borderRadius: 9,
  border: "1px solid #555",
  background: "#050505",
  color: "white",
  fontSize: 16,
}

const helperText: React.CSSProperties = {
  marginTop: 14,
  color: "#aaa",
  fontSize: 14,
  lineHeight: 1.5,
}

const createButton: React.CSSProperties = {
  width: "100%",
  marginTop: 20,
  padding: 14,
  border: "none",
  borderRadius: 10,
  background: "#16a34a",
  color: "white",
  fontSize: 17,
  fontWeight: 800,
}

const editCurrentSeasonButton: React.CSSProperties = {
  width: "100%",
  padding: 14,
  border: "none",
  borderRadius: 10,
  background: "#7c3aed",
  color: "white",
  fontSize: 17,
  fontWeight: 800,
  cursor: "pointer",
}

const messageStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 12,
  borderRadius: 9,
  border: "1px solid #444",
  background: "#080808",
  color: "#facc15",
  fontWeight: 700,
}
