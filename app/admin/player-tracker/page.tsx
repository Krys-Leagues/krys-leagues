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
  best_bracket_round: number | null
  bracket_wins: number | null
  notes: string | null
}

type WaitlistPlayer = {
  screen_name: string | null
  discord_username: string | null
  discord_id: string | null
}

const STATUS_OPTIONS = ["active", "inactive"]
const CUP_OPTIONS = ["spicy", "krys", "champion"]

export default function PlayerTracker() {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [mentionMode, setMentionMode] = useState(false)

  const [form, setForm] = useState({
    screen_name: "",
    discord_username: "",
    discord_id: "",
    status: "active",
    cup_tier: "spicy",
    best_bracket_round: 0,
    bracket_wins: 0,
    notes: "",
  })

  async function fetchPlayers() {
    setLoading(true)

    const { data, error } = await supabase
      .from("player_tracker")
      .select("*")
      .order("screen_name", { ascending: true })

    if (error) {
      alert(error.message)
      console.error(error)
    }

    if (data) setPlayers(data)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPlayers()
  }, [])

  async function addPlayer() {
    if (!form.screen_name.trim()) {
      alert("Screen name required")
      return
    }

    const { error } = await supabase.from("player_tracker").insert([
      {
        screen_name: form.screen_name.trim(),
        discord_username: form.discord_username.trim(),
        discord_id: form.discord_id.trim() || null,
        status: form.status,
        cup_tier: form.cup_tier,
        best_bracket_round: form.best_bracket_round,
        bracket_wins: form.bracket_wins,
        notes: form.notes.trim(),
      },
    ])

    if (error) {
      alert(error.message)
      console.error(error)
      return
    }

    setForm({
      screen_name: "",
      discord_username: "",
      discord_id: "",
      status: "active",
      cup_tier: "spicy",
      best_bracket_round: 0,
      bracket_wins: 0,
      notes: "",
    })

    fetchPlayers()
  }

  async function importWaitlist() {
    const { data, error } = await supabase
      .from("player_waitlist")
      .select("screen_name, discord_username, discord_id")

    if (error) {
      alert(error.message)
      console.error(error)
      return
    }

    const waitlist = (data || []) as WaitlistPlayer[]

    const existingScreenNames = new Set(
      players.map((p) => (p.screen_name || "").toLowerCase().trim())
    )

    const existingDiscordIds = new Set(
      players.map((p) => p.discord_id).filter(Boolean)
    )

    const inserts = waitlist
      .filter((p) => p.screen_name)
      .filter((p) => {
        const screenName = (p.screen_name || "").toLowerCase().trim()
        const discordId = p.discord_id || ""

        if (existingScreenNames.has(screenName)) return false
        if (discordId && existingDiscordIds.has(discordId)) return false

        return true
      })
      .map((p) => ({
        screen_name: p.screen_name,
        discord_username: p.discord_username || "",
        discord_id: p.discord_id || null,
        status: "active",
        cup_tier: "spicy",
        best_bracket_round: 0,
        bracket_wins: 0,
        notes: "",
      }))

    if (inserts.length === 0) {
      alert("No new waitlist players to import")
      return
    }

    const { error: insertError } = await supabase
      .from("player_tracker")
      .insert(inserts)

    if (insertError) {
      alert(insertError.message)
      console.error(insertError)
      return
    }

    alert(`Imported ${inserts.length} players`)
    fetchPlayers()
  }

  async function updatePlayer(id: string, field: string, value: string | number | null) {
    const { error } = await supabase
      .from("player_tracker")
      .update({ [field]: value })
      .eq("id", id)

    if (error) {
      alert(error.message)
      console.error(error)
      return
    }

    fetchPlayers()
  }

  function suggestedTier(player: Player) {
    const round = player.best_bracket_round || 0

    if (round >= 10) return "champion"
    if (round >= 3) return "krys"
    return "spicy"
  }

  async function applySuggestedTier(player: Player) {
    await updatePlayer(player.id, "cup_tier", suggestedTier(player))
  }

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const searchText = `${p.screen_name || ""} ${p.discord_username || ""} ${p.discord_id || ""}`
        .toLowerCase()
        .trim()

      const matchesSearch = searchText.includes(search.toLowerCase().trim())

      const matchesFilter =
        filter === "all" ||
        p.status === filter ||
        p.cup_tier === filter

      return matchesSearch && matchesFilter
    })
  }, [players, filter, search])

  function formatPlayerLine(player: Player) {
    if (mentionMode && player.discord_id) {
      return `<@${player.discord_id}>`
    }

    return player.screen_name
  }

  function buildList(list: Player[]) {
    return list.map(formatPlayerLine).filter(Boolean).join("\n")
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    alert(`Copied ${label}`)
  }

  const visibleList = buildList(filteredPlayers)
  const spicyList = buildList(players.filter((p) => p.cup_tier === "spicy"))
  const krysList = buildList(players.filter((p) => p.cup_tier === "krys"))
  const championList = buildList(players.filter((p) => p.cup_tier === "champion"))

  return (
    <div style={{ padding: 20, maxWidth: 1300 }}>
      <h1>Player Tracker</h1>
      <p>
        Cup/bracket tracker only. League divisions and Welcome divisions stay inside each league system.
      </p>
      <p style={{ padding: 12, border: "1px solid #a16207", background: "#291d08", color: "#fde68a" }}>
        Discord values on this legacy tournament tracker are reference-only and do not edit global player identity. Use Player Matching to link Discord to a verified canonical player UUID.
      </p>

      <h2>Add Player</h2>

      <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
        <label>Screen Name</label>
        <input
          value={form.screen_name}
          onChange={(e) => setForm({ ...form, screen_name: e.target.value })}
        />

        <label>Player Status</label>
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </select>

        <label>Cup Tier</label>
        <select
          value={form.cup_tier}
          onChange={(e) => setForm({ ...form, cup_tier: e.target.value })}
        >
          {CUP_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c.toUpperCase()}
            </option>
          ))}
        </select>

        <label>Best Bracket Round</label>
        <input
          type="number"
          value={form.best_bracket_round}
          onChange={(e) =>
            setForm({
              ...form,
              best_bracket_round: Number(e.target.value),
            })
          }
        />

        <label>Bracket Wins</label>
        <input
          type="number"
          value={form.bracket_wins}
          onChange={(e) =>
            setForm({
              ...form,
              bracket_wins: Number(e.target.value),
            })
          }
        />

        <label>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        <button onClick={addPlayer}>Add Player</button>
        <button onClick={importWaitlist}>Import Waitlist Players</button>
      </div>

      <hr style={{ margin: "24px 0" }} />

      <h2>Filters</h2>

      <input
        placeholder="Search player, Discord, or ID..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12, padding: 8, width: "100%", maxWidth: 420 }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["all", "spicy", "krys", "champion", "active", "inactive"].map(
          (item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              style={{
                padding: "6px 10px",
                border: filter === item ? "2px solid white" : "1px solid #555",
                background: filter === item ? "#222" : "#111",
                color: "white",
                cursor: "pointer",
              }}
            >
              {item.toUpperCase()}
            </button>
          )
        )}
      </div>

      <p>
        Showing: {filteredPlayers.length} / {players.length}
      </p>

      <label style={{ display: "block", marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={mentionMode}
          onChange={(e) => setMentionMode(e.target.checked)}
        />{" "}
        Copy as Discord mentions when Discord ID exists
      </label>

      <h2>Tourney List Builder</h2>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => copyText(visibleList, "visible list")}>
          Copy Visible List
        </button>

        <button onClick={() => copyText(spicyList, "Spicy list")}>
          Copy Spicy List
        </button>

        <button onClick={() => copyText(krysList, "Krys list")}>
          Copy Krys List
        </button>

        <button onClick={() => copyText(championList, "Champion list")}>
          Copy Champion List
        </button>
      </div>

      <textarea
        readOnly
        value={visibleList}
        style={{ width: "100%", height: 120, marginBottom: 20 }}
      />

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Record</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Player</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Legacy Discord Name</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Legacy Discord ID</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Status</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Cup Tier</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Best Round</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Wins</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Suggested</th>
              <th style={{ padding: 8, borderBottom: "1px solid #444" }}>Notes</th>
            </tr>
          </thead>

          <tbody>
            {filteredPlayers.map((p) => (
              <tr key={p.id}>
                <td style={{ padding: 6 }}>
                  Tracker only
                </td>

                <td style={{ padding: 6 }}>{p.screen_name}</td>

                <td style={{ padding: 6 }}>
                  {p.discord_username || "—"}
                </td>

                <td style={{ padding: 6 }}>
                  {p.discord_id ? "Stored in tracker" : "—"}
                </td>

                <td style={{ padding: 6 }}>
                  <select
                    value={p.status || "active"}
                    onChange={(e) =>
                      updatePlayer(p.id, "status", e.target.value)
                    }
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </td>

                <td style={{ padding: 6 }}>
                  <select
                    value={p.cup_tier || "spicy"}
                    onChange={(e) =>
                      updatePlayer(p.id, "cup_tier", e.target.value)
                    }
                  >
                    {CUP_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </td>

                <td style={{ padding: 6 }}>
                  <input
                    type="number"
                    value={p.best_bracket_round || 0}
                    onChange={(e) =>
                      updatePlayer(
                        p.id,
                        "best_bracket_round",
                        Number(e.target.value)
                      )
                    }
                    style={{ width: 70 }}
                  />
                </td>

                <td style={{ padding: 6 }}>
                  <input
                    type="number"
                    value={p.bracket_wins || 0}
                    onChange={(e) =>
                      updatePlayer(
                        p.id,
                        "bracket_wins",
                        Number(e.target.value)
                      )
                    }
                    style={{ width: 70 }}
                  />
                </td>

                <td style={{ padding: 6 }}>
                  <button onClick={() => applySuggestedTier(p)}>
                    {suggestedTier(p).toUpperCase()}
                  </button>
                </td>

                <td style={{ padding: 6 }}>
                  <textarea
                    value={p.notes || ""}
                    onChange={(e) =>
                      updatePlayer(p.id, "notes", e.target.value)
                    }
                    style={{ minWidth: 180 }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
