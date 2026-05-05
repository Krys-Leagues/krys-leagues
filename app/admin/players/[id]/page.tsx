"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  discord_id: string | null
  discord_username: string | null
  active: boolean | null
}

export default function PlayersAdminPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState("")
  const [screenName, setScreenName] = useState("")
  const [discordId, setDiscordId] = useState("")
  const [discordUsername, setDiscordUsername] = useState("")

  useEffect(() => {
    loadPlayers()
  }, [])

  async function loadPlayers() {
    setLoading(true)

    const { data, error } = await supabase
      .from("players")
      .select("id, screen_name, discord_id, discord_username, active")
      .order("screen_name", { ascending: true })

    setLoading(false)

    if (error) {
      alert(error.message)
      setPlayers([])
      return
    }

    setPlayers((data || []) as Player[])
  }

  async function addPlayer() {
    const cleanName = screenName.trim()

    if (!cleanName) {
      alert("Enter a player screen name")
      return
    }

    const { error } = await supabase.from("players").insert({
      screen_name: cleanName,
      discord_id: discordId.trim() || null,
      discord_username: discordUsername.trim() || null,
      active: true,
    })

    if (error) {
      alert(error.message)
      return
    }

    setScreenName("")
    setDiscordId("")
    setDiscordUsername("")
    await loadPlayers()
  }

  async function updatePlayer(id: string, field: keyof Player, value: any) {
    const { error } = await supabase
      .from("players")
      .update({ [field]: value })
      .eq("id", id)

    if (error) {
      alert(error.message)
      return
    }

    await loadPlayers()
  }

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) return players

    return players.filter((p) => {
      const text = `${p.screen_name || ""} ${p.discord_id || ""} ${p.discord_username || ""}`
      return text.toLowerCase().includes(q)
    })
  }, [players, search])

  return (
    <main style={page}>
      <h1 style={title}>Global Players</h1>

      <p style={subtitle}>
        One master player list used by every league dropdown.
      </p>

      <section style={panel}>
        <h2>Add Player</h2>

        <div style={formGrid}>
          <input
            value={screenName}
            onChange={(e) => setScreenName(e.target.value)}
            placeholder="Screen name"
            style={input}
          />

          <input
            value={discordUsername}
            onChange={(e) => setDiscordUsername(e.target.value)}
            placeholder="Discord username"
            style={input}
          />

          <input
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="Discord ID"
            style={input}
          />

          <button onClick={addPlayer} style={button}>
            Add Player
          </button>
        </div>
      </section>

      <section style={panel}>
        <div style={topRow}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            style={input}
          />

          <button onClick={loadPlayers} disabled={loading} style={button}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <p style={count}>
          Showing {filteredPlayers.length} / {players.length}
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Screen Name</th>
                <th style={th}>Discord Username</th>
                <th style={th}>Discord ID</th>
                <th style={th}>Active</th>
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.map((p) => (
                <tr key={p.id}>
                  <td style={td}>
                    <input
                      value={p.screen_name || ""}
                      onChange={(e) => updatePlayer(p.id, "screen_name", e.target.value)}
                      style={input}
                    />
                  </td>

                  <td style={td}>
                    <input
                      value={p.discord_username || ""}
                      onChange={(e) =>
                        updatePlayer(p.id, "discord_username", e.target.value || null)
                      }
                      style={input}
                    />
                  </td>

                  <td style={td}>
                    <input
                      value={p.discord_id || ""}
                      onChange={(e) =>
                        updatePlayer(p.id, "discord_id", e.target.value || null)
                      }
                      style={input}
                    />
                  </td>

                  <td style={td}>
                    <select
                      value={p.active === false ? "false" : "true"}
                      onChange={(e) =>
                        updatePlayer(p.id, "active", e.target.value === "true")
                      }
                      style={input}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPlayers.length === 0 && !loading && (
          <p style={{ color: "orange", marginTop: 18 }}>No players found.</p>
        )}
      </section>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const title: React.CSSProperties = {
  fontSize: 34,
  marginBottom: 8,
}

const subtitle: React.CSSProperties = {
  color: "#cfcfcf",
  marginBottom: 28,
}

const panel: React.CSSProperties = {
  marginTop: 22,
  padding: 18,
  borderRadius: 14,
  border: "1px solid #333",
  background: "#111",
}

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 12,
}

const topRow: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
}

const input: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #444",
  background: "#050505",
  color: "white",
  width: "100%",
}

const button: React.CSSProperties = {
  background: "#2563eb",
  border: "none",
  padding: "10px 16px",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const count: React.CSSProperties = {
  color: "#aaa",
  marginTop: 14,
}

const table: React.CSSProperties = {
  marginTop: 14,
  borderCollapse: "collapse",
  minWidth: 900,
  width: "100%",
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