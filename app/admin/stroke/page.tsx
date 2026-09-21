"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { adminManagedLeagueRequest } from "@/lib/admin/managedLeagueClient"

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
      const response = await adminManagedLeagueRequest<{ seasons: StrokeSeason[]; rosters: StrokeRoster[] }>("hub_load", { league: "stroke" })
      if (response.error || !response.data) {
        setScheduleLinkError(`Could not load the current Stroke season: ${response.error?.message || "No data returned."}`)
        return
      }
      const seasons = response.data.seasons
      if (seasons.length === 0) return
      const rosters = response.data.rosters
      const managedSeasonIds = new Set(rosters.map((roster) => roster.season_id))
      const currentSeasonIds = new Set(rosters.filter((roster) => roster.status !== "locked").map((roster) => roster.season_id))
      const requestedSeasonId = new URLSearchParams(window.location.search).get("seasonId")
      const requestedSeason = seasons.find((season) => season.id === requestedSeasonId && managedSeasonIds.has(season.id))
      setManagedSeason(
        requestedSeason || seasons.find((season) => currentSeasonIds.has(season.id)) || null
      )
    }

    void loadCurrentManagedSeason()
  }, [])

  return (
    <main style={page}>
      <h1 style={title}>Stroke Play Admin</h1>
      <p style={subtitle}>Set up future seasons or work in the one current-season workspace.</p>

      <div style={grid}>
        <Link href="/admin/stroke/season" style={card}>
          <strong>Setup New Season</strong>
          <span>Create or prepare a new Stroke Play season.</span>
        </Link>

        {managedSeason ? (
          <Link href="/admin/stroke/manage" style={card}>
            <strong>Manage Current Season</strong>
            <span>Assignments, scorecards, scoring, standings, and live-board status.</span>
          </Link>
        ) : (
          <div style={{ ...card, opacity: 0.65 }}><strong>Manage Current Season</strong><span>{scheduleLinkError || "No current managed Stroke season is available yet."}</span></div>
        )}

        <Link href="/admin" style={{ color: "#7dd3fc", alignSelf: "center" }}>← Back to Admin Home</Link>
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
