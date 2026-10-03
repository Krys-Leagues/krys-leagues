"use client"

import { useEffect, useState } from "react"

type Profile = { team: { display_name: string; status: string }; seasons: Array<{ division: string; team_name: string; standing?: { points?: number; wins?: number; losses?: number; ties?: number; season_holes_won?: number; rank?: number } | null }> }

export default function PublicDoublesTeamProfile({ params }: { params: Promise<{ teamId: string }> }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [message, setMessage] = useState("Loading team profile…")
  useEffect(() => {
    params.then(({ teamId }) => fetch(`/api/doubles/teams/${teamId}`, { cache: "no-store" })).then(async (response) => {
      const data = await response.json() as Profile & { error?: string }
      if (!response.ok) throw new Error(data.error || "Team profile unavailable")
      setProfile(data)
      setMessage("")
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Team profile unavailable"))
  }, [params])
  if (!profile) return <main style={panel}><p>{message}</p></main>
  return <main style={panel}>
    <p style={eyebrow}>DOUBLES TEAM PROFILE</p>
    <h1>{profile.team.display_name}</h1>
    <p style={muted}>{profile.team.status}</p>
    {profile.seasons.length === 0 ? <p>No season record yet.</p> : profile.seasons.map((season, index) => <section key={`${season.division}-${index}`} style={seasonStyle}>
      <h2>{season.team_name}</h2><p style={muted}>{season.division}</p>
      {season.standing ? <p>{season.standing.points ?? 0} pts · {season.standing.wins ?? 0}-{season.standing.losses ?? 0}-{season.standing.ties ?? 0} · {season.standing.season_holes_won ?? 0} holes won{season.standing.rank ? ` · Rank ${season.standing.rank}` : ""}</p> : <p>Standings pending.</p>}
    </section>)}
  </main>
}

const panel = { maxWidth: 760, margin: "32px auto", padding: 28, borderRadius: 18, background: "rgba(15,23,42,.86)", color: "#f8fafc", border: "1px solid rgba(148,163,184,.25)" }
const seasonStyle = { marginTop: 20, padding: 18, borderRadius: 12, background: "rgba(30,41,59,.85)" }
const eyebrow = { letterSpacing: ".12em", fontSize: 12, color: "#93c5fd" }
const muted = { color: "#cbd5e1" }
