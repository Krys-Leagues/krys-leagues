"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type WaitlistPlayer = {
  id: number
  screen_name: string
  league_type: string | null
  discord_id: string | null
  discord_username: string | null
  discord_avatar: string | null
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
  const [divisionChoices, setDivisionChoices] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)

  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [mentionMode, setMentionMode] = useState(false)

  useEffect(() => {
    loadWaitlist()
  }, [])

  async function loadWaitlist() {
    setLoading(true)

    const { data } = await supabase
      .from("player_waitlist")
      .select("*")
      .order("created_at", { ascending: true })

    setLoading(false)

    const rows = (data || []) as WaitlistPlayer[]
    setWaitlist(rows)

    const defaults: Record<number, string> = {}

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

    await supabase.from("players").insert({
      screen_name: player.screen_name,
      league_type: league,
      division,
      discord_id: player.discord_id,
      discord_username: player.discord_username,
      discord_avatar: player.discord_avatar,
    })

    await supabase.from("player_waitlist").delete().eq("id", player.id)

    setSavingId(null)
    loadWaitlist()
  }

  async function removePlayer(player: WaitlistPlayer) {
    setSavingId(player.id)

    await supabase.from("player_waitlist").delete().eq("id", player.id)

    setSavingId(null)
    loadWaitlist()
  }

  const filtered = useMemo(() => {
    return waitlist.filter((p) => {
      const text = `${p.screen_name} ${p.discord_username || ""}`.toLowerCase()
      const matchesSearch = text.includes(search.toLowerCase())

      const matchesFilter =
        filter === "all" || (p.league_type || "match") === filter

      return matchesSearch && matchesFilter
    })
  }, [waitlist, filter, search])

  function formatPlayer(p: WaitlistPlayer) {
    if (mentionMode && p.discord_id) {
      return `<@${p.discord_id}>`
    }
    return p.screen_name
  }

  const visibleList = filtered.map(formatPlayer).join("\n")

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    waitlist.forEach((p) => {
      const l = p.league_type || "match"
      c[l] = (c[l] || 0) + 1
    })
    return c
  }, [waitlist])

  async function copyList() {
    await navigator.clipboard.writeText(visibleList)
    alert("Copied list")
  }

  return (
    <main style={{ minHeight: "100vh", background: "#000", color: "white", padding: 24 }}>
      <h1>Waitlist Admin</h1>

      <button onClick={loadWaitlist} style={buttonBlue}>
        Refresh
      </button>

      <h2>Filters</h2>

      <input
        placeholder="Search player..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...inputStyle, marginBottom: 12 }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["all", "match", "stroke", "pyp", "doubles", "pro", "cups", "community"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 10px",
              border: filter === f ? "2px solid white" : "1px solid #555",
              background: "#111",
              color: "white",
            }}
          >
            {f.toUpperCase()} ({counts[f] || 0})
          </button>
        ))}
      </div>

      <label style={{ display: "block", marginTop: 12 }}>
        <input
          type="checkbox"
          checked={mentionMode}
          onChange={(e) => setMentionMode(e.target.checked)}
        />
        Copy as Discord mentions
      </label>

      <button onClick={copyList} style={{ marginTop: 10 }}>
        Copy Visible List
      </button>

      <textarea
        readOnly
        value={visibleList}
        style={{ width: "100%", height: 120, marginTop: 10 }}
      />

      <div style={{ marginTop: 24 }}>
        {filtered.map((player) => {
          const league = player.league_type || "match"
          const divisions = LEAGUE_DIVISIONS[league] || LEAGUE_DIVISIONS.match

          return (
            <div key={player.id} style={card}>
              <h2>{player.screen_name}</h2>

              <p>Discord: {player.discord_username}</p>
              <p>League: {LEAGUE_LABELS[league] || league}</p>

              {LEAGUE_DIVISIONS[league] && (
                <>
                  <select
                    value={divisionChoices[player.id] || divisions[0]}
                    onChange={(e) =>
                      setDivisionChoices((prev) => ({
                        ...prev,
                        [player.id]: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    {divisions.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>

                  <button onClick={() => approvePlayer(player)} style={buttonGreen}>
                    Approve
                  </button>
                </>
              )}

              <button onClick={() => removePlayer(player)} style={buttonRed}>
                Remove
              </button>
            </div>
          )
        })}
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
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  background: "#080808",
}

const buttonBlue = { background: "#2563eb", color: "white", padding: 10 }
const buttonGreen = { background: "#22c55e", color: "white", padding: 10 }
const buttonRed = { background: "#7f1d1d", color: "white", padding: 10 }