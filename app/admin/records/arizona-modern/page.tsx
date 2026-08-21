"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"

import { supabase } from "@/lib/supabase"

type PreviewResponse = {
  error?: string
  foundationInstalled?: boolean
  sourceRowsScanned?: number
  categoryCounts?: Record<string, number>
  workbookResults?: Array<{
    sourceFilename: string
    sourceFileHash: string
    sourceCourseName: string
    recordCount: number
    issues: Array<{ category: string; message: string; sourceRow: number | null }>
  }>
  previewRows?: Array<{
    fingerprint: string
    sourceFilename: string
    sourceRow: number
    sourceNameCell: string
    sourceScoreCell: string
    sourceCourseName: string
    historicalPlayerName: string
    difficulty: string
    courseCode: string
    score: number
    category: string
    existingBestScore: number | null
    identity: {
      status: string
      canonicalScreenName: string | null
      matchedSource: string
      candidates: Array<{ screenName: string; confidence: number }>
    }
  }>
  legacy?: {
    reconciliation: Record<string, number>
    issues: Array<{ filename: string; row: number; message: string }>
  }
  identityFollowUps?: Array<{
    historicalPlayerName: string
    status: string
    candidates: Array<{ screenName: string; confidence: number }>
  }>
}

export default function ArizonaModernPilotPage() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PreviewResponse | null>(null)

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setResult(null)

    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      setResult({ error: "An authenticated site-admin session is required." })
      setBusy(false)
      return
    }

    const response = await fetch("/api/admin/records/arizona-modern/preview", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: new FormData(event.currentTarget),
    })
    const payload = (await response.json()) as PreviewResponse
    setResult(payload)
    setBusy(false)
  }

  return (
    <main style={page}>
      <Link href="/admin/records" style={backLink}>← Records Admin</Link>
      <h1 style={title}>Arizona Modern All-Time Pilot</h1>
      <p style={subtitle}>
        Read-only preview for <strong>Arazona Modern</strong> historical workbook rows,
        canonical AME/AMH identity resolution, and the 104-row legacy combined snapshot.
      </p>

      <section style={notice}>
        Preview does not apply records. Combined legacy rows remain pending source verification;
        handicap_rounds notes do not establish KWT or PRO provenance.
      </section>

      <form onSubmit={preview} style={card}>
        <label style={label}>
          Historical workbooks (.xlsm, maximum two)
          <input name="workbooks" type="file" accept=".xlsm" multiple style={input} />
        </label>
        <label style={label}>
          Legacy Arizona Modern CSV exports (maximum two)
          <input name="legacyCsvs" type="file" accept=".csv,text/csv" multiple style={input} />
        </label>
        <button disabled={busy} style={button}>{busy ? "Building preview…" : "Build read-only preview"}</button>
      </form>

      {result?.error && <section style={errorBox}>{result.error}</section>}

      {result && !result.error && (
        <>
          {!result.foundationInstalled && (
            <section style={warningBox}>
              The normalized SQL foundation is not installed in this environment. Categories are
              compared across uploaded sources only; no production mutation was attempted.
            </section>
          )}

          <section style={summaryGrid}>
            <Summary label="Source rows scanned" value={result.sourceRowsScanned ?? 0} />
            {Object.entries(result.categoryCounts ?? {}).map(([label, value]) => (
              <Summary key={label} label={label.replaceAll("_", " ")} value={value} />
            ))}
          </section>

          <section style={card}>
            <h2>Workbook provenance</h2>
            {(result.workbookResults ?? []).map((workbook) => (
              <div key={workbook.sourceFileHash} style={rowBlock}>
                <strong>{workbook.sourceFilename}</strong>
                <span>{workbook.recordCount} rows · source spelling: {workbook.sourceCourseName}</span>
                <code style={hash}>{workbook.sourceFileHash}</code>
                {workbook.issues.map((issue, index) => (
                  <span key={`${issue.category}-${index}`} style={warningText}>
                    {issue.category} {issue.sourceRow ? `row ${issue.sourceRow}` : ""}: {issue.message}
                  </span>
                ))}
              </div>
            ))}
          </section>

          <section style={card}>
            <h2>Legacy combined reconciliation</h2>
            <div style={summaryGrid}>
              {Object.entries(result.legacy?.reconciliation ?? {}).map(([label, value]) => (
                <Summary key={label} label={label.replaceAll(/([A-Z])/g, " $1")} value={value} />
              ))}
            </div>
            {(result.legacy?.issues ?? []).map((issue, index) => (
              <p key={`${issue.filename}-${issue.row}-${index}`} style={warningText}>
                {issue.filename} row {issue.row}: {issue.message}
              </p>
            ))}
          </section>

          <section style={card}>
            <h2>Identity follow-up</h2>
            {(result.identityFollowUps ?? []).length === 0 ? (
              <p>No unresolved or ambiguous historical names.</p>
            ) : (
              (result.identityFollowUps ?? []).map((identity) => (
                <div key={identity.historicalPlayerName} style={rowBlock}>
                  <strong>{identity.historicalPlayerName}</strong>
                  <span>{identity.status}</span>
                  {identity.candidates.length > 0 && (
                    <span>Suggestions only: {identity.candidates.map((candidate) => `${candidate.screenName} (${candidate.confidence}%)`).join(", ")}</span>
                  )}
                </div>
              ))
            )}
          </section>

          <section style={card}>
            <h2>Observation preview</h2>
            <div style={tableWrap}>
              <table style={table}>
                <thead><tr><th>Source</th><th>Cell</th><th>Course</th><th>Historical name</th><th>Canonical</th><th>Score</th><th>Existing</th><th>Action</th></tr></thead>
                <tbody>
                  {(result.previewRows ?? []).map((row) => (
                    <tr key={row.fingerprint}>
                      <td>{row.sourceFilename} · row {row.sourceRow}</td>
                      <td>{row.sourceNameCell}/{row.sourceScoreCell}</td>
                      <td>{row.courseCode} ({row.difficulty})<br /><small>source: {row.sourceCourseName}</small></td>
                      <td>{row.historicalPlayerName}</td>
                      <td>{row.identity.canonicalScreenName ?? row.identity.status}</td>
                      <td>{row.score}</td>
                      <td>{row.existingBestScore ?? "—"}</td>
                      <td>{row.category.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div style={summary}><span>{label}</span><strong>{value}</strong></div>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 24, background: "#020617", color: "white" }
const title: React.CSSProperties = { fontSize: 38, marginBottom: 8 }
const subtitle: React.CSSProperties = { color: "#cbd5e1", maxWidth: 900, lineHeight: 1.6 }
const backLink: React.CSSProperties = { color: "#93c5fd", textDecoration: "none" }
const card: React.CSSProperties = { marginTop: 20, padding: 20, border: "1px solid #334155", borderRadius: 14, background: "#0f172a" }
const notice: React.CSSProperties = { ...card, borderColor: "#1d4ed8", background: "#172554" }
const warningBox: React.CSSProperties = { ...card, borderColor: "#a16207", background: "#422006" }
const errorBox: React.CSSProperties = { ...card, borderColor: "#dc2626", background: "#450a0a" }
const label: React.CSSProperties = { display: "grid", gap: 8, marginBottom: 18, fontWeight: 700 }
const input: React.CSSProperties = { padding: 10, borderRadius: 8, color: "white", background: "#020617", border: "1px solid #475569" }
const button: React.CSSProperties = { padding: "12px 18px", borderRadius: 8, border: 0, background: "#2563eb", color: "white", fontWeight: 800, cursor: "pointer" }
const summaryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginTop: 20 }
const summary: React.CSSProperties = { display: "grid", gap: 6, padding: 14, borderRadius: 10, background: "#111827", border: "1px solid #334155", textTransform: "capitalize" }
const rowBlock: React.CSSProperties = { display: "grid", gap: 5, padding: "12px 0", borderBottom: "1px solid #334155" }
const warningText: React.CSSProperties = { color: "#fde68a" }
const hash: React.CSSProperties = { overflowWrap: "anywhere", color: "#94a3b8" }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", textAlign: "left" }
