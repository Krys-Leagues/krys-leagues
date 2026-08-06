"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { logActivity } from "@/lib/activityLog"

type Season = {
  id: string
  league_type: string
  season_number: number
  due_date: string | null
  start_date: string | null
  end_date: string | null
  is_locked: boolean
  is_active: boolean
  created_at: string
}

const LEAGUES = [
  { value: "stroke", label: "Stroke Play" },
  { value: "match", label: "Match Play" },
  { value: "pyp", label: "Pick Your Poison" },
  { value: "doubles", label: "Doubles" },
  { value: "pro", label: "Pro League" },
  { value: "solo", label: "Solo League" },
]

export default function SeasonManagerPage() {
  const [leagueType, setLeagueType] = useState("stroke")
  const [seasonNumber, setSeasonNumber] = useState("")
  const [dueDate, setDueDate] = useState("")

  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingSeasons, setLoadingSeasons] = useState(true)
  const [message, setMessage] = useState("")
const [editingSeason, setEditingSeason] = useState<Season | null>(null)
const [editSeasonNumber, setEditSeasonNumber] = useState("")
const [editDueDate, setEditDueDate] = useState("")

  useEffect(() => {
    loadSeasons()
  }, [])

  async function loadSeasons() {
    setLoadingSeasons(true)

    const { data, error } = await supabase
      .from("seasons")
      .select(
        "id, league_type, season_number, due_date, start_date, end_date, is_locked, is_active, created_at"
      )
      .order("created_at", { ascending: false })

    if (error) {
      setMessage(`Could not load seasons: ${error.message}`)
      setLoadingSeasons(false)
      return
    }

    setSeasons((data || []) as Season[])
    setLoadingSeasons(false)
  }

  async function createSeason() {
    setMessage("")

    const number = Number(seasonNumber)

    if (!leagueType) {
      setMessage("Choose a league.")
      return
    }

    if (!Number.isInteger(number) || number <= 0) {
      setMessage("Enter a valid season number.")
      return
    }

    if (!dueDate) {
      setMessage("Choose a due date.")
      return
    }

    setLoading(true)

    const { data: existingSeason, error: existingError } = await supabase
      .from("seasons")
      .select("id")
      .eq("league_type", leagueType)
      .eq("season_number", number)
      .maybeSingle()

    if (existingError) {
      setMessage(`Could not check the season: ${existingError.message}`)
      setLoading(false)
      return
    }

    if (existingSeason) {
      setMessage(
        `${getLeagueLabel(leagueType)} Season ${number} already exists.`
      )
      setLoading(false)
      return
    }

    const { data: newSeason, error: insertError } = await supabase
      .from("seasons")
      .insert({
        league_type: leagueType,
        season_number: number,
        due_date: dueDate,
        is_locked: false,
        is_active: false,
      })
      .select(
  "id, league_type, season_number, due_date, start_date, end_date, is_locked, is_active, created_at"
)
      .single()

    if (insertError) {
      await logActivity({
        userType: "admin",
        action: "Create Season Failed",
        status: "error",
        leagueType,
        page: "/admin/season-manager",
        details: {
          seasonNumber: number,
          dueDate,
          error: insertError.message,
        },
      })

      setMessage(`Season was not created: ${insertError.message}`)
      setLoading(false)
      return
    }

    await logActivity({
      userType: "admin",
      action: "Created Season",
      status: "success",
      leagueType,
      page: "/admin/season-manager",
      details: {
        seasonId: newSeason.id,
        seasonNumber: number,
        dueDate,
      },
    })

    setSeasonNumber("")
    setDueDate("")
    setMessage(
      `${getLeagueLabel(leagueType)} Season ${number} was created successfully.`
    )

    await loadSeasons()
    setLoading(false)
  }
async function makeActive(season: Season) {
  setMessage("")

  const { error: clearError } = await supabase
    .from("seasons")
    .update({ is_active: false })
    .eq("league_type", season.league_type)

  if (clearError) {
    setMessage(clearError.message)
    return
  }

  const { error } = await supabase
    .from("seasons")
    .update({ is_active: true })
    .eq("id", season.id)

  if (error) {
    setMessage(error.message)
    return
  }

  await loadSeasons()

  setMessage(
    `${getLeagueLabel(season.league_type)} Season ${season.season_number} is now active.`
  )
}
async function toggleLock(season: Season) {
  setMessage("")

  const { error } = await supabase
    .from("seasons")
    .update({
      is_locked: !season.is_locked,
    })
    .eq("id", season.id)

  if (error) {
    setMessage(error.message)
    return
  }

  await loadSeasons()

  setMessage(
    `${getLeagueLabel(season.league_type)} Season ${season.season_number} ${
      season.is_locked ? "unlocked" : "locked"
    }.`
  )
}

function startEdit(season: Season) {
  setEditingSeason(season)
  setEditSeasonNumber(String(season.season_number))
  setEditDueDate(season.due_date ?? "")
}

async function saveEdit() {
  if (!editingSeason) return

  const { error } = await supabase
    .from("seasons")
    .update({
      season_number: Number(editSeasonNumber),
      due_date: editDueDate,
    })
    .eq("id", editingSeason.id)

  if (error) {
    setMessage(error.message)
    return
  }

  setEditingSeason(null)
  await loadSeasons()
  setMessage("Season updated successfully.")
}

  function getLeagueLabel(value: string) {
    return LEAGUES.find((league) => league.value === value)?.label || value
  }

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <Link href="/admin" style={backButton}>
            ← Admin Home
          </Link>

          <Link href="/admin/command-center" style={secondaryButton}>
            Command Center
          </Link>
        </div>

        <h1 style={title}>Season Manager</h1>

        <p style={subtitle}>
          Create and manage the official season record for each league.
        </p>

        <section style={panel}>
          <h2 style={sectionTitle}>Create New Season</h2>

          <div style={formGrid}>
            <div>
              <label style={label}>League</label>

              <select
                value={leagueType}
                onChange={(event) => setLeagueType(event.target.value)}
                style={input}
                disabled={loading}
              >
                {LEAGUES.map((league) => (
                  <option key={league.value} value={league.value}>
                    {league.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={label}>Season Number</label>

              <input
                type="number"
                min="1"
                step="1"
                value={seasonNumber}
                onChange={(event) => setSeasonNumber(event.target.value)}
                placeholder="Example: 60"
                style={input}
                disabled={loading}
              />
            </div>

            <div>
              <label style={label}>Season Due Date</label>

              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                style={input}
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={createSeason}
            disabled={loading}
            style={{
              ...createButton,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating Season..." : "Create Season"}
          </button>

          {message && <p style={messageStyle}>{message}</p>}
        </section>
{editingSeason && (
  <section style={panel}>
    <h2 style={sectionTitle}>Edit Season</h2>

    <div style={formGrid}>
      <div>
        <label style={label}>Season Number</label>
        <input
          type="number"
          value={editSeasonNumber}
          onChange={(e) => setEditSeasonNumber(e.target.value)}
          style={input}
        />
      </div>

      <div>
        <label style={label}>Due Date</label>
        <input
          type="date"
          value={editDueDate}
          onChange={(e) => setEditDueDate(e.target.value)}
          style={input}
        />
      </div>
    </div>

    <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
      <button
  onClick={saveEdit}
  style={createButton}
>
  Save Changes
</button>

      <button
        onClick={() => setEditingSeason(null)}
        style={secondaryButton}
      >
        Cancel
      </button>
    </div>
  </section>
)}
        <section style={panel}>
          <h2 style={sectionTitle}>Existing Seasons</h2>

          {loadingSeasons ? (
            <p style={muted}>Loading seasons...</p>
          ) : seasons.length === 0 ? (
            <p style={muted}>No seasons have been created yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
               <thead>
  <tr>
    <th style={th}>League</th>
    <th style={th}>Season</th>
    <th style={th}>Due Date</th>
    <th style={th}>Start</th>
    <th style={th}>End</th>
    <th style={th}>Status</th>
    <th style={th}>Created</th>
    <th style={th}>Actions</th>
  </tr>
</thead>
                <tbody>
                  {seasons.map((season) => (
                    <tr key={season.id}>
                      <td style={td}>
                        {getLeagueLabel(season.league_type)}
                      </td>

                      <td style={td}>Season {season.season_number}</td>

                      <td style={td}>{season.due_date || "Not set"}</td>
<td style={td}>
  {season.start_date || "-"}
</td>

<td style={td}>
  {season.end_date || "-"}
</td>

<td style={td}>
  {season.is_locked ? "🔒 Locked" : "🟢 Open"}
</td>

<td style={td}>
  {new Date(season.created_at).toLocaleDateString()}
</td>

<td style={td}>
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {!season.is_active && (
      <button
        onClick={() => makeActive(season)}
        style={{
          padding: "6px 12px",
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Make Active
      </button>
    )}

    <button
      onClick={() => toggleLock(season)}
      style={{
        padding: "6px 12px",
        background: season.is_locked ? "#16a34a" : "#dc2626",
        color: "white",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
      }}
    >
      {season.is_locked ? "Unlock" : "Lock"}
    </button>
<button
onClick={() => startEdit(season)}
  style={{
    padding: "6px 12px",
    background: "#f59e0b",
    color: "black",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
  }}
>
  Edit
</button>

    {season.is_active && (
      <span style={{ color: "#22c55e", fontWeight: 700 }}>
        ✅ Active
      </span>
    )}
  </div>
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
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
  maxWidth: 1150,
  margin: "0 auto",
}

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 22,
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 9,
  background: "#2563eb",
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const secondaryButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 9,
  border: "1px solid #555",
  background: "#181818",
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const title: React.CSSProperties = {
  fontSize: 38,
  marginBottom: 8,
}

const subtitle: React.CSSProperties = {
  color: "#cfcfcf",
  marginBottom: 26,
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

const messageStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 12,
  borderRadius: 9,
  border: "1px solid #444",
  background: "#080808",
  color: "#facc15",
  fontWeight: 700,
}

const muted: React.CSSProperties = {
  color: "#aaa",
}

const table: React.CSSProperties = {
  width: "100%",
  minWidth: 700,
  borderCollapse: "collapse",
}

const th: React.CSSProperties = {
  padding: 11,
  textAlign: "left",
  borderBottom: "1px solid #555",
  color: "#ddd",
}

const td: React.CSSProperties = {
  padding: 11,
  borderBottom: "1px solid #333",
  color: "#eee",
}