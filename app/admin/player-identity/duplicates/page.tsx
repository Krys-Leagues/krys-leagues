"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

type Candidate = {
  id: string
  screenName: string
  active: boolean
  status: string
  discordLinked: boolean
  discordName: string | null
  resultsCount: number
  scheduleCount: number
  membershipCount: number
  tournamentCount: number
  approvedHistoryCount: number
  trophyCount: number
  aliases: string[]
}

type CandidatePairRow = {
  player1_id: string
  player1_screen_name: string
  player1_active: boolean
  player1_status: string
  player1_discord_linked: boolean
  player1_discord_name: string | null
  player1_results_count: number
  player1_schedule_count: number
  player1_membership_count: number
  player1_tournament_count: number
  player1_approved_history_count: number
  player1_trophy_count: number
  player1_aliases: string[] | null
  player2_id: string
  player2_screen_name: string
  player2_active: boolean
  player2_status: string
  player2_discord_linked: boolean
  player2_discord_name: string | null
  player2_results_count: number
  player2_schedule_count: number
  player2_membership_count: number
  player2_tournament_count: number
  player2_approved_history_count: number
  player2_trophy_count: number
  player2_aliases: string[] | null
  confidence: number
  evidence: string[]
  evidence_signature: string
}

type CandidateGroup = {
  id: string
  candidates: Candidate[]
  confidence: number
  evidence: string[]
}

type MergePreview = {
  keep_player_id: string
  keep_screen_name: string
  keep_discord_linked: boolean
  merging_players: Array<{ id: string; screen_name: string; discord_linked: boolean }>
  aliases_to_create: string[]
  results_count: number
  schedule_count: number
  league_membership_count: number
  tournament_entry_count: number
  roster_reference_count: number
  transition_reference_count: number
  trophy_count: number
  approved_history_count: number
}

function candidateFromRow(row: CandidatePairRow, side: 1 | 2): Candidate {
  const prefix = side === 1 ? "player1" : "player2"
  return {
    id: row[`${prefix}_id`],
    screenName: row[`${prefix}_screen_name`],
    active: row[`${prefix}_active`],
    status: row[`${prefix}_status`],
    discordLinked: row[`${prefix}_discord_linked`],
    discordName: row[`${prefix}_discord_name`],
    resultsCount: Number(row[`${prefix}_results_count`]),
    scheduleCount: Number(row[`${prefix}_schedule_count`]),
    membershipCount: Number(row[`${prefix}_membership_count`]),
    tournamentCount: Number(row[`${prefix}_tournament_count`]),
    approvedHistoryCount: Number(row[`${prefix}_approved_history_count`]),
    trophyCount: Number(row[`${prefix}_trophy_count`]),
    aliases: row[`${prefix}_aliases`] || [],
  }
}

function groupPairs(rows: CandidatePairRow[]): CandidateGroup[] {
  const parent = new Map<string, string>()
  const candidates = new Map<string, Candidate>()

  function find(id: string): string {
    const current = parent.get(id) || id
    if (current === id) return id
    const root = find(current)
    parent.set(id, root)
    return root
  }

  function union(left: string, right: string) {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot)
  }

  rows.forEach((row) => {
    const left = candidateFromRow(row, 1)
    const right = candidateFromRow(row, 2)
    candidates.set(left.id, left)
    candidates.set(right.id, right)
    if (!parent.has(left.id)) parent.set(left.id, left.id)
    if (!parent.has(right.id)) parent.set(right.id, right.id)
    union(left.id, right.id)
  })

  const grouped = new Map<string, Candidate[]>()
  candidates.forEach((candidate) => {
    const root = find(candidate.id)
    grouped.set(root, [...(grouped.get(root) || []), candidate])
  })

  return Array.from(grouped.values()).map((members) => {
    const ids = new Set(members.map((member) => member.id))
    const related = rows.filter((row) => ids.has(row.player1_id) && ids.has(row.player2_id))
    return {
      id: [...ids].sort().join(":"),
      candidates: members.sort((left, right) => left.screenName.localeCompare(right.screenName)),
      confidence: Math.max(...related.map((row) => row.confidence)),
      evidence: [...new Set(related.flatMap((row) => row.evidence || []))],
    }
  }).sort((left, right) => right.confidence - left.confidence)
}

export default function DuplicatePlayerReviewPage() {
  const router = useRouter()
  const [rows, setRows] = useState<CandidatePairRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")
  const [confidenceFilter, setConfidenceFilter] = useState("all")
  const [historyOnly, setHistoryOnly] = useState(false)
  const [activeOnly, setActiveOnly] = useState(false)
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({})
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({})
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [previewGroupId, setPreviewGroupId] = useState("")

  async function loadCandidates() {
    setLoading(true)
    setError("")
    const { data, error: loadError } = await supabase.rpc("get_site_player_duplicate_candidates")
    setLoading(false)
    if (loadError) {
      setError(loadError.message)
      return
    }
    setRows((data || []) as CandidatePairRow[])
  }

  useEffect(() => {
    // Initial server-backed queue load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCandidates()
  }, [])

  const groups = useMemo(() => groupPairs(rows), [rows])
  const visibleGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return groups.filter((group) => {
      if (skipped.has(group.id)) return false
      if (normalizedSearch && !group.candidates.some((candidate) =>
        candidate.screenName.toLocaleLowerCase().includes(normalizedSearch)
        || candidate.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedSearch)))) return false
      if (confidenceFilter === "high" && group.confidence < 85) return false
      if (confidenceFilter === "medium" && (group.confidence < 60 || group.confidence >= 85)) return false
      if (confidenceFilter === "discord" && !group.evidence.includes("Same Discord identity")) return false
      if (historyOnly && !group.candidates.some((candidate) =>
        candidate.resultsCount + candidate.approvedHistoryCount + candidate.trophyCount > 0)) return false
      if (activeOnly && !group.candidates.some((candidate) => candidate.active)) return false
      return true
    })
  }, [groups, skipped, search, confidenceFilter, historyOnly, activeOnly])

  function selectedIds(group: CandidateGroup) {
    return selectedByGroup[group.id] || []
  }

  function toggleCandidate(group: CandidateGroup, playerId: string) {
    const current = selectedIds(group)
    const next = current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId]
    setSelectedByGroup((value) => ({ ...value, [group.id]: next }))
    if (!next.includes(keepByGroup[group.id])) {
      setKeepByGroup((value) => ({ ...value, [group.id]: "" }))
    }
  }

  function selectAll(group: CandidateGroup) {
    setSelectedByGroup((value) => ({ ...value, [group.id]: group.candidates.map((candidate) => candidate.id) }))
  }

  async function openPreview(group: CandidateGroup) {
    const selected = selectedIds(group)
    const keepId = keepByGroup[group.id]
    if (selected.length < 2 || !keepId || !selected.includes(keepId)) {
      setError("Select at least two candidates and choose one selected player to KEEP.")
      return
    }
    setBusy(true)
    setError("")
    const { data, error: previewError } = await supabase.rpc("preview_site_player_identity_merge", {
      p_keep_player_id: keepId,
      p_merge_player_ids: selected.filter((id) => id !== keepId),
    })
    setBusy(false)
    if (previewError) {
      setError(previewError.message)
      return
    }
    const saved = Array.isArray(data) ? data[0] : data
    if (!saved) {
      setError("The merge preview returned no information.")
      return
    }
    setPreview(saved as MergePreview)
    setPreviewGroupId(group.id)
  }

  async function confirmMerge() {
    if (!preview) return
    setBusy(true)
    setError("")
    const { error: mergeError } = await supabase.rpc("merge_site_player_identities", {
      p_keep_player_id: preview.keep_player_id,
      p_merge_player_ids: preview.merging_players.map((player) => player.id),
    })
    setBusy(false)
    if (mergeError) {
      setError(mergeError.message)
      return
    }
    setPreview(null)
    setSelectedByGroup((value) => ({ ...value, [previewGroupId]: [] }))
    setKeepByGroup((value) => ({ ...value, [previewGroupId]: "" }))
    setMessage("Selected identities were merged into the canonical player.")
    await loadCandidates()
  }

  async function markDifferent(group: CandidateGroup) {
    const selected = selectedIds(group)
    if (selected.length < 2) {
      setError("Select at least two candidates to mark as different people.")
      return
    }
    setBusy(true)
    setError("")
    const { error: saveError } = await supabase.rpc("mark_site_players_not_match", {
      p_player_ids: selected,
    })
    setBusy(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    setMessage("The selected players were recorded as different people.")
    await loadCandidates()
  }

  return <main style={page}><div style={container}>
    <nav style={nav}>
      <button style={secondaryButton} onClick={() => router.push("/admin/player-identity")}>← Player Identity</button>
      <button style={secondaryButton} onClick={() => router.push("/admin/players")}>Players</button>
      <button style={secondaryButton} onClick={() => router.push("/admin")}>Admin</button>
    </nav>
    <h1 style={title}>Duplicate Player Review</h1>
    <p style={subtitle}>Suggestions only. Nothing merges until you select the exact identities, choose KEEP, review the impact, and confirm.</p>

    <section style={controls}>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search screen name or alias" style={input} />
      <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value)} style={input}>
        <option value="all">All confidence levels</option>
        <option value="high">High confidence</option>
        <option value="medium">Possible variants</option>
        <option value="discord">Same Discord</option>
      </select>
      <label style={checkLabel}><input type="checkbox" checked={historyOnly} onChange={(event) => setHistoryOnly(event.target.checked)} /> Has history/results</label>
      <label style={checkLabel}><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> Has active player</label>
      <button onClick={loadCandidates} disabled={loading || busy} style={secondaryButton}>Refresh Queue</button>
    </section>

    {error && <div style={errorBox}>{error}</div>}
    {message && <div style={successBox}>{message}</div>}
    {loading ? <p>Loading possible matches…</p> : visibleGroups.length === 0 ? <p style={empty}>No unresolved groups match these filters.</p> : visibleGroups.map((group) => {
      const selected = selectedIds(group)
      return <section key={group.id} style={groupCard}>
        <header style={groupHeader}>
          <div><strong>Possible Match Group</strong><div style={confidence}>{group.confidence >= 85 ? "HIGH" : "POSSIBLE"} · {group.confidence}%</div></div>
          <div style={evidence}>{group.evidence.join(" · ")}</div>
        </header>
        <div style={candidateGrid}>{group.candidates.map((candidate) => <article key={candidate.id} style={{...candidateCard, borderColor: selected.includes(candidate.id) ? "#60a5fa" : "#3f3f46"}}>
          <label style={candidateSelect}><input type="checkbox" checked={selected.includes(candidate.id)} onChange={() => toggleCandidate(group, candidate.id)} /> Select</label>
          <div style={playerName}>{candidate.screenName}</div>
          <code style={uuid}>{candidate.id}</code>
          <div style={badges}><span style={badge}>{candidate.active ? "ACTIVE" : candidate.status.toUpperCase()}</span><span style={badge}>{candidate.discordLinked ? `Discord: ${candidate.discordName || "Linked"}` : "Discord: Not linked"}</span></div>
          <div style={counts}>Results {candidate.resultsCount} · Schedule {candidate.scheduleCount} · Leagues {candidate.membershipCount} · Tournaments {candidate.tournamentCount} · Approved history {candidate.approvedHistoryCount} · Trophies {candidate.trophyCount}</div>
          <div style={aliases}>Aliases: {candidate.aliases.length ? candidate.aliases.join(", ") : "—"}</div>
          {selected.includes(candidate.id) && <label style={keepLabel}><input type="radio" name={`keep-${group.id}`} checked={keepByGroup[group.id] === candidate.id} onChange={() => setKeepByGroup((value) => ({ ...value, [group.id]: candidate.id }))} /> KEEP / canonical</label>}
        </article>)}</div>
        <footer style={actions}>
          <button style={secondaryButton} onClick={() => selectAll(group)}>Select All</button>
          <button style={primaryButton} disabled={busy || selected.length < 2 || !keepByGroup[group.id]} onClick={() => openPreview(group)}>Preview Merge</button>
          <button style={dangerButton} disabled={busy || selected.length < 2} onClick={() => markDifferent(group)}>Selected Are Different People</button>
          <button style={secondaryButton} onClick={() => setSkipped((value) => new Set(value).add(group.id))}>Review Later</button>
        </footer>
      </section>
    })}

    {preview && <div style={overlay}><section style={modal}>
      <h2>Confirm Identity Merge</h2>
      <div style={previewSection}><strong>KEEP PLAYER</strong><div style={playerName}>{preview.keep_screen_name}</div><code style={uuid}>{preview.keep_player_id}</code><div>{preview.keep_discord_linked ? "Discord linked" : "Discord not linked"}</div></div>
      <div style={previewSection}><strong>MERGING / RETIRING</strong>{preview.merging_players.map((player) => <div key={player.id} style={previewPlayer}>{player.screen_name} · <code>{player.id}</code> · {player.discord_linked ? "Discord linked" : "Discord not linked"}</div>)}</div>
      <div style={previewSection}><strong>Aliases preserved</strong><div>{preview.aliases_to_create.length ? preview.aliases_to_create.join(", ") : "None"}</div></div>
      <div style={previewCounts}>Results {preview.results_count} · Schedule {preview.schedule_count} · League memberships {preview.league_membership_count} · Tournament entries {preview.tournament_entry_count} · Rosters {preview.roster_reference_count} · Transition decisions {preview.transition_reference_count} · Trophies {preview.trophy_count} · Approved history {preview.approved_history_count}</div>
      <p style={warning}>Frozen historical rows remain unchanged. Their UUIDs resolve to the KEEP player for combined career history.</p>
      <div style={actions}><button style={secondaryButton} disabled={busy} onClick={() => setPreview(null)}>Cancel</button><button style={dangerButton} disabled={busy} onClick={confirmMerge}>{busy ? "Merging…" : "Confirm Permanent Merge"}</button></div>
    </section></div>}
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", background: "#050505", color: "white", padding: 24 }
const container: React.CSSProperties = { maxWidth: 1350, margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" }
const title: React.CSSProperties = { fontSize: 38, marginBottom: 6 }
const subtitle: React.CSSProperties = { color: "#a1a1aa", marginTop: 0 }
const controls: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: 16, background: "#111", border: "1px solid #333", borderRadius: 12 }
const input: React.CSSProperties = { padding: "10px 12px", background: "#09090b", color: "white", border: "1px solid #52525b", borderRadius: 8 }
const checkLabel: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", color: "#d4d4d8" }
const groupCard: React.CSSProperties = { marginTop: 18, padding: 18, background: "#0b0b0d", border: "1px solid #3f3f46", borderRadius: 16 }
const groupHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }
const confidence: React.CSSProperties = { marginTop: 4, color: "#fbbf24", fontSize: 13, fontWeight: 800 }
const evidence: React.CSSProperties = { color: "#a1a1aa", maxWidth: 700 }
const candidateGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 16 }
const candidateCard: React.CSSProperties = { padding: 14, border: "1px solid", background: "#111113", borderRadius: 12 }
const candidateSelect: React.CSSProperties = { display: "flex", gap: 6, color: "#d4d4d8", fontSize: 13 }
const playerName: React.CSSProperties = { marginTop: 8, fontSize: 22, fontWeight: 850 }
const uuid: React.CSSProperties = { display: "block", marginTop: 4, color: "#a1a1aa", overflowWrap: "anywhere", fontSize: 11 }
const badges: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }
const badge: React.CSSProperties = { padding: "3px 7px", borderRadius: 999, background: "#27272a", color: "#e4e4e7", fontSize: 11 }
const counts: React.CSSProperties = { marginTop: 10, color: "#d4d4d8", fontSize: 13, lineHeight: 1.5 }
const aliases: React.CSSProperties = { marginTop: 8, color: "#a1a1aa", fontSize: 13 }
const keepLabel: React.CSSProperties = { display: "flex", gap: 6, marginTop: 12, color: "#86efac", fontWeight: 800 }
const actions: React.CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }
const secondaryButton: React.CSSProperties = { padding: "9px 13px", borderRadius: 8, border: "1px solid #52525b", background: "#18181b", color: "white", cursor: "pointer" }
const primaryButton: React.CSSProperties = { ...secondaryButton, background: "#2563eb", borderColor: "#2563eb", fontWeight: 800 }
const dangerButton: React.CSSProperties = { ...secondaryButton, background: "#7f1d1d", borderColor: "#dc2626", fontWeight: 800 }
const errorBox: React.CSSProperties = { marginTop: 14, padding: 12, color: "#fecaca", background: "#2a0b0b", border: "1px solid #ef4444", borderRadius: 8 }
const successBox: React.CSSProperties = { marginTop: 14, padding: 12, color: "#dcfce7", background: "#082f1c", border: "1px solid #22c55e", borderRadius: 8 }
const empty: React.CSSProperties = { padding: 24, color: "#a1a1aa" }
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.82)", display: "grid", placeItems: "center", padding: 20, overflowY: "auto" }
const modal: React.CSSProperties = { width: "min(900px, 96vw)", maxHeight: "92vh", overflowY: "auto", background: "#101012", border: "1px solid #52525b", borderRadius: 16, padding: 24 }
const previewSection: React.CSSProperties = { marginTop: 14, padding: 13, background: "#18181b", borderRadius: 10 }
const previewPlayer: React.CSSProperties = { marginTop: 8, overflowWrap: "anywhere" }
const previewCounts: React.CSSProperties = { marginTop: 14, lineHeight: 1.7, color: "#d4d4d8" }
const warning: React.CSSProperties = { color: "#fde68a" }
