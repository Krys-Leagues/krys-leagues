"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type PlayerLeagueRow = {
  id: string
  league_type: string
  division: string
  players: {
    screen_name: string
    discord_id: string | null
  } | null
}

export default function PlayersAdminPage() {
  const [rows, setRows] = useState<PlayerLeagueRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    setLoading(true)

    const { data, error } = await supabase
      .from("player_leagues")
      .select(`
        id,
        league_type,
        division,
        players (
          screen_name,
          discord_id
        )
      `)
      .order("league_type", { ascending: true })
      .order("division", { ascending: true })

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    setRows((data || []) as any)
  }

  return (
    <main style={{ padding: 24, background: "black", color: "white", minHeight: "100vh" }}>
      <h1>Players Admin</h1>

      <p style={{ color: "#aaa" }}>
        View players assigned to each league and division.
      </p>

      <button
        onClick={loadPlayers}
        disabled={loading}
        style={{
          marginTop: 16,
          background: "#2563eb",
          border: "none",
          padding: "10px 16px",
          borderRadius: 8,
          color: "white",
          cursor: "pointer",
        }}
      >
        {loading ? "Loading..." : "Refresh Players"}
      </button>

      <table style={{ marginTop: 24, borderCollapse: "collapse", minWidth: 760 }}>
        <thead>
          <tr>
            <th style={th}>Player</th>
            <th style={th}>Discord</th>
            <th style={th}>League</th>
            <th style={th}>Division</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={td}>{row.players?.screen_name || "Unknown"}</td>
              <td style={td}>{row.players?.discord_id || "-"}</td>
              <td style={td}>{row.league_type}</td>
              <td style={td}>{row.division}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && !loading && (
        <p style={{ marginTop: 24, color: "orange" }}>
          No assigned players yet.
        </p>
      )}
    </main>
  )
}

const th = {
  borderBottom: "1px solid #555",
  textAlign: "left" as const,
  padding: 8,
}

const td = {
  borderBottom: "1px solid #333",
  padding: 8,
}