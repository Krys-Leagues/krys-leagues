"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  assignOpponent,
  clearPairing,
  pairingCounts,
  pairingWarnings,
  serializePairingState,
  type PairingAppearance,
  type PairingState,
} from "@/lib/importer/historicalStrokePairings"
import { supabase } from "@/lib/supabase"

type HistoricalImport = {
  id: string
  season_number: number
  historical_label: string
  source_filename: string
  validated_preview: { byeRows?: Array<{ divisionNumber: number }> }
}
type StandingRow = { id: string; historical_stroke_import_id: string; division_number: number; historical_display_name: string; source_position: number | null }
type AppearanceRow = { id: string; historical_stroke_standing_id: string; course_order: number; historical_course_name: string; played: boolean; score: number | null; raw_score_token: string; outcome: "W" | "L" | "D" | null }
type AssignmentRow = { historical_stroke_course_appearance_id: string; opponent_kind: "player" | "bye" | "unknown"; opponent_historical_stroke_standing_id: string | null; admin_note: string | null }

function stateFromRows(rows: AssignmentRow[]): PairingState {
  return Object.fromEntries(rows.map((row) => [row.historical_stroke_course_appearance_id, {
    appearanceId: row.historical_stroke_course_appearance_id,
    kind: row.opponent_kind,
    opponentStandingId: row.opponent_historical_stroke_standing_id,
    note: row.admin_note,
  }]))
}

function scoreLabel(appearance: PairingAppearance) {
  if (!appearance.played) return `Unplayed (${appearance.rawScoreToken || "source null"})`
  return `${appearance.score === null ? appearance.rawScoreToken : appearance.score} · ${appearance.outcome ?? "No outcome"}`
}

export default function CommittedHistoricalStrokePairings({ initialImportId }: { initialImportId?: string | null }) {
  const [imports, setImports] = useState<HistoricalImport[]>([])
  const [selectedImportId, setSelectedImportId] = useState(initialImportId ?? "")
  const [appearances, setAppearances] = useState<PairingAppearance[]>([])
  const [savedState, setSavedState] = useState<PairingState>({})
  const [draftState, setDraftState] = useState<PairingState>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const loadImport = useCallback(async (importId: string) => {
    if (!importId) return
    const { data: standingData, error: standingError } = await supabase.from("historical_stroke_standings")
      .select("id,historical_stroke_import_id,division_number,historical_display_name,source_position")
      .eq("historical_stroke_import_id", importId).order("division_number").order("source_position")
    if (standingError) throw standingError
    const standings = (standingData ?? []) as StandingRow[]
    const standingIds = standings.map((standing) => standing.id)
    const appearanceQuery = supabase.from("historical_stroke_course_appearances")
      .select("id,historical_stroke_standing_id,course_order,historical_course_name,played,score,raw_score_token,outcome")
      .order("course_order")
    const { data: appearanceData, error: appearanceError } = standingIds.length
      ? await appearanceQuery.in("historical_stroke_standing_id", standingIds)
      : { data: [], error: null }
    if (appearanceError) throw appearanceError
    const standingById = new Map(standings.map((standing) => [standing.id, standing]))
    const loadedAppearances = ((appearanceData ?? []) as AppearanceRow[]).map((appearance) => {
      const standing = standingById.get(appearance.historical_stroke_standing_id)
      if (!standing) throw new Error("Historical Stroke appearance has no standing.")
      return {
        id: appearance.id,
        standingId: standing.id,
        importId: standing.historical_stroke_import_id,
        divisionNumber: standing.division_number,
        courseOrder: appearance.course_order,
        courseName: appearance.historical_course_name,
        historicalDisplayName: standing.historical_display_name,
        played: appearance.played,
        score: appearance.score,
        rawScoreToken: appearance.raw_score_token,
        outcome: appearance.outcome,
      }
    })
    const { data: assignmentData, error: assignmentError } = await supabase.from("historical_stroke_opponent_assignments")
      .select("historical_stroke_course_appearance_id,opponent_kind,opponent_historical_stroke_standing_id,admin_note")
      .eq("historical_stroke_import_id", importId)
    if (assignmentError) throw assignmentError
    const state = stateFromRows((assignmentData ?? []) as AssignmentRow[])
    setAppearances(loadedAppearances)
    setSavedState(state)
    setDraftState(state)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.from("historical_stroke_imports")
      .select("id,season_number,historical_label,source_filename,validated_preview")
      .order("season_number", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setMessage(error.message); setLoading(false); return }
        const loaded = (data ?? []) as HistoricalImport[]
        const chosenImportId = initialImportId || loaded[0]?.id || ""
        setImports(loaded)
        setSelectedImportId(chosenImportId)
        if (chosenImportId) void loadImport(chosenImportId).catch((loadError: unknown) => {
          setMessage(loadError instanceof Error ? loadError.message : "Historical Stroke pairings could not be loaded.")
          setLoading(false)
        })
        else setLoading(false)
      })
    return () => { cancelled = true }
  }, [initialImportId, loadImport])

  const selectedImport = imports.find((item) => item.id === selectedImportId)
  const byeDivisions = useMemo(() => new Set(selectedImport?.validated_preview?.byeRows?.map((row) => row.divisionNumber) ?? []), [selectedImport])
  const groups = useMemo(() => {
    const grouped = new Map<string, PairingAppearance[]>()
    for (const appearance of appearances) {
      const key = `${appearance.divisionNumber}:${appearance.courseOrder}`
      grouped.set(key, [...(grouped.get(key) ?? []), appearance])
    }
    return [...grouped.values()].sort((a, b) => a[0].divisionNumber - b[0].divisionNumber || a[0].courseOrder - b[0].courseOrder)
  }, [appearances])
  const counts = pairingCounts(draftState, appearances.length)
  const warnings = pairingWarnings(draftState, appearances)
  const dirty = JSON.stringify(serializePairingState(savedState)) !== JSON.stringify(serializePairingState(draftState))

  async function save() {
    setSaving(true)
    setMessage("")
    const { error } = await supabase.rpc("save_historical_stroke_pairing_review", {
      p_historical_stroke_import_id: selectedImportId,
      p_expected_assignments: serializePairingState(savedState),
      p_assignments: serializePairingState(draftState),
    })
    setSaving(false)
    if (error) { setMessage(error.message); return }
    await loadImport(selectedImportId)
    setMessage("Pairing review saved. Frozen Historical Stroke source facts were unchanged.")
  }

  return <section className="mb-8 rounded-2xl border border-emerald-800 bg-emerald-950/20 p-6">
    <h2 className="text-2xl font-bold">Manage committed Historical Stroke pairings</h2>
    <p className="mt-2 text-zinc-300">Add separate admin-confirmed schedule evidence to an existing import. This never rewrites the CSV source or its results.</p>
    <label className="mt-4 block text-sm font-bold">Historical Stroke import
      <select value={selectedImportId} onChange={(event) => {
        const importId = event.target.value
        setLoading(true); setMessage(""); setSelectedImportId(importId)
        void loadImport(importId).catch((error: unknown) => { setMessage(error instanceof Error ? error.message : "Historical Stroke pairings could not be loaded."); setLoading(false) })
      }} className="mt-2 block w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2">
        {imports.map((item) => <option key={item.id} value={item.id}>Season {item.season_number} — {item.historical_label} — {item.source_filename}</option>)}
      </select>
    </label>
    {selectedImport && <div className="mt-2 break-all font-mono text-xs text-zinc-500">Import UUID: {selectedImport.id}</div>}
    {!imports.length && !loading && <p className="mt-4 text-zinc-400">No committed Historical Stroke imports are available.</p>}
    {loading ? <p className="mt-4 text-zinc-400">Loading pairing review…</p> : selectedImport && <>
      <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {Object.entries({ Total: counts.total, Reviewed: counts.reviewed, Unreviewed: counts.unreviewed, Player: counts.player, BYE: counts.bye, Unknown: counts.unknown, Warnings: warnings.length }).map(([label, value]) => <div key={label} className="rounded border border-zinc-700 bg-zinc-950 p-3"><div className="text-xs uppercase text-zinc-400">{label}</div><div className="text-xl font-bold">{value}</div></div>)}
      </div>
      <div className="mt-5 space-y-6">{groups.map((group) => {
        const first = group[0]
        const complete = group.every((appearance) => draftState[appearance.id])
        return <article key={`${first.divisionNumber}:${first.courseOrder}`} className={`rounded-xl border p-4 ${complete ? "border-emerald-700 bg-emerald-950/20" : "border-zinc-700 bg-zinc-950"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Division {first.divisionNumber} · Game {first.courseOrder}</h3><p className="text-sm text-zinc-400">{first.courseName} · {complete ? "Review complete" : "Review incomplete"}</p></div>
            <button type="button" onClick={() => setDraftState((current) => group.reduce((next, appearance) => next[appearance.id] ? next : assignOpponent(next, appearances, appearance.id, "unknown"), current))} className="rounded border border-zinc-600 px-3 py-2 text-sm">Mark Remaining Unknown</button>
          </div>
          <div className="mt-3 space-y-2">{group.map((appearance) => {
            const choice = draftState[appearance.id]
            const opponent = choice?.opponentStandingId ? group.find((item) => item.standingId === choice.opponentStandingId) : null
            const eligible = group.filter((item) => item.standingId !== appearance.standingId && !draftState[item.id])
            const value = choice?.kind === "player" ? `player:${choice.opponentStandingId}` : choice?.kind ?? ""
            return <div key={appearance.id} className="grid gap-3 rounded border border-zinc-800 bg-zinc-900 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
              <div><div className="font-bold">{appearance.historicalDisplayName}</div><div className="text-sm text-zinc-400">{scoreLabel(appearance)}</div></div>
              <label className="text-sm">Opponent
                <select value={value} onChange={(event) => {
                  const selected = event.target.value
                  if (!selected) return
                  try {
                    setDraftState((current) => selected.startsWith("player:")
                      ? assignOpponent(current, appearances, appearance.id, "player", selected.slice(7))
                      : assignOpponent(current, appearances, appearance.id, selected as "bye" | "unknown"))
                    setMessage("")
                  } catch (error) { setMessage(error instanceof Error ? error.message : "Pairing could not be changed.") }
                }} className="mt-1 block w-full rounded border border-zinc-600 bg-zinc-950 px-3 py-2">
                  <option value="">Unreviewed</option>
                  {choice?.kind === "player" && opponent && <option value={value}>{opponent.historicalDisplayName}</option>}
                  {eligible.map((item) => <option key={item.standingId} value={`player:${item.standingId}`}>{item.historicalDisplayName}</option>)}
                  {byeDivisions.has(appearance.divisionNumber) && <option value="bye">BYE</option>}
                  <option value="unknown">Unknown (reviewed)</option>
                </select>
              </label>
              <button type="button" disabled={!choice} onClick={() => setDraftState((current) => clearPairing(current, appearances, appearance.id))} className="rounded border border-amber-700 px-3 py-2 text-sm disabled:opacity-40">Clear Pairing</button>
            </div>
          })}</div>
        </article>
      })}</div>
      {warnings.length > 0 && <div className="mt-5 rounded border border-amber-700 bg-amber-950/30 p-4"><h3 className="font-bold text-amber-300">Source consistency warnings (pairing is still allowed)</h3><ul className="mt-2 list-disc pl-5 text-sm text-amber-100">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
      <div className="sticky bottom-3 mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-950/95 p-4 shadow-xl"><button type="button" disabled={!dirty || saving} onClick={() => void save()} className="rounded bg-emerald-700 px-5 py-3 font-bold disabled:opacity-40">{saving ? "Saving…" : "Save Pairings"}</button><span className="text-sm text-zinc-400">Selections stay local until Save Pairings.</span></div>
    </>}
    {message && <div role="status" className="mt-4 rounded border border-zinc-700 bg-zinc-950 p-3">{message}</div>}
  </section>
}
