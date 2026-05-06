"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Trophy = {
  id: string
  player_name: string
  player_id: string | null
  event_type: string | null
  event_name: string | null
  league_type: string | null
  division: string | null
  placement: string | null
  season: string | null
  week: string | null
  month: string | null
  trophy_title: string | null
  image_url: string | null
  notes: string | null
  created_at: string | null
}

type Player = {
  id: string
  screen_name: string
}

const EVENT_TYPES = ["KWT", "Monthly", "Cup", "League", "Special"]
const PLACEMENTS = ["1st", "2nd", "3rd", "Most Aces", "Clean Round", "Badge", "Other"]

export default function TrophyAdminPage() {
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    player_name: "",
    player_id: "",
    event_type: "KWT",
    event_name: "",
    league_type: "",
    division: "",
    placement: "1st",
    season: "",
    week: "",
    month: "",
    trophy_title: "",
    image_url: "",
    notes: "",
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const { data: trophyData, error: trophyError } = await supabase
      .from("player_trophies")
      .select("*")
      .order("created_at", { ascending: false })

    if (trophyError) {
      alert(trophyError.message)
      console.error(trophyError)
    }

    const { data: playerData, error: playerError } = await supabase
      .from("player_tracker")
      .select("id, screen_name")
      .order("screen_name", { ascending: true })

    if (playerError) {
      console.error(playerError)
    }

    setTrophies((trophyData || []) as Trophy[])
    setPlayers((playerData || []) as Player[])
    setLoading(false)
  }

  function choosePlayer(playerId: string) {
    const player = players.find((p) => p.id === playerId)

    setForm({
      ...form,
      player_id: playerId,
      player_name: player?.screen_name || form.player_name,
    })
  }

  async function addTrophy() {
    if (!form.player_name.trim()) {
      alert("Player name required")
      return
    }

    const { error } = await supabase.from("player_trophies").insert({
      player_name: form.player_name.trim(),
      player_id: form.player_id || null,
      event_type: form.event_type,
      event_name: form.event_name.trim(),
      league_type: form.league_type.trim(),
      division: form.division.trim(),
      placement: form.placement,
      season: form.season.trim(),
      week: form.week.trim(),
      month: form.month.trim(),
      trophy_title: form.trophy_title.trim(),
      image_url: form.image_url.trim(),
      notes: form.notes.trim(),
    })

    if (error) {
      alert(error.message)
      console.error(error)
      return
    }

    setForm({
      player_name: "",
      player_id: "",
      event_type: "KWT",
      event_name: "",
      league_type: "",
      division: "",
      placement: "1st",
      season: "",
      week: "",
      month: "",
      trophy_title: "",
      image_url: "",
      notes: "",
    })

    loadData()
  }

  async function deleteTrophy(id: string) {
    const ok = confirm("Delete this trophy entry?")
    if (!ok) return

    const { error } = await supabase.from("player_trophies").delete().eq("id", id)

    if (error) {
      alert(error.message)
      console.error(error)
      return
    }

    loadData()
  }

  const filteredTrophies = useMemo(() => {
    const q = search.toLowerCase().trim()

    return trophies.filter((t) => {
      const text = `${t.player_name || ""} ${t.event_type || ""} ${t.event_name || ""} ${t.league_type || ""} ${t.division || ""} ${t.placement || ""} ${t.season || ""} ${t.week || ""} ${t.month || ""} ${t.trophy_title || ""}`
        .toLowerCase()
        .trim()

      return text.includes(q)
    })
  }, [trophies, search])

  return (
    <main style={{ background: "black", color: "white", minHeight: "100vh", padding: 24 }}>
      <h1>Trophy Admin</h1>

      <p style={{ color: "#aaa" }}>
        Add and manage trophy records. Trophies are manually created elsewhere; this page stores and connects them.
      </p>

      <section style={card}>
        <h2>Add Trophy</h2>

        <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
          <label>Connect to Player Profile</label>
          <select value={form.player_id} onChange={(e) => choosePlayer(e.target.value)} style={inputStyle}>
            <option value="">No linked profile / manual name</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.screen_name}
              </option>
            ))}
          </select>

          <label>Player Name</label>
          <input
            value={form.player_name}
            onChange={(e) => setForm({ ...form, player_name: e.target.value })}
            style={inputStyle}
          />

          <label>Event Type</label>
          <select
            value={form.event_type}
            onChange={(e) => setForm({ ...form, event_type: e.target.value })}
            style={inputStyle}
          >
            {EVENT_TYPES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <label>Event Name</label>
          <input
            placeholder="KWT Week 12, Spicy Cup, Monthly April..."
            value={form.event_name}
            onChange={(e) => setForm({ ...form, event_name: e.target.value })}
            style={inputStyle}
          />

          <label>League Type</label>
          <input
            placeholder="kwt, monthly, cups, stroke, pyp..."
            value={form.league_type}
            onChange={(e) => setForm({ ...form, league_type: e.target.value })}
            style={inputStyle}
          />

          <label>Division</label>
          <input
            placeholder="Amateur, Semi Pro, Pro, Elite, etc."
            value={form.division}
            onChange={(e) => setForm({ ...form, division: e.target.value })}
            style={inputStyle}
          />

          <label>Placement / Trophy Type</label>
          <select
            value={form.placement}
            onChange={(e) => setForm({ ...form, placement: e.target.value })}
            style={inputStyle}
          >
            {PLACEMENTS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>

          <label>Season</label>
          <input
            placeholder="S12"
            value={form.season}
            onChange={(e) => setForm({ ...form, season: e.target.value })}
            style={inputStyle}
          />

          <label>Week</label>
          <input
            placeholder="W11"
            value={form.week}
            onChange={(e) => setForm({ ...form, week: e.target.value })}
            style={inputStyle}
          />

          <label>Month</label>
          <input
            placeholder="April 2026"
            value={form.month}
            onChange={(e) => setForm({ ...form, month: e.target.value })}
            style={inputStyle}
          />

          <label>Trophy Title</label>
          <input
            placeholder="Elite 1st Place, Most Aces, Kiwi..."
            value={form.trophy_title}
            onChange={(e) => setForm({ ...form, trophy_title: e.target.value })}
            style={inputStyle}
          />

          <label>Image URL</label>
          <input
            placeholder="Paste trophy image URL"
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            style={inputStyle}
          />

          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={inputStyle}
          />

          <button onClick={addTrophy} style={buttonGreen}>
            Add Trophy
          </button>
        </div>
      </section>

      <section style={card}>
        <h2>Trophy List</h2>

        <input
          placeholder="Search player, event, division, week..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, width: "100%", maxWidth: 520 }}
        />

        <p style={{ color: "#aaa" }}>
          Showing {filteredTrophies.length} / {trophies.length}
        </p>

        {loading ? (
          <p>Loading trophies...</p>
        ) : filteredTrophies.length === 0 ? (
          <p style={{ color: "#888" }}>No trophies found.</p>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {filteredTrophies.map((trophy) => (
              <div key={trophy.id} style={trophyCard}>
                <h3 style={{ marginTop: 0 }}>
                  {trophy.trophy_title || trophy.placement || "Trophy"}
                </h3>

                <p><strong>Player:</strong> {trophy.player_name}</p>
                <p><strong>Event:</strong> {trophy.event_name || trophy.event_type || "Not set"}</p>
                <p><strong>League:</strong> {trophy.league_type || "Not set"}</p>
                <p><strong>Division:</strong> {trophy.division || "Not set"}</p>
                <p><strong>Season/Week/Month:</strong> {[trophy.season, trophy.week, trophy.month].filter(Boolean).join(" / ") || "Not set"}</p>
                <p><strong>Placement:</strong> {trophy.placement || "Not set"}</p>

                {trophy.image_url && (
                  <img
                    src={trophy.image_url}
                    alt={trophy.trophy_title || trophy.player_name}
                    style={{
                      width: "100%",
                      maxWidth: 240,
                      borderRadius: 10,
                      border: "1px solid #333",
                      marginTop: 8,
                    }}
                  />
                )}

                {trophy.notes && <p><strong>Notes:</strong> {trophy.notes}</p>}

                <button onClick={() => deleteTrophy(trophy.id)} style={buttonRed}>
                  Delete Trophy
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

const card: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  padding: 18,
  marginBottom: 20,
  background: "#080808",
}

const trophyCard: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  padding: 16,
  background: "#111",
}

const inputStyle: React.CSSProperties = {
  background: "#111",
  color: "white",
  border: "1px solid #555",
  padding: 10,
  borderRadius: 8,
}

const buttonGreen: React.CSSProperties = {
  background: "#22c55e",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
}

const buttonRed: React.CSSProperties = {
  background: "#7f1d1d",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  cursor: "pointer",
  marginTop: 10,
}