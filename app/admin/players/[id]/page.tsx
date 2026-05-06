"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
  discord_username: string | null
}

type Trophy = {
  id: string
  trophy_title: string | null
  placement: string | null
  event_name: string | null
  division: string | null
  season: string | null
  week: string | null
  image_url: string | null
}

export default function PlayerProfilePage() {
  const { id } = useParams()
  const router = useRouter()

  const [player, setPlayer] = useState<Player | null>(null)
  const [trophies, setTrophies] = useState<Trophy[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // load player
    const { data: playerData } = await supabase
      .from("players")
      .select("*")
      .eq("id", id)
      .single()

    setPlayer(playerData)

    // load trophies
    const { data: trophyData } = await supabase
      .from("player_trophies")
      .select("*")
      .eq("player_id", id)
      .order("created_at", { ascending: false })

    setTrophies(trophyData || [])
  }

  if (!player) {
    return <p style={{ color: "white", padding: 20 }}>Loading player...</p>
  }

  return (
    <main style={page}>
      <div style={container}>

        {/* NAV */}
        <div style={topBar}>
          <button onClick={() => router.push("/admin/players")} style={backButton}>
            ← Players
          </button>

          <button onClick={() => router.push("/admin")} style={backButtonSecondary}>
            ← Admin
          </button>
        </div>

        {/* PLAYER INFO */}
        <div style={card}>
          <h1 style={{ fontSize: 36 }}>{player.screen_name}</h1>

          {player.discord_username && (
            <p style={{ color: "#aaa" }}>
              Discord: {player.discord_username}
            </p>
          )}
        </div>

        {/* TROPHIES */}
        <div style={card}>
          <h2>🏆 Trophies ({trophies.length})</h2>

          {trophies.length === 0 ? (
            <p style={{ color: "#888" }}>No trophies yet.</p>
          ) : (
            <div style={grid}>
              {trophies.map((t) => (
                <div key={t.id} style={trophyCard}>
                  <h3>{t.trophy_title || t.placement || "Trophy"}</h3>

                  <p>{t.event_name}</p>
                  <p>{t.division}</p>

                  <p style={{ color: "#aaa" }}>
                    {[t.season, t.week].filter(Boolean).join(" / ")}
                  </p>

                  {t.image_url && (
                    <img
                      src={t.image_url}
                      style={{
                        width: "100%",
                        borderRadius: 10,
                        marginTop: 10,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/* styles */

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  display: "flex",
  justifyContent: "center",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  padding: 30,
}

const topBar: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginBottom: 20,
}

const backButton: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  border: "none",
  borderRadius: 8,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
}

const backButtonSecondary: React.CSSProperties = {
  padding: "10px 16px",
  background: "#222",
  border: "1px solid #555",
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
}

const card: React.CSSProperties = {
  background: "#050505",
  border: "1px solid #333",
  borderRadius: 18,
  padding: 24,
  marginBottom: 20,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 16,
}

const trophyCard: React.CSSProperties = {
  background: "#111",
  border: "1px solid #444",
  borderRadius: 12,
  padding: 14,
}