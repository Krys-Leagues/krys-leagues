"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type DeletionPreview = {
  division_count: number
  roster_version_count: number
  roster_slot_count: number
  schedule_count: number
  result_count: number
  standings_count: number
  transition_count: number
  final_scorecard_count: number
  other_season_row_count: number
  deletion_allowed: boolean
  blocking_reason: string | null
}

export function ManagedSeasonDangerZone({
  seasonId,
  seasonNumber,
  leagueName,
  returnPath,
}: {
  seasonId: string
  seasonNumber: number
  leagueName: string
  returnPath: string
}) {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function beginDelete() {
    if (loading) return
    setLoading(true)
    setError("")
    const { data, error: previewError } = await supabase
      .rpc("preview_managed_season_deletion", { p_season_id: seasonId })
      .single()
    setLoading(false)
    if (previewError || !data) {
      setError(previewError?.message || "Could not preview season deletion.")
      return
    }
    setPreview(data as DeletionPreview)
    setStep(1)
  }

  async function permanentlyDelete() {
    if (loading || !preview?.deletion_allowed) return
    setLoading(true)
    setError("")
    const { error: deleteError } = await supabase.rpc("delete_managed_season", {
      p_season_id: seasonId,
    })
    setLoading(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    window.alert(`${leagueName} Season ${seasonNumber} was permanently deleted.`)
    router.replace(`${returnPath}?deletedSeason=${encodeURIComponent(String(seasonNumber))}`)
  }

  return (
    <section style={dangerZone}>
      <h2 style={dangerTitle}>DANGER ZONE</h2>
      <p style={dangerText}>
        Permanently delete this season and its managed divisions, rosters, schedules,
        results, standings, transitions, and season-specific data. Player identities are
        not deleted.
      </p>
      <button type="button" onClick={beginDelete} disabled={loading} style={deleteButton}>
        {loading && step === 0 ? "Loading impact..." : "DELETE SEASON"}
      </button>
      {error && <p role="alert" style={errorStyle}>{error}</p>}

      {step > 0 && preview && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-season-title" style={overlay}>
          <div style={modal}>
            {step === 1 ? (
              <>
                <h2 id="delete-season-title" style={modalTitle}>Delete Season {seasonNumber}?</h2>
                <p style={modalText}>{leagueName} managed data owned by this season:</p>
                <div style={countGrid}>
                  <span>Divisions: {preview.division_count}</span>
                  <span>Roster versions: {preview.roster_version_count}</span>
                  <span>Roster slots: {preview.roster_slot_count}</span>
                  <span>Schedules: {preview.schedule_count}</span>
                  <span>Results: {preview.result_count}</span>
                  <span>Standings: {preview.standings_count}</span>
                  <span>Transitions: {preview.transition_count}</span>
                  <span>Final Scorecards/snapshots: {preview.final_scorecard_count}</span>
                  <span>Other season rows: {preview.other_season_row_count}</span>
                </div>
                {!preview.deletion_allowed && (
                  <p role="alert" style={errorStyle}>{preview.blocking_reason}</p>
                )}
                <div style={modalActions}>
                  <button type="button" onClick={() => setStep(0)} style={cancelButton}>Cancel</button>
                  <button type="button" onClick={() => setStep(2)} disabled={!preview.deletion_allowed} style={continueButton}>Continue</button>
                </div>
              </>
            ) : (
              <>
                <h2 id="delete-season-title" style={modalTitle}>
                  Permanently delete Season {seasonNumber}? This cannot be undone.
                </h2>
                <p style={modalText}>Make sure you have a backup/export if you may need this season later.</p>
                <div style={modalActions}>
                  <button type="button" onClick={() => setStep(0)} disabled={loading} style={cancelButton}>Cancel</button>
                  <button type="button" onClick={permanentlyDelete} disabled={loading} style={deleteButton}>
                    {loading ? "DELETING..." : "PERMANENTLY DELETE"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

const dangerZone: React.CSSProperties = { marginTop: 28, padding: 24, borderRadius: 14, border: "1px solid #7f1d1d", background: "#180909" }
const dangerTitle: React.CSSProperties = { margin: "0 0 10px", color: "#fca5a5", fontSize: 20 }
const dangerText: React.CSSProperties = { color: "#d1d5db", lineHeight: 1.6, maxWidth: 760 }
const deleteButton: React.CSSProperties = { padding: "11px 16px", borderRadius: 8, border: "1px solid #ef4444", background: "#991b1b", color: "white", fontWeight: 800, cursor: "pointer" }
const errorStyle: React.CSSProperties = { marginTop: 14, padding: 12, borderRadius: 8, border: "1px solid #ef4444", background: "#2a0d0d", color: "#fecaca" }
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 20, background: "rgba(0,0,0,.78)" }
const modal: React.CSSProperties = { width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 24, borderRadius: 14, border: "1px solid #7f1d1d", background: "#111", color: "white", boxShadow: "0 24px 80px rgba(0,0,0,.6)" }
const modalTitle: React.CSSProperties = { margin: "0 0 12px", fontSize: 24 }
const modalText: React.CSSProperties = { color: "#d1d5db", lineHeight: 1.6 }
const countGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, margin: "18px 0", color: "#e5e7eb" }
const modalActions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 10, marginTop: 22 }
const cancelButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #555", background: "#191919", color: "white", cursor: "pointer" }
const continueButton: React.CSSProperties = { padding: "10px 14px", borderRadius: 8, border: "1px solid #f59e0b", background: "#78350f", color: "white", fontWeight: 700, cursor: "pointer" }
