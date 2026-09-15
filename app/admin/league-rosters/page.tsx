"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { CURRENT_PLAYER_LIST_CONFIG, LEAGUE_ROSTER_CONFIG, type CurrentPlayerListKey, type LeagueType } from "@/lib/adminPlayerLists"

import styles from "./page.module.css"

type Scope = { kind: "league"; key: LeagueType } | { kind: "list"; key: CurrentPlayerListKey }
type Entry = { id: string; player_id: string; screen_name: string | null; division?: string | null; status: string | null; active: boolean; conflict?: boolean }
type DirectoryPlayer = { id: string; screen_name: string }

const DEFAULT_SCOPE = "league:stroke"

function parseScope(value: string): Scope {
  const [kind, key] = value.split(":")
  if (kind === "list" && key in CURRENT_PLAYER_LIST_CONFIG) return { kind, key: key as CurrentPlayerListKey }
  if (kind === "league" && key in LEAGUE_ROSTER_CONFIG) return { kind, key: key as LeagueType }
  return { kind: "league", key: "stroke" }
}

export default function LeagueRostersPage() {
  const [scopeValue, setScopeValue] = useState(DEFAULT_SCOPE)
  const [entries, setEntries] = useState<Entry[]>([])
  const [search, setSearch] = useState("")
  const [rosterFilter, setRosterFilter] = useState("")
  const [directory, setDirectory] = useState<DirectoryPlayer[]>([])
  const [selected, setSelected] = useState<DirectoryPlayer | null>(null)
  const [division, setDivision] = useState("")
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [migrationRequired, setMigrationRequired] = useState(false)
  const scope = useMemo(() => parseScope(scopeValue), [scopeValue])
  const leagueConfig = scope.kind === "league" ? LEAGUE_ROSTER_CONFIG[scope.key] : null
  const listConfig = scope.kind === "list" ? CURRENT_PLAYER_LIST_CONFIG[scope.key] : null
  const enrolled = useMemo(() => new Set(entries.map((entry) => entry.player_id)), [entries])
  const visibleEntries = useMemo(() => {
    const query = rosterFilter.trim().toLocaleLowerCase()
    if (!query) return entries
    return entries.filter((entry) => `${entry.screen_name || ""} ${entry.division || ""}`.toLocaleLowerCase().includes(query))
  }, [entries, rosterFilter])

  function changeScope(value: string) {
    const nextScope = parseScope(value)
    setScopeValue(value)
    setSelected(null)
    setSearch("")
    setDirectory([])
    setRosterFilter("")
    setDivision(nextScope.kind === "league" ? LEAGUE_ROSTER_CONFIG[nextScope.key].divisions[0] : "")
  }

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setMessage("")
    setMigrationRequired(false)
    const query = scope.kind === "league" ? `league_type=${scope.key}` : `list_key=${scope.key}`
    try {
      const response = await fetch(`/api/admin/league-rosters?${query}`, { cache: "no-store" })
      const payload = await response.json() as { error?: string; entries?: Entry[]; migration_required?: boolean }
      if (!response.ok) setMessage(payload.error || "Current roster or player list could not be loaded.")
      setEntries(payload.entries || [])
      setMigrationRequired(Boolean(payload.migration_required))
    } catch { setMessage("Current roster or player list could not be loaded.") }
    finally { setLoading(false) }
  }, [scope])

  useEffect(() => {
    // This effect synchronizes the selected scope with the protected server reader.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEntries()
  }, [loadEntries])

  async function searchGlobalPlayers() {
    if (search.trim().length < 2) return setDirectory([])
    try {
      const response = await fetch(`/api/admin/league-rosters?mode=directory&q=${encodeURIComponent(search.trim())}`, { cache: "no-store" })
      const payload = await response.json() as { error?: string; players?: DirectoryPlayer[] }
      if (!response.ok) return setMessage(payload.error || "Global Player search could not be loaded.")
      setDirectory(payload.players || [])
    } catch { setMessage("Global Player search could not be loaded.") }
  }

  async function mutate(method: "POST" | "PATCH" | "DELETE", body: Record<string, string>) {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/admin/league-rosters", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const payload = await response.json() as { error?: string; migration_required?: boolean }
      if (!response.ok) {
        setMigrationRequired(Boolean(payload.migration_required))
        return setMessage(payload.error || "The roster or player-list change could not be saved.")
      }
      setSelected(null)
      setSearch("")
      setDirectory([])
      await loadEntries()
      setMessage("Current membership updated. Historical participation was preserved.")
    } catch { setMessage("The roster or player-list change could not be saved.") }
    finally { setBusy(false) }
  }

  function addSelected() {
    if (!selected || busy || migrationRequired) return
    if (scope.kind === "league") return void mutate("POST", { action: "add", player_id: selected.id, league_type: scope.key, division })
    return void mutate("POST", { action: "add", player_id: selected.id, list_key: scope.key })
  }

  const title = leagueConfig?.label || listConfig?.label || "Player List"
  const currentLabel = scope.kind === "league" ? "current roster" : "current list"

  return <main className={styles.page}><div className={styles.shell}>
    <nav className={styles.nav}><Link href="/admin" className={styles.navLink}>← Admin</Link><Link href="/admin/players" className={styles.navLink}>Global Players</Link></nav>
    <h1 className={styles.title}>League Rosters &amp; Player Lists</h1>
    <p className={styles.subtitle}>Manage current participation from canonical Global Players. Removing a current entry never deletes the Global Player or historical results.</p>

    <section className={styles.panel}><label className={styles.label}>Manage<select value={scopeValue} onChange={(event) => changeScope(event.target.value)} className={styles.input}>
      <optgroup label="League Rosters">{Object.entries(LEAGUE_ROSTER_CONFIG).map(([key, config]) => <option key={`league:${key}`} value={`league:${key}`}>{config.label}</option>)}</optgroup>
      <optgroup label="Other Player Lists">{Object.entries(CURRENT_PLAYER_LIST_CONFIG).map(([key, config]) => <option key={`list:${key}`} value={`list:${key}`}>{config.label}</option>)}</optgroup>
    </select></label>
    {leagueConfig ? <p className={styles.notice}>One active division is allowed for each player in {leagueConfig.label}. {leagueConfig.label === "Solo" ? "Solo divisions are managed here; season snapshots and approvals remain in the existing Solo roster/version workflow." : "Season roster/version structures and historical memberships remain separate."}</p> : <p className={styles.notice}>{listConfig?.label} is a current participant list. {listConfig?.historyLabel} remain historical source data and are never rewritten by current-list changes.</p>}
    </section>

    {message && <p role="alert" className={styles.error}>{message}</p>}
    {migrationRequired && <p className={styles.notice}>This current player list is ready in code but requires the prepared forward-only migration before it can be changed. No historical data is imported or rewritten.</p>}
    <section className={styles.panel}><div className={styles.toolbar}><h2 className={styles.sectionTitle}>{title} {currentLabel}</h2><span className={styles.muted}>{visibleEntries.length}{visibleEntries.length !== entries.length ? ` of ${entries.length}` : ""} players</span></div>
      <input value={rosterFilter} onChange={(event) => setRosterFilter(event.target.value)} placeholder="Filter current roster by name or division" className={styles.input} />
      {loading ? <p className={styles.empty}>Loading current membership…</p> : visibleEntries.length === 0 ? <p className={styles.empty}>No players are currently registered in this {scope.kind === "league" ? "league" : "list"}. Historical participation is preserved separately.</p> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Global Player</th>{leagueConfig && <th>Division</th>}<th>Status</th><th>Actions</th></tr></thead><tbody>{visibleEntries.map((entry) => <tr key={entry.id}><td><span className={styles.playerName}>{entry.screen_name || "Unknown canonical player"}</span>{entry.conflict && <span className={styles.conflict}> · conflict requires review</span>}</td>{leagueConfig && <td><select value={entry.division || ""} disabled={busy || Boolean(entry.conflict)} onChange={(event) => void mutate("PATCH", { player_id: entry.player_id, league_type: scope.key, division: event.target.value })} className={styles.input}>{leagueConfig.divisions.map((item) => <option key={item}>{item}</option>)}</select></td>}<td>{entry.status || "active"}</td><td><button type="button" disabled={busy || Boolean(entry.conflict)} className={styles.danger} onClick={() => { if (window.confirm(`Remove ${entry.screen_name || "this player"} from the current ${scope.kind === "league" ? "roster" : "list"}? Historical participation is preserved.`)) void mutate("DELETE", scope.kind === "league" ? { player_id: entry.player_id, league_type: scope.key } : { player_id: entry.player_id, list_key: scope.key }) }}>Remove current entry</button></td></tr>)}</tbody></table></div>}
    </section>

    <section className={styles.panel}><h2 className={styles.sectionTitle}>Add Global Player</h2><p className={styles.muted}>Search the protected canonical Global Player directory. This workflow never creates a player and never guesses identity.</p><div className={styles.searchRow}><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void searchGlobalPlayers() }} placeholder="Search Global Players" className={styles.input} /><button type="button" onClick={() => void searchGlobalPlayers()} className={styles.primary}>Search</button></div>{leagueConfig && <label className={styles.label}>Division<select value={division} onChange={(event) => setDivision(event.target.value)} className={styles.input}>{leagueConfig.divisions.map((item) => <option key={item}>{item}</option>)}</select></label>}<div className={styles.results}>{directory.filter((player) => !enrolled.has(player.id)).map((player) => <button key={player.id} type="button" className={`${styles.result} ${selected?.id === player.id ? styles.selected : ""}`} onClick={() => setSelected(player)}><strong>{player.screen_name}</strong><span className={styles.muted}>{selected?.id === player.id ? "Selected" : "Choose this canonical player"}</span></button>)}</div><div className={styles.actions}><button type="button" disabled={!selected || busy || migrationRequired} onClick={addSelected} className={styles.primary}>{busy ? "Saving…" : `Add to ${title}`}</button></div></section>
  </div></main>
}
