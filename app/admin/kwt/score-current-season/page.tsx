"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

type Setup = { season: number; week: number; eventIdentifier: string; courseName: string; easyCourseCode: string; hardCourseCode: string }
type ImportRow = {
  id?: string; sourceRow: number; rawPlayerName: string; canonicalPlayerId?: string; canonicalName?: string; identityStatus?: string; identityNote?: string
  validationErrors: string[]; division: string | null; easyScore: number | null; hardScore: number | null; totalScore: number | null; overallPlacement: number | null; divisionPlacement: number | null
  rosterStatus?: "PRESENT" | "MISSING" | "DIVISION_MISMATCH"; rosterDivision?: string | null; rosterMessage?: string | null
}
type Batch = { id: string; source_filename: string; source_sha256: string; source_season: number; source_week: number; status: string; rows_found: number; matched_rows: number; error_rows: number; inserted_rows: number; corrected_rows: number; unchanged_rows: number }

export default function ScoreCurrentSeasonPage() {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [players, setPlayers] = useState<Array<{ id: string; screen_name: string }>>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [season, setSeason] = useState(15)
  const [week, setWeek] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [allowCorrections, setAllowCorrections] = useState(false)
  const [correctionReason, setCorrectionReason] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const load = async (batchId?: string) => {
    const response = await fetch(`/api/admin/kwt/score-current-season${batchId ? `?batchId=${batchId}` : ""}`, { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? "The importer could not be loaded.")
    setSetup(data.setup ?? null); setPlayers(data.players ?? []); setBatches(data.batches ?? []); setSelectedBatch(data.batch ?? null); setRows(data.rows ?? [])
  }

  useEffect(() => {
    let active = true
    fetch("/api/admin/kwt/score-current-season", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? "The importer could not be loaded.")
        if (!active) return
        setSetup(data.setup ?? null)
        setPlayers(data.players ?? [])
        setBatches(data.batches ?? [])
        setSelectedBatch(data.batch ?? null)
        setRows(data.rows ?? [])
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "The importer could not be loaded.")
      })
    return () => { active = false }
  }, [])

  const errorCount = useMemo(() => rows.filter((row) => row.validationErrors.length || !["MATCHED", "MANUAL"].includes(row.identityStatus ?? "")).length, [rows])
  const grossTieCounts = useMemo(() => countScores(rows, (row) => String(row.totalScore ?? "")), [rows])
  const divisionTieCounts = useMemo(() => countScores(rows, (row) => `${row.division ?? ""}|${row.totalScore ?? ""}`), [rows])
  const run = async (operation: () => Promise<Response>) => {
    setBusy(true); setError(""); setMessage("")
    try {
      const response = await operation(); const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "The operation failed.")
      return data
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The operation failed."); return null } finally { setBusy(false) }
  }

  const preview = async () => {
    if (!file) return setError("Choose the weekly CSV first.")
    const form = new FormData(); form.set("file", file); form.set("season", String(season)); form.set("week", String(week))
    const data = await run(() => fetch("/api/admin/kwt/score-current-season", { method: "POST", body: form }))
    if (data) { setMessage(`Preview ready for ${data.batch?.rows_found ?? data.parsed?.rows?.length ?? 0} rows.`); await load(data.batch?.id ?? data.batch?.batch_id) }
  }

  const resolveIdentity = async (rowId: string, playerId: string) => {
    const data = await run(() => fetch("/api/admin/kwt/score-current-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve_identity", batchId: selectedBatch?.id, rowId, canonicalPlayerId: playerId }) }))
    if (data) { setRows(data.rows ?? []); setSelectedBatch(data.batch ?? selectedBatch); setBatches(data.batches ?? batches) }
  }

  const enrollRoster = async (row: ImportRow) => {
    if (!row.id || !row.canonicalPlayerId || !row.division || !selectedBatch) return
    if (!window.confirm(`Enroll ${row.canonicalName || row.rawPlayerName} in the Season ${selectedBatch.source_season} KWT ${row.division} roster? This is an explicit roster change and does not apply the CSV.`)) return
    const data = await run(() => fetch("/api/admin/kwt/score-current-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enroll_roster", batchId: selectedBatch.id, rowId: row.id, canonicalPlayerId: row.canonicalPlayerId, division: row.division }) }))
    if (data) { setMessage(`${row.canonicalName || row.rawPlayerName} roster review updated.`); setRows(data.rows ?? []); setSelectedBatch(data.batch ?? selectedBatch); setBatches(data.batches ?? batches) }
  }

  const commit = async () => {
    if (!selectedBatch) return
    if (errorCount) return setError("Resolve every identity and validation issue before committing.")
    if (!window.confirm("Apply this reviewed KWT result set to the protected operational standings? Existing official results are never changed without correction confirmation.")) return
    const data = await run(() => fetch("/api/admin/kwt/score-current-season", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "commit", batchId: selectedBatch.id, allowCorrections, correctionReason }) }))
    if (data) { setMessage(`Import committed: ${data.result?.inserted_rows ?? 0} new, ${data.result?.corrected_rows ?? 0} corrected, ${data.result?.unchanged_rows ?? 0} unchanged.`); await load(selectedBatch.id) }
  }

  return <main style={page}>
    <Link href="/admin/kwt" style={back}>← KWT Admin</Link>
    <h1 style={title}>Score Current Season</h1>
    <p style={subtitle}>Upload the current-season weekly KWT CSV here. This is separate from the Historical KWT Importer.</p>
    <section style={panel}>
      <h2 style={heading}>Verified Week Setup</h2>
      {setup ? <p><strong>Season {setup.season}, Week {setup.week} · {setup.eventIdentifier}</strong><br />{setup.courseName} · Easy {setup.easyCourseCode} / Hard {setup.hardCourseCode}</p> : <p>No active verified KWT Week Setup is available.</p>}
      <div style={fields}><label>Season<input type="number" value={season} onChange={(event) => setSeason(Number(event.target.value))} /></label><label>Week<input type="number" min="1" max="12" value={week} onChange={(event) => setWeek(Number(event.target.value))} /></label><label style={fileLabel}>Weekly CSV<input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label></div>
      <button type="button" style={button} disabled={busy || !setup} onClick={preview}>{busy ? "Working…" : "Preview CSV"}</button>
    </section>
    {(message || error) && <p role={error ? "alert" : "status"} style={error ? errorBox : success}>{error || message}</p>}
    {selectedBatch && <section style={panel}>
      <h2 style={heading}>Review Before Applying</h2>
      <p><strong>{selectedBatch.source_filename}</strong> · SHA-256 <code>{selectedBatch.source_sha256}</code></p>
      <p>{selectedBatch.rows_found} rows · {selectedBatch.matched_rows} matched · {selectedBatch.error_rows} needing attention</p>
      {rows.some((row) => row.rosterStatus === "MISSING" || row.rosterStatus === "DIVISION_MISMATCH") && <p style={errorBox}>Season 15 roster review is required before Apply. The importer now checks the exact KWT roster and division before final confirmation. Use the per-player review action below; no player is enrolled automatically.</p>}
      <div style={infoBox}>
        <strong>Gross placement review</strong>
        <p style={{ margin: "6px 0 0" }}>The source <code>Pos</code> column is preserved as the overall GROSS position, including ties. This file has no Division Placement column, so division positions are calculated with competition ranking from GROSS Total Score inside each Rank Code division. Negative golf totals are valid.</p>
        <p style={{ margin: "6px 0 0" }}>NET rankings and frozen Handicap calculations remain independent and are not copied from these GROSS positions.</p>
      </div>
      <div style={tableWrap}><table><thead><tr><th>Row</th><th>CSV player</th><th>Canonical player</th><th>Division</th><th>Roster</th><th>GROSS POS</th><th>DIV POS</th><th>Easy / Hard / Total</th><th>Validation</th></tr></thead><tbody>{rows.map((row) => { const overallTied = (grossTieCounts.get(String(row.totalScore ?? "")) ?? 0) > 1; const divisionTied = (divisionTieCounts.get(`${row.division ?? ""}|${row.totalScore ?? ""}`) ?? 0) > 1; const rosterIssue = row.rosterStatus === "MISSING" || row.rosterStatus === "DIVISION_MISMATCH"; return <tr key={row.id ?? row.sourceRow}><td>{row.sourceRow}</td><td>{row.rawPlayerName}</td><td>{row.id && !["MATCHED", "MANUAL"].includes(row.identityStatus ?? "") ? <select defaultValue="" onChange={(event) => resolveIdentity(row.id!, event.target.value)}><option value="">Select canonical player</option>{players.map((player) => <option key={player.id} value={player.id}>{player.screen_name}</option>)}</select> : <span>{row.canonicalName || "—"}{row.identityStatus === "MANUAL" ? " (manual)" : ""}</span>}</td><td>{row.division || "—"}</td><td style={{ color: rosterIssue ? "#fca5a5" : "#86efac" }}>{row.rosterStatus === "PRESENT" ? "Enrolled" : row.rosterStatus === "DIVISION_MISMATCH" ? `Wrong division (${row.rosterDivision})` : row.rosterStatus === "MISSING" ? <button type="button" style={smallButton} disabled={busy || !row.canonicalPlayerId || !row.division} onClick={() => void enrollRoster(row)}>Review / enroll</button> : "Not checked"}</td><td>{row.overallPlacement ?? "—"}{overallTied ? " · tie" : ""}</td><td>{row.divisionPlacement ?? "—"}{divisionTied ? " · tie" : ""}</td><td>{row.easyScore ?? "—"} / {row.hardScore ?? "—"} / {row.totalScore ?? "—"}</td><td style={{ color: row.validationErrors.length ? "#fca5a5" : "#86efac" }}>{row.validationErrors.length ? row.validationErrors.join(" ") : "Ready"}</td></tr>})}</tbody></table></div>
      <div style={reviewControls}><label><input type="checkbox" checked={allowCorrections} onChange={(event) => setAllowCorrections(event.target.checked)} /> Allow explicit corrections to existing official results</label>{allowCorrections && <input style={reasonInput} placeholder="Correction reason (required)" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} />}</div>
      <button type="button" style={button} disabled={busy || errorCount > 0 || (allowCorrections && !correctionReason.trim()) || selectedBatch.status === "COMMITTED"} onClick={commit}>{selectedBatch.status === "COMMITTED" ? "Already committed" : "Confirm and apply reviewed results"}</button>
      <p style={note}>Applying an import preserves the source hash, row evidence, and operational-result audit trail. It does not recalculate Handicaps or award trophies.</p>
    </section>}
    <section style={panel}><h2 style={heading}>Recent Current-Season Imports</h2>{batches.length ? <ul>{batches.map((batch) => <li key={batch.id}><button type="button" style={historyButton} onClick={() => load(batch.id)}>{batch.source_filename}</button> · {batch.status} · {batch.rows_found} rows</li>)}</ul> : <p>No current-season imports yet.</p>}</section>
  </main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: "28px min(5vw, 64px)", background: "#05070b", color: "#f8fafc" }
const back: React.CSSProperties = { color: "#9beeff", textDecoration: "none" }
const title: React.CSSProperties = { fontSize: "clamp(2rem, 5vw, 3.6rem)", margin: "18px 0 8px" }
const subtitle: React.CSSProperties = { color: "#b9c7d2", maxWidth: 760 }
const panel: React.CSSProperties = { marginTop: 22, padding: 22, border: "1px solid #26384b", borderRadius: 16, background: "#0b111a" }
const heading: React.CSSProperties = { marginTop: 0, color: "#f2c763" }
const fields: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end", margin: "18px 0" }
const fileLabel: React.CSSProperties = { minWidth: 280 }
const button: React.CSSProperties = { border: 0, borderRadius: 10, padding: "12px 16px", background: "#f2c763", color: "#111827", fontWeight: 900, cursor: "pointer" }
const success: React.CSSProperties = { padding: 14, borderRadius: 10, background: "#12351f", color: "#bbf7d0" }
const errorBox: React.CSSProperties = { padding: 14, borderRadius: 10, background: "#3b1116", color: "#fecaca" }
const tableWrap: React.CSSProperties = { overflowX: "auto", margin: "18px 0" }
const reviewControls: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }
const reasonInput: React.CSSProperties = { minWidth: 280, padding: 10, background: "#111827", color: "white", border: "1px solid #475569", borderRadius: 8 }
const note: React.CSSProperties = { color: "#94a3b8", fontSize: 13 }
const historyButton: React.CSSProperties = { border: 0, background: "transparent", color: "#9beeff", cursor: "pointer", padding: 4 }
const infoBox: React.CSSProperties = { margin: "16px 0", padding: 14, borderRadius: 10, border: "1px solid #35516a", background: "#0b1928", color: "#cfe8f5" }
const smallButton: React.CSSProperties = { border: "1px solid #f2c763", borderRadius: 8, padding: "7px 9px", background: "#1e293b", color: "#fef3c7", cursor: "pointer", whiteSpace: "nowrap" }

function countScores(rows: ImportRow[], keyFor: (row: ImportRow) => string) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.totalScore === null) continue
    const key = keyFor(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}
