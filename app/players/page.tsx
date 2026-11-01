"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import PlayerAvatar from "@/components/PlayerAvatar"
import {
  loadCanonicalPublicPlayers,
  type CanonicalPublicPlayer,
} from "@/lib/publicPlayers"

export default function PlayerProfilesPage() {
  const [players, setPlayers] = useState<CanonicalPublicPlayer[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let active = true

    void loadCanonicalPublicPlayers().then((response) => {
      if (!active) return

      if (response.error) {
        setMessage(response.error.message)
      } else {
        setPlayers(response.data)
      }

      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return players

    return players.filter((player) =>
      player.screen_name.toLowerCase().includes(query)
    )
  }, [players, search])

  return (
    <main style={page}>
      <div style={container}>
        <Link href="/" style={backButton}>
          ← Krys Leagues
        </Link>

        <section style={hero}>
          <p style={eyebrow}>Global Players</p>
          <h1 style={title}>Player Profiles</h1>
          <p style={subtitle}>
            Find a Krys Leagues player and view their public profile, league
            history, trophies, and achievements.
          </p>

          <label style={searchLabel}>
            <span>Search players</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by screen name..."
              style={searchInput}
            />
          </label>
        </section>

        {loading ? (
          <div style={messageCard}>Loading player profiles...</div>
        ) : message ? (
          <div style={errorCard}>{message}</div>
        ) : filteredPlayers.length === 0 ? (
          <div style={messageCard}>
            {search ? "No players match that search." : "No active players found."}
          </div>
        ) : (
          <section style={directory} aria-label="Player profiles">
            {filteredPlayers.map((player) => (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                style={playerCard}
              >
                <PlayerAvatar
                  screenName={player.screen_name}
                  avatarPath={player.avatar_path}
                  size={76}
                />

                <span style={playerDetails}>
                  <strong style={playerName}>{player.screen_name}</strong>
                  <span style={viewProfile}>View public profile →</span>
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: "28px 18px",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1100,
  margin: "0 auto",
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 18,
  padding: "10px 16px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const hero: React.CSSProperties = {
  padding: "clamp(24px, 5vw, 44px)",
  marginBottom: 20,
  border: "1px solid #334155",
  borderRadius: 20,
  background: "rgba(2, 6, 23, 0.9)",
}

const eyebrow: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#60a5fa",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".14em",
  textTransform: "uppercase",
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(36px, 7vw, 56px)",
}

const subtitle: React.CSSProperties = {
  maxWidth: 680,
  margin: "14px 0 24px",
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.6,
}

const searchLabel: React.CSSProperties = {
  display: "flex",
  maxWidth: 560,
  flexDirection: "column",
  gap: 8,
  fontWeight: 800,
}

const searchInput: React.CSSProperties = {
  width: "100%",
  padding: "13px 15px",
  border: "1px solid #475569",
  borderRadius: 11,
  background: "#0f172a",
  color: "white",
  fontSize: 17,
}

const directory: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
}

const playerCard: React.CSSProperties = {
  display: "flex",
  minWidth: 0,
  alignItems: "center",
  gap: 16,
  padding: 18,
  border: "1px solid #334155",
  borderRadius: 16,
  background: "rgba(15, 23, 42, 0.94)",
  color: "white",
  textDecoration: "none",
}

const playerDetails: React.CSSProperties = {
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: 7,
}

const playerName: React.CSSProperties = {
  overflowWrap: "anywhere",
  fontSize: 20,
}

const viewProfile: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 14,
  fontWeight: 750,
}

const messageCard: React.CSSProperties = {
  padding: 28,
  border: "1px solid #334155",
  borderRadius: 16,
  background: "#0f172a",
  color: "#cbd5e1",
  textAlign: "center",
}

const errorCard: React.CSSProperties = {
  ...messageCard,
  borderColor: "#991b1b",
  color: "#fecaca",
}
