"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  cup_tier: string | null
  best_bracket_round: number | null
}

const EVENT_TYPES = ["regular", "tier", "cup"]

function getNewTier({
  eventType,
  startingTier,
  round,
  won,
}: {
  eventType: string
  startingTier: string
  round: number
  won: boolean
}) {
  if (eventType === "regular") {
    if (won) return "champion"
    if (round >= 3) return "krys"
    return startingTier
  }

  if (eventType === "tier") {
    if (!won) return startingTier
    if (startingTier === "spicy") return "krys"
    if (startingTier === "krys") return "champion"
    return "champion"
  }

  if (eventType === "cup") {
    if (!won) return startingTier
    if (startingTier === "spicy") return "krys"
    if (startingTier === "krys") return "champion"
    return "champion"
  }

  return startingTier
}

export default function BracketResultsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState("")
  const [eventType, setEventType] = useState("regular")
  const [eventName, setEventName] = useState("")
  const [round, setRound] = useState(0)
  const [won, setWon] = useState(false)
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)

  async function fetchPlayers() {
    setLoading(true)

    const { data, error } = await supabase
      .from("player_tracker")
      .select("id, screen_name, cup_tier, best_bracket_round")
      .order("screen_name", { ascending: true })

    if (error) {
      alert(error.message)
      console.error(error)
    }

    setPlayers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchPlayers()
  }, [])

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId)

  const previewTier = selectedPlayer
    ? getNewTier({
        eventType,
        startingTier: selectedPlayer.cup_tier || "spicy",
        round,
        won,
      })
    : ""

  async function saveResult() {
    if (!selectedPlayer) {
      alert("Select player")
      return
    }

    const startingTier = selectedPlayer.cup_tier || "spicy"
    const newTier = getNewTier({
      eventType,
      startingTier,
      round,
      won,
    })

    const newBestRound = Math.max(selectedPlayer.best_bracket_round || 0, round)

    const { error: resultError } = await supabase.from("bracket_results").insert([
      {
        player_id: selectedPlayer.id,
        screen_name: selectedPlayer.screen_name,
        event_type: eventType,
        event_name: eventName.trim(),
        starting_tier: startingTier,
        best_round_reached: round,
        won_tournament: won,
        cup_tier_before: startingTier,
        cup_tier_after: newTier,
        major_cup_title:
          eventType === "cup" && won ? `${startingTier} cup winner` : null,
        notes: notes.trim(),
      },
    ])

    if (resultError) {
      alert(resultError.message)
      console.error(resultError)
      return
    }

    const { error: updateError } = await supabase
      .from("player_tracker")
      .update({
        cup_tier: newTier,
        best_bracket_round: newBestRound,
      })
      .eq("id", selectedPlayer.id)

    if (updateError) {
      alert(updateError.message)
      console.error(updateError)
      return
    }

    alert("Bracket result saved")

    setSelectedPlayerId("")
    setEventName("")
    setRound(0)
    setWon(false)
    setNotes("")

    fetchPlayers()
  }

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) =>
      (a.screen_name || "").localeCompare(b.screen_name || "")
    )
  }, [players])

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Bracket Results v2</h1>

      <p style={{ color: "#aaa", marginBottom: 20 }}>
        Regular brackets, tier brackets, and end-of-year cup results update cup tiers differently.
      </p>

      <section style={card}>
        <h2>Save Result</h2>

        <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
          <label>Player</label>
          <select
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select player</option>
            {sortedPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.screen_name} — {(p.cup_tier || "spicy").toUpperCase()}
              </option>
            ))}
          </select>

          <label>Event Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            style={inputStyle}
          >
            <option value="regular">Regular Bracket</option>
            <option value="tier">Tier Bracket</option>
            <option value="cup">End-of-Year Cup</option>
          </select>

          <label>Event Name</label>
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Example: Spicy Bracket Week 6"
            style={inputStyle}
          />

          <label>Best Round Reached</label>
          <input
            type="number"
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            style={inputStyle}
          />

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={won}
              onChange={(e) => setWon(e.target.checked)}
            />
            Won Event
          </label>

          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            style={{ ...inputStyle, minHeight: 90 }}
          />

          {selectedPlayer && (
            <div style={previewBox}>
              <h3>Preview</h3>
              <p><strong>Player:</strong> {selectedPlayer.screen_name}</p>
              <p><strong>Current Tier:</strong> {(selectedPlayer.cup_tier || "spicy").toUpperCase()}</p>
              <p><strong>Best Round Saved:</strong> {selectedPlayer.best_bracket_round || 0}</p>
              <p><strong>New Tier:</strong> {previewTier.toUpperCase()}</p>
            </div>
          )}

          <button onClick={saveResult} style={buttonGreen}>
            Save Bracket Result
          </button>
        </div>
      </section>

      <section style={card}>
        <h2>Players</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Player</th>
                <th style={th}>Tier</th>
                <th style={th}>Best Round</th>
              </tr>
            </thead>

            <tbody>
              {sortedPlayers.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.screen_name}</td>
                  <td style={td}>{(p.cup_tier || "spicy").toUpperCase()}</td>
                  <td style={td}>{p.best_bracket_round || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

const card: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  padding: 18,
  marginBottom: 22,
  background: "#080808",
}

const inputStyle: React.CSSProperties = {
  background: "#111",
  color: "white",
  border: "1px solid #555",
  padding: "10px 12px",
  borderRadius: 8,
  fontSize: 16,
  width: "100%",
}

const previewBox: React.CSSProperties = {
  border: "1px solid #444",
  borderRadius: 10,
  padding: 12,
  background: "#111",
}

const buttonGreen: React.CSSProperties = {
  background: "#22c55e",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "12px 16px",
  fontSize: 16,
  cursor: "pointer",
  fontWeight: "bold",
}

const th: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #444",
  textAlign: "left",
}

const td: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #222",
}