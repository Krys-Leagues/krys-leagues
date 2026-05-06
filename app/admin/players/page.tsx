"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

const LEAGUES = ["stroke", "pyp", "skins", "kwt"]

export default function PlayersAdminPage() {
  const router = useRouter()

  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState("")

  const [selectedPlayer, setSelectedPlayer] = useState("")
  const [league, setLeague] = useState("stroke")
  const [season, setSeason] = useState("59")
  const [division, setDivision] = useState("Stroke D1")
  const [saving, setSaving] = useState(false)

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

  async function registerPlayer() {
    if (!selectedPlayer || !league || !season || !division) {
      alert("Fill all fields")
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from("player_league_memberships")
      .insert([
        {
          player_id: selectedPlayer,
          league_type: league,
          season_number: Number(season),
          division,
        },
      ])

    setSaving(false)

    if (error) {
      alert(error.message)
      return
    }

    alert("Player registered ✔")
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

      if (newPlayers.length > 0) {
        await supabase.from("players").insert(newPlayers)
      }

      await loadPlayers()
      alert(`Imported ${newPlayers.length} players ✔`)
    } catch (err) {
      alert("Import failed")
    }

    setImporting(false)
  }

  const filteredPlayers = useMemo(() => {
    const q = normalizeName(search)
    if (!q) return players
    return players.filter((p) =>
      normalizeName(p.screen_name).includes(q)
    )
  }, [players, search])

  return (
    <main style={page}>
      <h1>Global Players</h1>

      {/* REGISTER */}
      <div style={panel}>
        <h2>Register Player to League</h2>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <select value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)} style={input}>
            <option value="">Select Player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.screen_name}
              </option>
            ))}
          </select>

          <select value={league} onChange={(e) => setLeague(e.target.value)} style={input}>
            {LEAGUES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>

          <select value={season} onChange={(e) => setSeason(e.target.value)} style={input}>
            {Array.from({ length: 300 - 59 + 1 }, (_, i) => 59 + i).map((num) => (
              <option key={num} value={num}>
                Season {num}
              </option>
            ))}
          </select>

          <input
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            style={input}
            placeholder="Division"
          />
        </div>

        <button onClick={registerPlayer} disabled={saving} style={{ ...button, marginTop: 12 }}>
          {saving ? "Saving..." : "Register Player"}
        </button>
      </div>

      {/* CONTROLS */}
      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <button onClick={loadPlayers} disabled={loading} style={button}>
          {loading ? "Loading..." : "Refresh Players"}
        </button>

        <button onClick={importPlayers} disabled={importing} style={{ ...button, background: "#16a34a" }}>
          {importing ? "Importing..." : "Import Existing Players"}
        </button>
      </div>

      {/* SEARCH */}
      <div style={{ marginTop: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players..."
          style={input}
        />
      </div>

      {/* LIST */}
      <table style={table}>
        <tbody>
          {filteredPlayers.map((p) => (
            <tr key={p.id}>
              <td style={td}>{p.screen_name}</td>

              {/* 🔥 NEW PROFILE BUTTON */}
              <td style={td}>
                <button
                  onClick={() => router.push(`/admin/players/${p.id}`)}
                  style={profileButton}
                >
                  View Profile
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

/* styles */

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const panel: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: "1px solid #444",
  borderRadius: 10,
}

const button: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  padding: "10px 16px",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const profileButton: React.CSSProperties = {
  background: "#16a34a",
  border: "none",
  padding: "6px 12px",
  borderRadius: 6,
  color: "white",
  cursor: "pointer",
}

const input: React.CSSProperties = {
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

const td: React.CSSProperties = {
  borderBottom: "1px solid #333",
  padding: 8,
}