"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

export default function PlayersAdminPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    loadPlayers()
  }, [])

  function normalizeName(name: string) {
    return String(name || "").trim().toLowerCase()
  }

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

  async function importPlayers() {
    setImporting(true)

    try {
      const { data: scheduleData } = await supabase
        .from("schedule")
        .select("player1, player2")

      const { data: handicapData } = await supabase
        .from("handicap_rounds")
        .select("player_name")

      const { data: careerData } = await supabase
        .from("player_career_events")
        .select("player_name")

      const uniqueImportMap = new Map<string, string>()

      function addName(value: any) {
        const clean = String(value || "").trim()
        if (!clean) return

        const key = normalizeName(clean)
        if (!uniqueImportMap.has(key)) {
          uniqueImportMap.set(key, clean)
        }
      }

      scheduleData?.forEach((row: any) => {
        addName(row.player1)
        addName(row.player2)
      })

      handicapData?.forEach((row: any) => {
        addName(row.player_name)
      })

      careerData?.forEach((row: any) => {
        addName(row.player_name)
      })

      const allNames = Array.from(uniqueImportMap.values())

      if (allNames.length === 0) {
        alert("No players found to import.")
        setImporting(false)
        return
      }

      const { data: existing } = await supabase
        .from("players")
        .select("screen_name")

      const existingSet = new Set(
        (existing || []).map((p: any) => normalizeName(p.screen_name))
      )

      const newPlayers = allNames
        .filter((name) => !existingSet.has(normalizeName(name)))
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

  const filteredPlayers = useMemo(() => {
    const q = normalizeName(search)
    if (!q) return players
    return players.filter((p) => normalizeName(p.screen_name).includes(q))
  }, [players, search])

  return (
    <main style={page}>
      <h1>Global Players</h1>

      <p style={{ color: "#aaa" }}>
        Master player list used across all leagues.
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={loadPlayers} disabled={loading} style={button}>
          {loading ? "Loading..." : "Refresh Players"}
        </button>

        <button
          onClick={importPlayers}
          disabled={importing}
          style={{ ...button, background: "#16a34a" }}
        >
          {importing ? "Importing..." : "Import Existing Players"}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players..."
          style={input}
        />
      </div>

      <p style={{ marginTop: 14, color: "#aaa" }}>
        Showing {filteredPlayers.length} / {players.length}
      </p>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Player</th>
          </tr>
        </thead>

        <tbody>
          {filteredPlayers.map((p) => (
            <tr key={p.id}>
              <td style={td}>{p.screen_name}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredPlayers.length === 0 && !loading && (
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

const input: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
}

const table: React.CSSProperties = {
  marginTop: 18,
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