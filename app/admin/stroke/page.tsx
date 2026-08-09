"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type StrokeSeason = {
  id: string
  season_number: number
  is_active: boolean
}

type StrokeRoster = {
  season_id: string
  status: "draft" | "approved" | "locked"
}

export default function StrokeAdminPage() {
  const [managedSeason, setManagedSeason] = useState<StrokeSeason | null>(null)
  const [scheduleLinkError, setScheduleLinkError] = useState("")

  useEffect(() => {
    async function loadCurrentManagedSeason() {
      const { data: seasonData, error: seasonError } = await supabase
        .from("seasons")
        .select("id, season_number, is_active")
        .eq("league_type", "stroke")
        .is("division", null)
        .order("is_active", { ascending: false })
        .order("season_number", { ascending: false })

      if (seasonError) {
        setScheduleLinkError(`Could not load the current Stroke season: ${seasonError.message}`)
        return
      }

      const seasons = (seasonData || []) as StrokeSeason[]
      if (seasons.length === 0) return

      const { data: rosterData, error: rosterError } = await supabase
        .from("stroke_roster_versions")
        .select("season_id, status")
        .in("season_id", seasons.map((season) => season.id))
        .in("status", ["draft", "approved"])

      if (rosterError) {
        setScheduleLinkError(`Could not load the current Stroke roster: ${rosterError.message}`)
        return
      }

      const managedSeasonIds = new Set(
        ((rosterData || []) as StrokeRoster[]).map((roster) => roster.season_id)
      )
      setManagedSeason(
        seasons.find((season) => managedSeasonIds.has(season.id)) || null
      )
    }

    void loadCurrentManagedSeason()
  }, [])

  return (
    <main style={page}>
      <h1 style={title}>Stroke Play Admin</h1>
      <p style={subtitle}>Manage Stroke Play seasons, scoring, and active games.</p>

      <div style={grid}>
        <Link href="/admin/stroke/season" style={card}>
          <strong>Setup New Season</strong>
          <span>Create or prepare a new Stroke Play season.</span>
        </Link>

        <Link href="/admin/stroke/results" style={card}>
          <strong>Score Current Season</strong>
          <span>Enter or review Stroke Play results.</span>
        </Link>

        {managedSeason ? (
          <Link
            href={`/admin/stroke/schedule?seasonId=${encodeURIComponent(managedSeason.id)}`}
            style={card}
          >
            <strong>Schedule &amp; Images</strong>
            <span>
              View the current schedule, review changes, and download division schedule images.
            </span>
          </Link>
        ) : (
          <div style={{ ...card, opacity: 0.65 }}>
            <strong>Schedule &amp; Images</strong>
            <span>
              {scheduleLinkError || "No current managed Stroke season is available yet."}
            </span>
          </div>
        )}

               <Link href="/admin/stroke/standings" style={card}>
          <strong>Standings</strong>
          <span>View and save live Stroke Play standings.</span>
        </Link>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>View global player list used across all leagues.</span>
        </Link>

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the main admin dashboard.</span>
        </Link>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const title: React.CSSProperties = {
  fontSize: 34,
  marginBottom: 8,
}

const subtitle: React.CSSProperties = {
  color: "#cfcfcf",
  marginBottom: 28,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 14,
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 18,
  borderRadius: 14,
  border: "1px solid #333",
  background: "#111",
  color: "white",
  textDecoration: "none",
}
