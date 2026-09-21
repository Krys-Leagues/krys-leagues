"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import PlayerProfileHero from "@/components/PlayerProfileHero"
import TrophyMedia from "@/components/TrophyMedia"
import { validatePlayerAvatarFile } from "@/lib/playerAvatars"

type Player = {
  id: string
  screen_name: string
  discord_id: string | null
  discord_name: string | null
  discord_username: string | null
  status: string | null
  active: boolean | null
}

type Membership = {
  id: string
  league_type: string | null
  season_number: number | null
  division: string | null
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

type CareerStats = {
  matchesPlayed: number
  wins: number
  losses: number
  draws: number
  winPercent: string
}

type CanonicalIdentity = {
  canonical_player_id: string
  canonical_screen_name: string
  aliases: string[] | null
  is_server_booster?: boolean
  has_krys_server_tag?: boolean
  profile_badges?: string[]
}

export default function PlayerProfilePage() {
  const params = useParams()
  const router = useRouter()
  const playerId = Array.isArray(params.id) ? params.id[0] : params.id

  const [player, setPlayer] = useState<Player | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [formerNames, setFormerNames] = useState<string[]>([])
  const [formerNamesError, setFormerNamesError] = useState("")
  const [careerStats, setCareerStats] = useState<CareerStats>({
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winPercent: "0%",
  })
  const [loading, setLoading] = useState(true)
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("")
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarError, setAvatarError] = useState("")
  const [avatarMessage, setAvatarMessage] = useState("")
  const [recognition, setRecognition] = useState({
    isServerBooster: false,
    hasKrysServerTag: false,
    profileBadges: [] as string[],
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadData()
    // Player data is reloaded only when this UUID page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadData() {
    if (!playerId) return

    setLoading(true)
    setFormerNamesError("")

    const response = await fetch(`/api/admin/players/${playerId}`, { cache: "no-store" })
    const payload = await response.json() as { player?: Player; identity?: CanonicalIdentity; avatarPath?: string | null; memberships?: Membership[]; trophies?: Trophy[]; careerStats?: CareerStats; error?: string }
    if (!response.ok) {
      setFormerNames([])
      setFormerNamesError(`Could not load player profile: ${payload.error || "request failed"}`)
    } else {
      const identity = payload.identity || null
      const currentCanonicalName =
        identity?.canonical_screen_name || ""

      setRecognition({
        isServerBooster: Boolean(identity?.is_server_booster),
        hasKrysServerTag: Boolean(identity?.has_krys_server_tag),
        profileBadges: identity?.profile_badges || [],
      })

      setFormerNames(
        Array.from(
          new Set(
            (identity?.aliases || []).filter(
              (alias) => alias !== currentCanonicalName
            )
          )
        )
      )
    }

    setPlayer(payload.player || null)
    setAvatarPath(payload.avatarPath || null)
    setMemberships(payload.memberships || [])
    setTrophies(payload.trophies || [])
    setCareerStats(payload.careerStats || { matchesPlayed: 0, wins: 0, losses: 0, draws: 0, winPercent: "0%" })

    setLoading(false)
  }

  async function chooseAvatar(file: File | null) {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl)
    setAvatarError("")
    setAvatarMessage("")
    if (!file) { setAvatarFile(null); setAvatarPreviewUrl(""); return }
    const validationError = await validatePlayerAvatarFile(file)
    if (validationError) { setAvatarFile(null); setAvatarPreviewUrl(""); setAvatarError(validationError); return }
    setAvatarFile(file)
    setAvatarPreviewUrl(URL.createObjectURL(file))
  }

  async function saveAvatar() {
    if (!player || !avatarFile) return
    setAvatarBusy(true); setAvatarError(""); setAvatarMessage("")
    const form = new FormData(); form.set("action", "save_avatar"); form.set("avatar", avatarFile)
    const response = await fetch(`/api/admin/players/${player.id}`, { method: "POST", body: form, cache: "no-store" })
    const payload = await response.json() as { avatarPath?: string; error?: string }
    if (!response.ok) { setAvatarBusy(false); setAvatarError(payload.error || "Avatar could not be saved."); return }
    setAvatarPath(payload.avatarPath || null); await chooseAvatar(null); setAvatarBusy(false)
    setAvatarMessage(avatarPath ? "Avatar replaced." : "Avatar uploaded.")
  }

  async function removeAvatar() {
    if (!player || !avatarPath) return
    setAvatarBusy(true); setAvatarError(""); setAvatarMessage("")
    const form = new FormData(); form.set("action", "remove_avatar")
    const response = await fetch(`/api/admin/players/${player.id}`, { method: "POST", body: form, cache: "no-store" })
    const payload = await response.json() as { error?: string }
    if (!response.ok) { setAvatarBusy(false); setAvatarError(payload.error || "Avatar could not be removed."); return }
    setAvatarPath(null); setAvatarBusy(false); setAvatarMessage("Avatar removed.")
  }

    if (loading) {
    return <p style={{ color: "white", padding: 20 }}>Loading player...</p>
  }

  if (!player) {
    return (
      <main style={page}>
        <div style={container}>
          <button onClick={() => router.push("/admin/players")} style={backButton}>
            ← Players
          </button>

          <div style={card}>
            <h1>Player not found</h1>
            <p style={muted}>This player profile could not be loaded.</p>
          </div>
        </div>
      </main>
    )
  }

const currentMembership = memberships[0]

const totalSeasons = new Set(
  memberships
    .map((m) => m.season_number)
    .filter((s) => s !== null)
).size
const hasCareerParticipation = memberships.length > 0 || careerStats.matchesPlayed > 0
  return (
    <main style={page}>
      <div style={container}>
        <div style={topBar}>
          <button onClick={() => router.push("/admin/players")} style={backButton}>
            ← Players
          </button>

          <button onClick={() => router.push("/admin")} style={backButtonSecondary}>
            ← Admin
          </button>
        </div>

        <div style={heroArea}>
          <PlayerProfileHero
            screenName={player.screen_name}
            avatarPath={avatarPreviewUrl || avatarPath}
            isServerBooster={recognition.isServerBooster}
            hasKrysServerTag={recognition.hasKrysServerTag}
            profileBadges={recognition.profileBadges}
          />

          <div style={avatarControls}>
            <label style={avatarFileButton}>{avatarPath ? "Replace Avatar" : "Upload Avatar"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={avatarBusy} onChange={(event)=>void chooseAvatar(event.target.files?.[0]||null)} /></label>
            {avatarFile && <button style={avatarSaveButton} disabled={avatarBusy} onClick={saveAvatar}>{avatarBusy?"Saving…":"Save Avatar"}</button>}
            {avatarPath && <button style={avatarRemoveButton} disabled={avatarBusy} onClick={removeAvatar}>Remove Avatar</button>}
          </div>
          {avatarError && <p style={aliasErrorText}>{avatarError}</p>}
          {avatarMessage && <p style={avatarSuccessText}>{avatarMessage}</p>}
          <p style={muted}>
            Discord: {player.discord_id ? player.discord_name || player.discord_username || "Linked" : "Not linked"}
          </p>

          {hasCareerParticipation && <details style={statsDisclosure}>
            <summary style={statsSummary}>Player Stats</summary>
          <div style={quickStats}>
          <div style={statBox}>
            <strong>Leagues</strong>
            <span>{memberships.length}</span>
          </div>

          <div style={statBox}>
            <strong>Seasons</strong>
            <span>{totalSeasons}</span>
          </div>

          <div style={statBox}>
            <strong>Trophies</strong>
            <span>{trophies.length}</span>
          </div>

          <div style={statBox}>
            <strong>Matches</strong>
            <span>{careerStats.matchesPlayed}</span>
          </div>
            <div style={statBox}>
              <strong>Wins</strong>
              <span>{careerStats.wins}</span>
            </div>

            <div style={statBox}>
              <strong>Win %</strong>
              <span>{careerStats.winPercent}</span>
            </div>
          </div>
          {memberships.length > 0 && <div style={nestedCard}>
          <h2>Player Overview</h2>

          <div style={quickStats}>
            <div style={statBox}>
              <strong>Memberships</strong>
              <span>{memberships.length}</span>
            </div>

            <div style={statBox}>
              <strong>Total Seasons</strong>
              <span>{totalSeasons}</span>
            </div>

            <div style={statBox}>
              <strong>Current League</strong>
              <span>{currentMembership?.league_type || "-"}</span>
            </div>

            <div style={statBox}>
              <strong>Current Division</strong>
              <span>{currentMembership?.division || "-"}</span>
            </div>
          </div>
        </div>}
        </details>}
        </div>

        {(formerNames.length > 0 || formerNamesError) && <div style={card}>
          <h2>Former Names / Aliases</h2>
          {formerNamesError ? (
            <p style={aliasErrorText}>{formerNamesError}</p>
          ) : (
            <ul style={aliasList}>
              {formerNames.map((alias) => (
                <li key={alias}>{alias}</li>
              ))}
            </ul>
          )}
        </div>}

        {memberships.length > 0 && <div style={card}>
          <h2>League Memberships ({memberships.length})</h2>
            <div style={grid}>
              {memberships.map((membership) => (
                <div key={membership.id} style={miniCard}>
                  <h3>{membership.league_type || "League"}</h3>
                  <p>{membership.division || "No division"}</p>
                  <p style={muted}>Season {membership.season_number || "?"}</p>
                </div>
              ))}
            </div>
        </div>}

        {trophies.length > 0 && <div style={card}>
          <h2>🏆 Trophies ({trophies.length})</h2>
            <div style={grid}>
              {trophies.map((t) => (
                <div key={t.id} style={trophyCard}>
                  <h3>{t.trophy_title || t.placement || "Trophy"}</h3>

                  <p>{t.event_name || "Event not listed"}</p>
                  <p>{t.division || "Division not listed"}</p>

                  <p style={muted}>
                    {[t.season, t.week].filter(Boolean).join(" / ")}
                  </p>

                  {t.image_url && (
                    <TrophyMedia
                      src={t.image_url}
                      alt={t.trophy_title || "Player trophy"}
                      style={{
                        display: "block",
                        width: "min(100%, 300px)",
                        maxHeight: 280,
                        objectFit: "contain",
                        marginInline: "auto",
                        borderRadius: 10,
                        marginTop: 10,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
        </div>}
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "black",
  color: "white",
  display: "flex",
  justifyContent: "center",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
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

const heroArea: React.CSSProperties = {
  marginBottom: 20,
}

const nestedCard: React.CSSProperties = {
  background: "#0b0b0b",
  border: "1px solid #333",
  borderRadius: 14,
  padding: 18,
  marginTop: 16,
}

const statsDisclosure: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  border: "1px solid #333",
  borderRadius: 14,
  background: "#090909",
}

const statsSummary: React.CSSProperties = {
  cursor: "pointer",
  fontSize: "1.05rem",
  fontWeight: 850,
  padding: "4px 2px",
}

const avatarControls: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "16px 0" }
const avatarFileButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, background: "#2563eb", color: "white", fontWeight: 800, cursor: "pointer" }
const avatarSaveButton: React.CSSProperties = { padding: "10px 14px", border: 0, borderRadius: 8, background: "#16a34a", color: "white", fontWeight: 800, cursor: "pointer" }
const avatarRemoveButton: React.CSSProperties = { padding: "10px 14px", border: "1px solid #dc2626", borderRadius: 8, background: "#450a0a", color: "#fecaca", fontWeight: 800, cursor: "pointer" }
const avatarSuccessText: React.CSSProperties = { color: "#86efac" }

const quickStats: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 16,
}

const statBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  background: "#111",
  border: "1px solid #333",
  borderRadius: 12,
  padding: 14,
}

const muted: React.CSSProperties = {
  color: "#aaa",
  margin: "6px 0",
}

const aliasErrorText: React.CSSProperties = {
  color: "#fca5a5",
}

const aliasList: React.CSSProperties = {
  margin: "12px 0 0",
  paddingLeft: 22,
  display: "grid",
  gap: 8,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 16,
}

const miniCard: React.CSSProperties = {
  background: "#111",
  border: "1px solid #444",
  borderRadius: 12,
  padding: 14,
}

const trophyCard: React.CSSProperties = {
  background: "#111",
  border: "1px solid #444",
  borderRadius: 12,
  padding: 14,
}
