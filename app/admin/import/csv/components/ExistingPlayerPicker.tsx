"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { searchExistingPlayers, type ExistingPlayerSearchResult } from "@/lib/importer/historicalMatchIdentity"
import { loadPlayerAliases } from "@/lib/importer/loadPlayerAliases"
import { loadPlayers, type PlayerRecord } from "@/lib/importer/loadPlayers"
import type { PlayerIdentityAlias } from "@/lib/identity"

type Props = {
  historicalDisplayName: string
  onSelect: (player: ExistingPlayerSearchResult) => void
  onCancel: () => void
  selectLabel?: string
}

export default function ExistingPlayerPicker({ historicalDisplayName, onSelect, onCancel, selectLabel = "Link this player" }: Props) {
  const [query, setQuery] = useState("")
  const [players, setPlayers] = useState<PlayerRecord[]>([])
  const [aliases, setAliases] = useState<PlayerIdentityAlias[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    Promise.all([loadPlayers({ includeInactive: true }), loadPlayerAliases()])
      .then(([loadedPlayers, loadedAliases]) => {
        if (cancelled) return
        setPlayers(loadedPlayers)
        setAliases(loadedAliases)
        setLoading(false)
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : "Existing players could not be loaded.")
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const results = useMemo(() => searchExistingPlayers(players, aliases, query), [aliases, players, query])

  return <div role="dialog" aria-label={`Find existing player for ${historicalDisplayName}`} className="mt-3 rounded-lg border border-blue-700 bg-zinc-950 p-4">
    <div className="font-bold text-blue-200">Find / Link Existing Player</div>
    <div className="mt-1 text-sm text-zinc-400">Historical name remains frozen as <strong>{historicalDisplayName}</strong>.</div>
    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Screen name, alias, Discord name, or Discord ID" className="mt-3 w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2" autoFocus />
    {loading && <div className="mt-3 text-zinc-400">Loading existing global players…</div>}
    {error && <div role="alert" className="mt-3 text-red-300">{error}</div>}
    {!loading && query.trim() && results.length === 0 && <div className="mt-3 text-zinc-400">No existing player matched. Create or edit identities in the global Players tools.</div>}
    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
      {results.map((player) => <div key={player.id} className="rounded border border-zinc-700 bg-zinc-900 p-3">
        <div className="font-bold">{player.screen_name} {!player.active && <span className="text-xs text-amber-300">inactive</span>}</div>
        <div className="font-mono text-xs text-zinc-500">{player.id}</div>
        <div className="mt-1 text-sm text-zinc-300">Discord: {player.discord_name || player.discord_username || "—"} · ID: {player.discord_id || "—"}</div>
        <div className="text-sm text-zinc-400">Aliases: {player.aliases.length ? player.aliases.join(", ") : "—"}</div>
        <div className="text-xs text-blue-300">Matched by: {player.matchedBy.join(", ")}</div>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onSelect(player)} className="rounded bg-blue-700 px-3 py-1 font-bold">{selectLabel}</button><Link href={`/admin/players/${player.id}`} target="_blank" className="rounded border border-zinc-600 px-3 py-1">Open Player Identity</Link></div>
      </div>)}
    </div>
    <button type="button" onClick={onCancel} className="mt-3 rounded border border-zinc-600 px-3 py-1">Cancel search</button>
  </div>
}
