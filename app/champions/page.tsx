"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { historicalPlayerName, loadCanonicalPlayerDisplays, type CanonicalPlayerDisplay } from "@/lib/canonicalPlayerDisplay"
import TrophyMedia from "@/components/TrophyMedia"

type Player = {
  id: string
  screen_name: string
}

type Trophy = {
  id: string
  player_id: string | null
  player_name: string | null
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
  const [players, setPlayers] = useState<CanonicalPlayerDisplay[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadChampions()
  }, [])

  async function loadChampions() {
    setLoading(true)
    setMessage("")

    const trophiesResponse = await supabase
        .from("player_trophies")
        .select(
          "id, player_id, player_name, trophy_title, placement, event_name, division, season, week, image_url"
        )
        .order("season", { ascending: false })

    const firstError = trophiesResponse.error

    if (firstError) {
      setMessage(firstError.message)
      setLoading(false)
      return
    }

    const loadedTrophies = trophiesResponse.data || []
    const playerResponse = await loadCanonicalPlayerDisplays(
      loadedTrophies.map((trophy) => trophy.player_id).filter((id): id is string => Boolean(id)),
    )
    if (playerResponse.error) {
      setMessage(playerResponse.error.message)
      setLoading(false)
      return
    }
    setPlayers(playerResponse.data)
    setTrophies(loadedTrophies)
    setLoading(false)
  }
    const championEntries = useMemo<ChampionEntry[]>(() => {
    const playerDisplays = new Map(players.map((player) => [player.source_player_id, player]))

    return trophies.map((trophy) => ({
      ...trophy,
      playerName:
        historicalPlayerName(
          trophy.player_id ? playerDisplays.get(trophy.player_id) : undefined,
          trophy.player_name,
        ),
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
          <h1 style={title}>🏆 Trophy Case</h1>

          <p style={subtitle}>
            Celebrating league champions, tournament winners, cup
            achievements, and the greatest accomplishments in Krys
            Leagues.
          </p>
        </section>
                {loading ? (
          <div style={messageCard}>
            Loading Trophy Case...
          </div>
        ) : message ? (
          <div style={errorCard}>{message}</div>
        ) : (
          <>
            <section style={featuredCard}>
              <div style={cupGrid}>
                <div style={cupCard}>
                 <h2 style={featuredTitle}>
  🏆 Champion of Champions
  <br />
  2026
</h2>

<video
  controls
  playsInline
  preload="metadata"
  style={cupVideo}
  onEnded={(e) => {
    e.currentTarget.currentTime = 0
  }}
>
  <source
    src="/league-media/trophies/champion-of-champions.mp4"
    type="video/mp4"
  />
</video>
                </div>

                <div style={cupCard}>
                  <h2 style={featuredTitle}>
  🏆 Krys Cup Winner
  <br />
  2026
</h2>

                  <video
                    controls
                    playsInline
                    preload="metadata"
                    style={cupVideo}
                    onEnded={(e) => {
  e.currentTarget.currentTime = 0
}}
                  >
                    <source
                      src="/league-media/trophies/krys cup winner 2026.mp4"
                      type="video/mp4"
                    />
                  </video>
                </div>

                <div style={cupCard}>
                  <h2 style={featuredTitle}>
  🌶️ Spicy Cup Winner
  <br />
  2026
</h2>

                  <video
  controls
  playsInline
  preload="metadata"
  style={cupVideo}
  onEnded={(e) => {
    e.currentTarget.currentTime = 0
  }}
                 >
                    <source
                      src="/league-media/trophies/Spicy cup winner 2026.mp4"
                      type="video/mp4"
                    />
                  </video>
                </div>
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
          {entry.image_url && <TrophyMedia src={entry.image_url} alt={entry.trophy_title || `${entry.playerName} trophy`} style={trophyImage} />}

          <div style={championInformation}>
            {entry.player_id ? <Link href={`/players/${entry.player_id}`} style={championName}>{entry.playerName}</Link> : <strong style={championName}>{entry.playerName}</strong>}

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
  maxWidth: 1600,
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
  fontSize: "clamp(42px, 9vw, 56px)",
  fontWeight: 800,
  color: "#FFD700",
}

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.5,
}

const featuredCard: React.CSSProperties = {
  padding: 24,
  marginBottom: 20,
  background: "#0b1220",
  border: "1px solid #d4af37",
  borderRadius: 20,
}

const cupGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(320px, 1fr))",
  gap: 20,
}

const cupCard: React.CSSProperties = {
  background: "#0b1220",
  border: "2px solid #d4af37",
  borderRadius: 18,
  padding: 18,
  textAlign: "center",
}

const cupVideo: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
}

const featuredTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 26,
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
  width: 90,
  height: 90,
  objectFit: "cover",
  borderRadius: 12,
  border: "1px solid #475569",
}

const championInformation: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
}

const championName: React.CSSProperties = {
  color: "#38bdf8",
  fontSize: 20,
  fontWeight: 800,
  textDecoration: "none",
}

const trophyName: React.CSSProperties = {
  fontSize: 18,
}

const muted: React.CSSProperties = {
  color: "#94a3b8",
}

const metadata: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
}

const messageCard: React.CSSProperties = {
  padding: 20,
  background: "#111827",
  borderRadius: 12,
  border: "1px solid #334155",
}

const errorCard: React.CSSProperties = {
  padding: 20,
  background: "#450a0a",
  borderRadius: 12,
  border: "1px solid #ef4444",
}

const emptyText: React.CSSProperties = {
  color: "#94a3b8",
}
