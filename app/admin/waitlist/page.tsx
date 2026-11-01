"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type WaitlistPlayer = {
  id: string
  screen_name: string
  league_type: string | null
  status: string | null
  discord_id: string | null
  discord_username: string | null
  discord_avatar: string | null
  notes: string | null
  created_at: string | null
}

const LEAGUE_DIVISIONS: Record<string, string[]> = {
  stroke: ["Stroke D1", "Stroke D2", "Stroke D3", "Stroke D4", "Stroke D5"],
  match: ["Match D1", "Match D2", "Match D3", "Match D4", "Match D5"],
  pyp: ["PYP D1", "PYP D2", "PYP D3", "PYP D4", "PYP D5"],
  pro: ["Pro D1", "Pro D2", "Pro D3", "Semi Pro D1", "Amateur D1"],
  doubles: ["Doubles D1", "Doubles D2", "Doubles D3"],
}

const LEAGUE_LABELS: Record<string, string> = {
  stroke: "Stroke",
  match: "Match",
  pyp: "PYP",
  pro: "Pro",
  doubles: "Doubles",
  cups: "Cups",
  community: "Community",
}

export default function WaitlistAdminPage() {
  const [waitlist, setWaitlist] = useState<WaitlistPlayer[]>([])
  const [divisionChoices, setDivisionChoices] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [mentionMode, setMentionMode] = useState(false)

  useEffect(() => {
    loadWaitlist()
  }, [])

  async function loadWaitlist() {
    setLoading(true)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("player_waitlist")
      .select("*")
      .in("status", ["waiting", "pending"])
      .order("created_at", { ascending: false })

    setLoading(false)

    if (error) {
      setErrorMessage(error.message)
      setWaitlist([])
      return
    }

    const rows = (data || []) as WaitlistPlayer[]
    setWaitlist(rows)

    const defaults: Record<string, string> = {}

    rows.forEach((player) => {
      const league = player.league_type || "match"
      defaults[player.id] = LEAGUE_DIVISIONS[league]?.[0] || "Match D1"
    })

    setDivisionChoices(defaults)
  }

  async function approvePlayer(player: WaitlistPlayer) {
    const league = player.league_type || "match"
    const division = divisionChoices[player.id] || LEAGUE_DIVISIONS[league]?.[0]

    setSavingId(player.id)
    setErrorMessage("")

    const { error: playerError } = await supabase.from("players").insert({
      screen_name: player.screen_name,
      league_type: league,
      division,
      discord_id: player.discord_id,
      discord_username: player.discord_username,
      discord_avatar: player.discord_avatar,
    })

    if (playerError) {
      setErrorMessage(playerError.message)
      setSavingId(null)
      return
    }

    const { error: deleteError } = await supabase
      .from("player_waitlist")
      .delete()
      .eq("id", player.id)

    if (deleteError) {
      setErrorMessage(deleteError.message)
      setSavingId(null)
      return
    }

    setSavingId(null)
    loadWaitlist()
  }

  async function removePlayer(player: WaitlistPlayer) {
    setSavingId(player.id)
    setErrorMessage("")

    const { error } = await supabase
      .from("player_waitlist")
      .delete()
      .eq("id", player.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    setSavingId(null)
    loadWaitlist()
  }

  const filtered = useMemo(() => {
    return waitlist.filter((p) => {
      const text = `${p.screen_name} ${p.discord_username || ""} ${p.discord_id || ""}`.toLowerCase()
      const matchesSearch = text.includes(search.toLowerCase())
      const matchesFilter = filter === "all" || (p.league_type || "match") === filter

      return matchesSearch && matchesFilter
    })
  }, [waitlist, filter, search])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: waitlist.length }

    waitlist.forEach((p) => {
      const league = p.league_type || "match"
      c[league] = (c[league] || 0) + 1
    })

    return c
  }, [waitlist])

  function formatPlayer(p: WaitlistPlayer) {
    if (mentionMode && p.discord_id) return `<@${p.discord_id}>`
    return p.screen_name
  }

  const visibleList = filtered.map(formatPlayer).join("\n")

  async function copyList() {
    await navigator.clipboard.writeText(visibleList)
    alert("Copied visible list")
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#05050a",
        color: "white",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 36, marginBottom: 6 }}>Waitlist Admin</h1>

        <p style={{ color: "#aaa", marginBottom: 24 }}>
          Review new league signups, assign divisions, approve players, or remove entries.
        </p>

        <div
          style={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 16,
            padding: 18,
            marginBottom: 24,
          }}
        >
          <button onClick={loadWaitlist} style={buttonBlue}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          {errorMessage && (
            <p style={{ color: "#ff6b6b", marginTop: 12, fontWeight: "bold" }}>
              Supabase error: {errorMessage}
            </p>
          )}

          <div style={{ marginTop: 18 }}>
            <input
              placeholder="Search player, Discord name, or Discord ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, width: "100%", maxWidth: 440 }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            {["all", "match", "stroke", "pyp", "doubles", "pro", "cups", "community"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: filter === f ? "2px solid #a855f7" : "1px solid #444",
                  background: filter === f ? "#2a123f" : "#080808",
                  color: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {f.toUpperCase()} ({counts[f] || 0})
              </button>
            ))}
          </div>

          <label style={{ display: "block", marginTop: 16, color: "#ddd" }}>
            <input
              type="checkbox"
              checked={mentionMode}
              onChange={(e) => setMentionMode(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Copy as Discord mentions
          </label>

          <button onClick={copyList} style={{ ...buttonBlue, marginTop: 12 }}>
            Copy Visible List
          </button>

          <textarea
            readOnly
            value={visibleList}
            style={{
              width: "100%",
              height: 110,
              marginTop: 12,
              background: "#050505",
              color: "white",
              border: "1px solid #333",
              borderRadius: 10,
              padding: 10,
            }}
          />
        </div>

        <h2 style={{ marginBottom: 12 }}>
          Visible Signups: {filtered.length}
        </h2>

        {filtered.length === 0 ? (
          <div style={emptyCard}>
            No waitlist entries found for this filter.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {filtered.map((player) => {
              const league = player.league_type || "match"
              const divisions = LEAGUE_DIVISIONS[league] || LEAGUE_DIVISIONS.match
              const canApprove = Boolean(LEAGUE_DIVISIONS[league])

              return (
                <div key={player.id} style={card}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ margin: 0 }}>{player.screen_name}</h2>
                      <p style={{ color: "#aaa", margin: "6px 0" }}>
                        Discord: {player.discord_username || "Unknown"}
                      </p>
                      <p style={{ color: "#aaa", margin: "6px 0" }}>
                        League: {LEAGUE_LABELS[league] || league}
                      </p>
                      <p style={{ color: "#aaa", margin: "6px 0" }}>
                        Status: <strong style={{ color: "#facc15" }}>{player.status || "unknown"}</strong>
                      </p>
                      {player.notes && (
                        <p style={{ color: "#ccc", margin: "6px 0" }}>
                          Notes: {player.notes}
                        </p>
                      )}
                    </div>

                    <div style={{ minWidth: 240 }}>
                      {canApprove && (
                        <>
                          <select
                            value={divisionChoices[player.id] || divisions[0]}
                            onChange={(e) =>
                              setDivisionChoices((prev) => ({
                                ...prev,
                                [player.id]: e.target.value,
                              }))
                            }
                            style={{ ...inputStyle, width: "100%", marginBottom: 10 }}
                          >
                            {divisions.map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>

                          <button
                            onClick={() => approvePlayer(player)}
                            disabled={savingId === player.id}
                            style={buttonGreen}
                          >
                            {savingId === player.id ? "Saving..." : "Approve"}
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => removePlayer(player)}
                        disabled={savingId === player.id}
                        style={buttonRed}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  background: "#111",
  color: "white",
  border: "1px solid #555",
  padding: 10,
  borderRadius: 8,
}

const card: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 16,
  padding: 18,
  background: "#101014",
}

const emptyCard: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 16,
  padding: 24,
  background: "#101014",
  color: "#aaa",
}

const buttonBlue: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  padding: "10px 14px",
  border: "none",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
}

const buttonGreen: React.CSSProperties = {
  background: "#22c55e",
  color: "white",
  padding: "10px 14px",
  border: "none",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
  marginRight: 8,
}

const buttonRed: React.CSSProperties = {
  background: "#7f1d1d",
  color: "white",
  padding: "10px 14px",
  border: "none",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
}