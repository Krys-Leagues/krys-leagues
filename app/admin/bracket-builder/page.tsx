"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  discord_username: string | null
  discord_id: string | null
  status: string | null
  cup_tier: string | null
}

const CUP_OPTIONS = ["spicy", "krys", "champion"]

function getBracketSize(count: number) {
  if (count <= 2) return 2
  if (count <= 4) return 4
  if (count <= 8) return 8
  if (count <= 16) return 16
  if (count <= 32) return 32
  return 64
}

export default function BracketBuilder() {
  const [players, setPlayers] = useState<Player[]>([])
  const [tier, setTier] = useState("spicy")
  const [mentionMode, setMentionMode] = useState(false)
  const [shuffled, setShuffled] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchPlayers() {
    setLoading(true)

    const { data, error } = await supabase
      .from("player_tracker")
      .select("id, screen_name, discord_username, discord_id, status, cup_tier")
      .order("screen_name", { ascending: true })

    if (error) {
      alert(error.message)
      console.error(error)
    }

    if (data) setPlayers(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchPlayers()
  }, [])

  const tierPlayers = useMemo(() => {
    return players.filter(
      (p) => p.cup_tier === tier && p.status !== "inactive"
    )
  }, [players, tier])

  useEffect(() => {
    setShuffled(tierPlayers)
  }, [tierPlayers])

  function shufflePlayers() {
    const copy = [...tierPlayers]
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    setShuffled(copy)
  }

  function formatPlayer(player: Player) {
    if (mentionMode && player.discord_id) {
      return `<@${player.discord_id}>`
    }

    return player.screen_name
  }

  const outputList = shuffled.map(formatPlayer).join("\n")
  const bracketSize = getBracketSize(shuffled.length)
  const byesNeeded = bracketSize - shuffled.length

  async function copyList() {
    await navigator.clipboard.writeText(outputList)
    alert("Copied bracket list")
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000 }}>
      <h1>Bracket Builder</h1>
      <p>
        Pulls active players from the Cup Tracker. This does not change player data.
      </p>

      <h2>Select Cup Tier</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {CUP_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => setTier(option)}
            style={{
              padding: "8px 12px",
              border: tier === option ? "2px solid white" : "1px solid #555",
              background: tier === option ? "#222" : "#111",
              color: "white",
              cursor: "pointer",
            }}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>

      <label style={{ display: "block", marginBottom: 16 }}>
        <input
          type="checkbox"
          checked={mentionMode}
          onChange={(e) => setMentionMode(e.target.checked)}
        />{" "}
        Copy as Discord mentions when Discord ID exists
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={shufflePlayers}>Shuffle Players</button>
        <button onClick={copyList}>Copy Bracket List</button>
        <button onClick={fetchPlayers}>Refresh Players</button>
      </div>

      <h2>Bracket Info</h2>

      <div style={{ marginBottom: 20 }}>
        <p><strong>Tier:</strong> {tier.toUpperCase()}</p>
        <p><strong>Players:</strong> {shuffled.length}</p>
        <p><strong>Bracket Size:</strong> {bracketSize}</p>
        <p><strong>Byes Needed:</strong> {byesNeeded}</p>
      </div>

      <h2>Copy Output</h2>

      <textarea
        readOnly
        value={outputList}
        style={{
          width: "100%",
          height: 220,
          marginBottom: 24,
          background: "#111",
          color: "white",
          border: "1px solid #444",
          padding: 10,
        }}
      />

      <h2>Players</h2>

      {loading ? (
        <p>Loading players...</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Seed</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Player</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Discord</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Discord ID</th>
            </tr>
          </thead>

          <tbody>
            {shuffled.map((p, index) => (
              <tr key={p.id}>
                <td style={{ padding: 8 }}>{index + 1}</td>
                <td style={{ padding: 8 }}>{p.screen_name}</td>
                <td style={{ padding: 8 }}>{p.discord_username || ""}</td>
                <td style={{ padding: 8 }}>{p.discord_id || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}