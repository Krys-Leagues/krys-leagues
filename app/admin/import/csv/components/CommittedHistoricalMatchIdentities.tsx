"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { historicalStandingIdentityRpcArgs } from "@/lib/importer/historicalMatchIdentity"
import { loadPlayers, type PlayerRecord } from "@/lib/importer/loadPlayers"
import { supabase } from "@/lib/supabase"
import ExistingPlayerPicker from "./ExistingPlayerPicker"

type HistoricalImport = { id: string; season_number: number; historical_label: string }
type HistoricalStanding = {
  id: string
  division_number: number
  source_final_rank: number
  historical_display_name: string
  canonical_player_id: string | null
  played: number
  wins: number
  losses: number
  draws: number
  points: number
  holes_won: number
}

export default function CommittedHistoricalMatchIdentities({ initialImportId }: { initialImportId?: string | null }) {
  const [imports, setImports] = useState<HistoricalImport[]>([])
  const [selectedImportId, setSelectedImportId] = useState(initialImportId ?? "")
  const [standings, setStandings] = useState<HistoricalStanding[]>([])
  const [players, setPlayers] = useState<PlayerRecord[]>([])
  const [searchingStandingId, setSearchingStandingId] = useState<string | null>(null)
  const [busyStandingId, setBusyStandingId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)

  const fetchImports = useCallback(async () => {
    const { data, error } = await supabase.from("historical_match_imports").select("id,season_number,historical_label").order("season_number", { ascending: false })
    if (error) throw error
    return (data ?? []) as HistoricalImport[]
  }, [])

  const fetchStandings = useCallback(async (importId: string) => {
    if (!importId) return []
    const { data, error } = await supabase.from("historical_match_standings")
      .select("id,division_number,source_final_rank,historical_display_name,canonical_player_id,played,wins,losses,draws,points,holes_won")
      .eq("historical_match_import_id", importId).order("division_number").order("source_final_rank")
    if (error) throw error
    return (data ?? []) as HistoricalStanding[]
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchImports(), loadPlayers({ includeInactive: true })])
      .then(([loadedImports, loadedPlayers]) => { if (!cancelled) { setImports(loadedImports); setSelectedImportId((current) => current || loadedImports[0]?.id || ""); setPlayers(loadedPlayers); setLoading(false) } })
      .catch((error: unknown) => { if (!cancelled) { setMessage(error instanceof Error ? error.message : "Committed identities could not be loaded."); setLoading(false) } })
    return () => { cancelled = true }
  }, [fetchImports])

  useEffect(() => {
    if (!selectedImportId) return
    void fetchStandings(selectedImportId).then(setStandings).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Historical standings could not be loaded."))
  }, [fetchStandings, selectedImportId])

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const selectedImport = imports.find((item) => item.id === selectedImportId)

  async function saveIdentity(standing: HistoricalStanding, playerId: string | null, playerName?: string) {
    setBusyStandingId(standing.id)
    setMessage("")
    const note = playerId ? `Explicitly linked to existing player ${playerName || playerId} in Historical Match identity review.` : "Explicitly cleared in Historical Match identity review."
    const { error } = await supabase.rpc("set_historical_match_standing_identity", historicalStandingIdentityRpcArgs(standing.id, playerId, note))
    setBusyStandingId(null)
    if (error) { setMessage(error.message); return }
    setSearchingStandingId(null)
    setStandings(await fetchStandings(selectedImportId))
    setMessage(playerId ? `${standing.historical_display_name} linked. Frozen historical facts were unchanged.` : `${standing.historical_display_name} is now unresolved. Frozen historical facts were unchanged.`)
  }

  return <section className="mb-8 rounded-2xl border border-blue-800 bg-blue-950/20 p-6">
    <h2 className="text-2xl font-bold">Manage committed Historical Match identities</h2>
    <p className="mt-2 text-zinc-300">Link, change, or clear identity metadata without re-importing or changing frozen historical facts.</p>
    {loading ? <p className="mt-4 text-zinc-400">Loading committed imports…</p> : <>
      <label className="mt-4 block text-sm font-bold">Historical import<select value={selectedImportId} onChange={(event) => setSelectedImportId(event.target.value)} className="mt-2 block w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2">
        {imports.map((item) => <option key={item.id} value={item.id}>Season {item.season_number} — {item.historical_label}</option>)}
      </select></label>
      {selectedImport && <div className="mt-2 break-all font-mono text-xs text-zinc-500">Import UUID: {selectedImport.id}</div>}
      {!imports.length && <p className="mt-4 text-zinc-400">No committed Historical Match imports are available.</p>}
      <div className="mt-5 space-y-3">{standings.map((standing) => {
        const linked = standing.canonical_player_id ? playersById.get(standing.canonical_player_id) : null
        return <div key={standing.id} className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-bold">Division {standing.division_number} · Rank {standing.source_final_rank} · {standing.historical_display_name}</div><div className="text-sm text-zinc-400">P {standing.played} · W {standing.wins} · L {standing.losses} · D {standing.draws} · PTS {standing.points} · HW {standing.holes_won}</div><div className={standing.canonical_player_id ? "mt-2 text-emerald-300" : "mt-2 text-amber-300"}>{standing.canonical_player_id ? <>Linked: {linked?.screen_name || standing.canonical_player_id} {linked && <Link className="ml-2 underline" href={`/admin/players/${linked.id}`} target="_blank">Open Player Identity</Link>}</> : "Unresolved"}</div></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busyStandingId === standing.id} onClick={() => setSearchingStandingId(standing.id)} className="rounded bg-blue-700 px-3 py-2 font-bold">{standing.canonical_player_id ? "Change linked player" : "Find / Link Existing Player"}</button>{standing.canonical_player_id && <button type="button" disabled={busyStandingId === standing.id} onClick={() => void saveIdentity(standing, null)} className="rounded border border-amber-600 px-3 py-2">Clear link / Leave unresolved</button>}</div></div>
          {searchingStandingId === standing.id && <ExistingPlayerPicker historicalDisplayName={standing.historical_display_name} onCancel={() => setSearchingStandingId(null)} onSelect={(player) => void saveIdentity(standing, player.id, player.screen_name)} />}
        </div>
      })}</div>
    </>}
    {message && <div role="status" className="mt-4 rounded border border-zinc-700 bg-zinc-950 p-3">{message}</div>}
  </section>
}
