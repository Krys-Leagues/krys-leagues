"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

type Player = {
  id: string
  screen_name: string
}

type Trophy = {
  id: string
  player_id: string
  trophy_title: string | null
  placement: string | null
  event_name: string | null
  division: string | null
  season: string | null
  week: string | null
  image_url: string | null
}

type ChampionEntry = Trophy & {
  playerName: string
}

export default function ChampionsPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    loadChampions()
  }, [])

  async function loadChampions() {
    setLoading(true)
    setMessage("")

    const [playersResponse, trophiesResponse] = await Promise.all([
      supabase
        .from("players")
        .select("id, screen_name")
        .order("screen_name", { ascending: true }),

      supabase
        .from("player_trophies")
        .select(
          "id, player_id, trophy_title, placement, event_name, division, season, week, image_url"
        )
        .order("season", { ascending: false }),
    ])

    const firstError =
      playersResponse.error || trophiesResponse.error

    if (firstError) {
      setMessage(firstError.message)
      setLoading(false)
      return
    }

    setPlayers(playersResponse.data || [])
    setTrophies(trophiesResponse.data || [])
    setLoading(false)
  }

  const championEntries = useMemo<ChampionEntry[]>(() => {
    const playerNames = new Map(
      players.map((player) => [player.id, player.screen_name])
    )

    return trophies.map((trophy) => ({
      ...trophy,
      playerName:
        playerNames.get(trophy.player_id) || "Unknown Player",
    }))
  }, [players, trophies])

  const leagueChampions = useMemo(() => {
    return championEntries.filter((entry) => {
      const text = searchableText(entry)

      return (
        text.includes("league champion") ||
        text.includes("season champion") ||
        text.includes("division champion")
      )
    })
  }, [championEntries])

  const bracketChampions = useMemo(() => {
    return championEntries.filter((entry) => {
      const text = searchableText(entry)

      return (
        text.includes("bracket champion") ||
        text.includes("tournament champion") ||
        text.includes("bracket winner")
      )
    })
  }, [championEntries])

  const krysCupEntries = useMemo(() => {
    return championEntries.filter((entry) =>
      searchableText(entry).includes("krys cup")
    )
  }, [championEntries])

  const spicyCupEntries = useMemo(() => {
    return championEntries.filter((entry) =>
      searchableText(entry).includes("spicy cup")
    )
  }, [championEntries])

  const championOfChampionsEntries = useMemo(() => {
    return championEntries.filter((entry) =>
      searchableText(entry).includes("champion of champions")
    )
  }, [championEntries])

  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <Link href="/" style={backButton}>
            ← Krys Leagues
          </Link>

          <Link href="/records" style={backButton}>
            League Records
          </Link>

          <Link href="/players" style={backButton}>
            Player Profiles
          </Link>
        </div>

        <section style={hero}>
          <h1 style={title}>🏆 Hall of Champions</h1>

          <p style={subtitle}>
            Celebrating league champions, tournament winners, cup
            achievements, and the greatest accomplishments in Krys
            Leagues.
          </p>
        </section>

        {loading ? (
          <div style={messageCard}>
            Loading Hall of Champions...
          </div>
        ) : message ? (
          <div style={errorCard}>{message}</div>
        ) : (
          <>
            <section style={featuredCard}>
              <div style={featuredContent}>
                <div>
                  <p style={eyebrow}>ULTIMATE HONOUR</p>

                  <h2 style={featuredTitle}>
                    👑 Champion of Champions
                  </h2>

                  {championOfChampionsEntries.length > 0 ? (
                    <ChampionList
                      entries={championOfChampionsEntries}
                    />
                  ) : (
                    <div style={featuredWinner}>
                      <strong style={winnerName}>BLUTES87</strong>

                      <span style={muted}>
                        2026 Champion of Champions
                      </span>
                    </div>
                  )}
                </div>

                <video
                  controls
                  playsInline
                  preload="metadata"
                  style={featuredVideo}
                >
                  <source
                    src="/league-media/trophies/champion-of-champions.mp4"
                    type="video/mp4"
                  />
                </video>
              </div>
            </section>

            <div style={grid}>
              <ChampionSection
                title="🏅 League Champions"
                description="Season and division champions across Krys Leagues."
                entries={leagueChampions}
              />

              <ChampionSection
                title="🥇 Bracket Tournament Champions"
                description="Players who won their tournament bracket."
                entries={bracketChampions}
              />

              <ChampionSection
                title="🏆 Krys Cup"
                description="Krys Cup winners and recorded cup achievements."
                entries={krysCupEntries}
              />

              <ChampionSection
                title="🌶️ Spicy Cup"
                description="Spicy Cup winners and recorded cup achievements."
                entries={spicyCupEntries}
              />
            </div>

            {championEntries.length > 0 && (
              <section style={allChampionsCard}>
                <h2 style={sectionTitle}>
                  🏛️ Complete Trophy Archive
                </h2>

                <p style={sectionDescription}>
                  Every recorded trophy and championship achievement.
                </p>

                <ChampionList entries={championEntries} />
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function ChampionSection({
  title,
  description,
  entries,
}: {
  title: string
  description: string
  entries: ChampionEntry[]
}) {
  return (
    <section style={card}>
      <h2 style={sectionTitle}>{title}</h2>

      <p style={sectionDescription}>{description}</p>

      {entries.length === 0 ? (
        <p style={emptyText}>
          No recorded champions in this category yet.
        </p>
      ) : (
        <ChampionList entries={entries} />
      )}
    </section>
  )
}

function ChampionList({
  entries,
}: {
  entries: ChampionEntry[]
}) {
  return (
    <div style={championList}>
      {entries.map((entry) => (
        <article key={entry.id} style={championRow}>
          {entry.image_url && (
            <img
              src={entry.image_url}
              alt={
                entry.trophy_title ||
                `${entry.playerName} trophy`
              }
              style={trophyImage}
            />
          )}

          <div style={championInformation}>
            <Link
              href={`/players/${entry.player_id}`}
              style={championName}
            >
              {entry.playerName}
            </Link>

            <strong style={trophyName}>
              {entry.trophy_title ||
                entry.placement ||
                "Champion"}
            </strong>

            <span style={muted}>
              {entry.event_name || "Krys Leagues"}
            </span>

            <span style={metadata}>
              {[
                entry.division,
                entry.season,
                entry.week,
              ]
                .filter(Boolean)
                .join(" • ")}
            </span>
          </div>
        </article>
      ))}
    </div>
  )
}

function searchableText(entry: ChampionEntry) {
  return [
    entry.trophy_title,
    entry.placement,
    entry.event_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
  padding: "30px 18px",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1150,
  margin: "0 auto",
}

const topBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 20,
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const hero: React.CSSProperties = {
  padding: 26,
  background: "rgba(2, 6, 23, 0.9)",
  border: "1px solid #334155",
  borderRadius: 20,
  marginBottom: 20,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(36px, 8vw, 48px)",
}

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.5,
}

const featuredCard: React.CSSProperties = {
  padding: 24,
  marginBottom: 20,
  background:
    "linear-gradient(135deg, rgba(120, 53, 15, 0.95), rgba(15, 23, 42, 0.96))",
  border: "1px solid #f59e0b",
  borderRadius: 20,
}

const featuredContent: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(280px, 1fr))",
  alignItems: "center",
  gap: 24,
}

const eyebrow: React.CSSProperties = {
  color: "#fde68a",
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 2,
}

const featuredTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 30,
}

const featuredWinner: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 7,
}

const winnerName: React.CSSProperties = {
  fontSize: 34,
}

const featuredVideo: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  justifySelf: "center",
  borderRadius: 16,
  background: "#000000",
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 18,
  marginBottom: 20,
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
}

const allChampionsCard: React.CSSProperties = {
  ...card,
  marginTop: 20,
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
}

const sectionDescription: React.CSSProperties = {
  color: "#cbd5e1",
  lineHeight: 1.5,
}

const championList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginTop: 18,
}

const championRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: 14,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
}

const trophyImage: React.CSSProperties = {
  width: 78,
  height: 78,
  objectFit: "cover",
  borderRadius: 10,
  flexShrink: 0,
}

const championInformation: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 0,
}

const championName: React.CSSProperties = {
  color: "#fde68a",
  textDecoration: "none",
  fontSize: 20,
  fontWeight: 900,
  overflowWrap: "anywhere",
}

const trophyName: React.CSSProperties = {
  color: "white",
}

const metadata: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 14,
}

const muted: React.CSSProperties = {
  color: "#cbd5e1",
}

const emptyText: React.CSSProperties = {
  color: "#94a3b8",
  padding: 14,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
}

const messageCard: React.CSSProperties = {
  padding: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  textAlign: "center",
  color: "#cbd5e1",
}

const errorCard: React.CSSProperties = {
  ...messageCard,
  border: "1px solid #991b1b",
  color: "#fecaca",
}