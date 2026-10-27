"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type PypSeason = { id: string; season_number: number; is_active: boolean }
type PypRoster = { season_id: string; status: string }

export default function PypAdminPage() {
  const [managedSeason, setManagedSeason] = useState<PypSeason | null>(null)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    async function loadManagedSeason() {
      const { data: seasonData, error: seasonError } = await supabase
        .from("seasons")
        .select("id, season_number, is_active")
        .eq("league_type", "pyp")
        .is("division", null)
        .order("is_active", { ascending: false })
        .order("season_number", { ascending: false })

      if (seasonError) {
        setLoadError(`Could not load the current PYP season: ${seasonError.message}`)
        return
      }

      const seasons = (seasonData || []) as PypSeason[]
      if (seasons.length === 0) return

      const { data: rosterData, error: rosterError } = await supabase
        .from("pyp_roster_versions")
        .select("season_id, status")
        .in("season_id", seasons.map((season) => season.id))
        .in("status", ["draft", "approved", "locked"])

      if (rosterError) {
        setLoadError(`Could not load the current PYP roster: ${rosterError.message}`)
        return
      }

      const rosters = (rosterData || []) as PypRoster[]
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
          <Link href={`/admin/pyp/players?seasonId=${encodeURIComponent(managedSeason.id)}`} style={card}>
            <strong>Players</strong><span>View players in this PYP season.</span>
          </Link>
        ) : (
          <div style={{ ...card, opacity: 0.65 }}><strong>Players</strong><span>{loadError || "No current managed PYP season is available yet."}</span></div>
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
