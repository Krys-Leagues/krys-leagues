"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { fetchPypAdminData } from "@/lib/admin/pypAdminData"

type PypSeason = { id: string; season_number: number; is_active: boolean }
type PypRoster = { season_id: string; status: string }

export default function PypAdminPage() {
  const [managedSeason, setManagedSeason] = useState<PypSeason | null>(null)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    async function loadManagedSeason() {
      let payload: { seasons: PypSeason[]; rosters: PypRoster[] }
      try {
        payload = await fetchPypAdminData("hub")
      } catch (error) {
        setLoadError(`Could not load the current PYP season: ${error instanceof Error ? error.message : "Protected PYP data could not be loaded."}`)
        return
      }

      const seasons = payload.seasons
      if (seasons.length === 0) return
      const rosters = payload.rosters
      const managedIds = new Set(rosters.map((roster) => roster.season_id))
      const currentIds = new Set(rosters.filter((roster) => roster.status !== "locked").map((roster) => roster.season_id))
      const requestedSeasonId = new URLSearchParams(window.location.search).get("seasonId")
      const requestedSeason = seasons.find((season) => season.id === requestedSeasonId && managedIds.has(season.id))
      setManagedSeason(requestedSeason || seasons.find((season) => currentIds.has(season.id)) || null)
    }

    void loadManagedSeason()
  }, [])

  return (
    <main style={page}>
      <h1 style={title}>PYP Admin</h1>
      <p style={subtitle}>Manage PYP seasons, rosters, and Home/Away schedules.</p>

      <div style={grid}>
        <Link href="/admin/pyp/season" style={card}>
          <strong>Setup New Season</strong>
          <span>Create or prepare a new managed PYP season.</span>
        </Link>

        <Link href="/admin/pyp/season/edit" style={card}>
          <strong>Edit Current Season</strong>
          <span>Edit the current managed PYP season and its divisions.</span>
        </Link>

        {managedSeason ? (
          <>
            <Link href={`/admin/pyp/results?seasonId=${encodeURIComponent(managedSeason.id)}`} style={card}>
              <strong>Results Admin</strong><span>Enter, correct, or delete managed PYP results.</span>
            </Link>
            <Link href={`/admin/pyp/schedule?seasonId=${encodeURIComponent(managedSeason.id)}`} style={card}>
              <strong>Schedule &amp; Images</strong><span>View the current schedule, review changes, and download division schedule images.</span>
            </Link>
            <Link href={`/admin/pyp/standings?seasonId=${encodeURIComponent(managedSeason.id)}`} style={card}>
              <strong>Scorecard / Standings</strong><span>Review standings and finalize the season scorecard.</span>
            </Link>
          </>
        ) : (
          <><div style={{ ...card, opacity: 0.65 }}><strong>Results Admin</strong><span>{loadError || "No current managed PYP season is available yet."}</span></div><div style={{ ...card, opacity: 0.65 }}><strong>Schedule &amp; Images</strong><span>{loadError || "No current managed PYP season is available yet."}</span></div><div style={{ ...card, opacity: 0.65 }}><strong>Scorecard / Standings</strong><span>{loadError || "No current managed PYP season is available yet."}</span></div></>
        )}

        {managedSeason ? (
          <Link href="/admin/pyp/members" style={card}>
            <strong>Players</strong><span>View and manage players enrolled in PYP.</span>
          </Link>
        ) : (
          <div style={{ ...card, opacity: 0.65 }}><strong>Players</strong><span>{loadError || "No current managed PYP season is available yet."}</span></div>
        )}

        {managedSeason && (
          <Link href={`/admin/pyp/players?seasonId=${encodeURIComponent(managedSeason.id)}`} style={card}>
            <strong>Season Roster</strong><span>Assign the persistent roster slots for this PYP season.</span>
          </Link>
        )}

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the main admin dashboard.</span>
        </Link>
      </div>
    </main>
  )
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "black", color: "white" }
const title: React.CSSProperties = { fontSize: 34, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#cfcfcf", marginBottom: 28 }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }
const card: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, padding: 18, borderRadius: 14, border: "1px solid #333", background: "#111", color: "white", textDecoration: "none" }
