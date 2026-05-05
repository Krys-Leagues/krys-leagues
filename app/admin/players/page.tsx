"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

export default function PlayersAdminPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    setLoading(true)

    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name")
      .order("screen_name", { ascending: true })

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    setPlayers(data || [])
  }

  // 🔥 IMPORT EXISTING PLAYERS
  async function importPlayers() {
    setImporting(true)

    try {
      // pull from schedule table
      const { data: scheduleData } = await supabase
        .from("schedule")
        .select("player1, player2")

      // pull from handicap rounds
      const { data: handicapData } = await supabase
        .from("handicap_rounds")
        .select("player_name")

      // pull from career events
      const { data: careerData } = await supabase
        .from("player_career_events")
        .select("player_name")

      const namesSet = new Set<string>()

      scheduleData?.forEach((row: any) => {
        if (row.player1) namesSet.add(row.player1.trim())
        if (row.player2) namesSet.add(row.player2.trim())
      })

      handicapData?.forEach((row: any) => {
        if (row.player_name) namesSet.add(row.player_name.trim())
      })

      careerData?.forEach((row: any) => {
        if (row.player_name) namesSet.add(row.player_name.trim())
      })

      const allNames = Array.from(namesSet).filter(Boolean)

      if (allNames.length === 0) {
        alert("No players found to import.")
        setImporting(false)
        return
      }

      // get existing players
      const { data: existing } = await supabase
        .from("players")
        .select("screen_name")

      const existingSet = new Set(
        (existing || []).map((p: any) => p.screen_name)
      )

      const newPlayers = allNames
        .filter((name) => !existingSet.has(name))
        .map((name) => ({
          screen_name: name,
          active: true,
        }))

      if (newPlayers.length === 0) {
        alert("All players already imported.")
        setImporting(false)
        return
      }

      const { error } = await supabase.from("players").insert(newPlayers)

      if (error) {
        alert(error.message)
        setImporting(false)
        return
      }

      alert(`Imported ${newPlayers.length} players ✔`)
      await loadPlayers()
    } catch (err) {
      console.error(err)
      alert("Import failed")
    }

    setImporting(false)
  }

  return (
    <main style={page}>
      <h1>Global Players</h1>

      <p style={{ color: "#aaa" }}>
        Master player list used across all leagues.
      </p>

      <div style={{ marginTop: 16 }}>
        <button onClick={loadPlayers} disabled={loading} style={button}>
          {loading ? "Loading..." : "Refresh Players"}
        </button>

        <button
          onClick={importPlayers}
          disabled={importing}
          style={{ ...button, marginLeft: 12, background: "#16a34a" }}
        >
          {importing ? "Importing..." : "Import Existing Players"}
        </button>
      </div>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Player</th>
          </tr>
        </thead>

        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td style={td}>{p.screen_name}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {players.length === 0 && !loading && (
        <p style={{ marginTop: 24, color: "orange" }}>
          No players found.
        </p>
      )}
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const button: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  padding: "10px 16px",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const table: React.CSSProperties = {
  marginTop: 24,
  borderCollapse: "collapse",
  minWidth: 400,
}

const th: React.CSSProperties = {
  borderBottom: "1px solid #555",
  textAlign: "left",
  padding: 8,
}

const td: React.CSSProperties = {
  borderBottom: "1px solid #333",
  padding: 8,
}