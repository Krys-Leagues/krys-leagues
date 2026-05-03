"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
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

type BracketResult = {
  id: string
  screen_name: string
  cup_tier_before: string | null
  cup_tier_after: string | null
  best_round_reached: number | null
  won_tournament: boolean | null
  notes: string | null
  created_at: string | null
}

export default function AdminPlayerProfile() {
  const params = useParams()
  const id = params.id as string

  const [player, setPlayer] = useState<Player | null>(null)
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [bracketResults, setBracketResults] = useState<BracketResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPlayerProfile() {
      const { data: playerData, error: playerError } = await supabase
        .from("player_tracker")
        .select("*")
        .eq("id", id)
        .single()

      if (playerError) {
        alert(playerError.message)
        console.error(playerError)
        setLoading(false)
        return
      }

      setPlayer(playerData as Player)

      const { data: trophyData } = await supabase
        .from("player_trophies")
        .select("*")
        .or(`player_id.eq.${id},player_name.eq.${playerData.screen_name}`)
        .order("created_at", { ascending: false })

      setTrophies((trophyData || []) as Trophy[])

      const { data: resultData } = await supabase
        .from("bracket_results")
        .select("*")
        .eq("player_id", id)
        .order("created_at", { ascending: false })

      setBracketResults((resultData || []) as BracketResult[])

      setLoading(false)
    }

    if (id) fetchPlayerProfile()
  }, [id])

  if (loading) {
    return <div style={{ padding: 20 }}>Loading player profile...</div>
  }

  if (!player) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Player Not Found</h1>
        <Link href="/admin/player-tracker">Back to Player Tracker</Link>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100 }}>
      <Link href="/admin/player-tracker" style={{ color: "#60a5fa" }}>
        ← Back to Player Tracker
      </Link>

      <h1>{player.screen_name}</h1>

      <section style={card}>
        <h2>Player Info</h2>

        <p><strong>Screen Name:</strong> {player.screen_name}</p>
        <p><strong>Discord Username:</strong> {player.discord_username || "Not set"}</p>
        <p><strong>Discord ID:</strong> {player.discord_id || "Not set"}</p>
        <p><strong>Status:</strong> {player.status || "active"}</p>
        <p><strong>Cup Tier:</strong> {(player.cup_tier || "spicy").toUpperCase()}</p>
        <p><strong>Best Bracket Round:</strong> {player.best_bracket_round || 0}</p>
        <p><strong>Bracket Wins:</strong> {player.bracket_wins || 0}</p>
        <p><strong>Notes:</strong> {player.notes || "None"}</p>
      </section>

      <section style={card}>
        <h2>Trophies</h2>

        {trophies.length === 0 ? (
          <p style={{ color: "#888" }}>No trophies added yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {trophies.map((trophy) => (
              <div key={trophy.id} style={trophyCard}>
                <h3>{trophy.trophy_title || trophy.placement || "Trophy"}</h3>

                {trophy.image_url && (
                  <img
                    src={trophy.image_url}
                    alt={trophy.trophy_title || trophy.player_name}
                    style={{
                      width: "100%",
                      borderRadius: 10,
                      border: "1px solid #333",
                    }}
                  />
                )}

                <p><strong>Event:</strong> {trophy.event_name || trophy.event_type || "Not set"}</p>
                <p><strong>League:</strong> {trophy.league_type || "Not set"}</p>
                <p><strong>Division:</strong> {trophy.division || "Not set"}</p>
                <p><strong>Placement:</strong> {trophy.placement || "Not set"}</p>
                <p><strong>When:</strong> {[trophy.season, trophy.week, trophy.month].filter(Boolean).join(" / ") || "Not set"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={card}>
        <h2>Bracket History</h2>

        {bracketResults.length === 0 ? (
          <p style={{ color: "#888" }}>No bracket results yet.</p>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Round</th>
                <th style={th}>Won</th>
                <th style={th}>Tier Before</th>
                <th style={th}>Tier After</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {bracketResults.map((result) => (
                <tr key={result.id}>
                  <td style={td}>{result.created_at ? new Date(result.created_at).toLocaleDateString() : ""}</td>
                  <td style={td}>{result.best_round_reached || 0}</td>
                  <td style={td}>{result.won_tournament ? "Yes" : "No"}</td>
                  <td style={td}>{result.cup_tier_before || ""}</td>
                  <td style={td}>{result.cup_tier_after || ""}</td>
                  <td style={td}>{result.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={card}>
        <h2>Career Profile Foundation</h2>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={miniCard}>
            <h3>League History</h3>
            <p>Coming later: Stroke, PYP, Doubles, Pro League, KWT, and Monthlies history.</p>
          </div>

          <div style={miniCard}>
            <h3>Badges</h3>
            <p>Coming later: Kiwi, Kiwi Slice, Most Aces, rare aces, records, and more.</p>
          </div>

          <div style={miniCard}>
            <h3>Records</h3>
            <p>Coming later: solo records, multiplayer records, race records, and leaderboard entries.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

const card: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  padding: 16,
  marginBottom: 20,
  background: "#080808",
}

const trophyCard: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  padding: 14,
  background: "#111",
}

const miniCard: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 8,
  padding: 12,
  background: "#111",
}

const th: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #444",
  textAlign: "left",
}

const td: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #222",
}