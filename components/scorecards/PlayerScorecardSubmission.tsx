"use client"

import { useEffect, useState } from "react"
import DiscordSignInButton from "@/components/auth/DiscordSignInButton"

type Context = { adapterKey: "pyp" | "stroke" | "match"; sourceKey: string; seasonNumber: number | null; divisionNumber: number | null; gameNumber: number | null; divisionLabel: string | null; courseName: string; difficulty: "Easy" | "Hard"; opponentLabel: string | null; submissionComponentKey: string; evidence: Array<{ componentKey: string; label: string; reviewStatus: string | null }> }

export default function PlayerScorecardSubmission() {
  const [contexts, setContexts] = useState<Context[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => { let active = true; void fetch("/api/scorecards/available", { cache: "no-store" }).then(async (response) => { const body = await response.json() as { contexts?: Context[]; error?: string }; if (!active) return; if (!response.ok) { setError(body.error || "Scorecard contexts are unavailable."); setContexts([]) } else { setError(""); setContexts(body.contexts || []) } }).catch(() => { if (active) setError("Scorecard contexts are unavailable.") }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [refresh])
  return <main style={{ minHeight: "100vh", background: "#0b1020", color: "#f8fafc", padding: "48px 20px" }}><div style={{ maxWidth: 980, margin: "0 auto" }}><p style={{ letterSpacing: ".16em", color: "#a5b4fc", fontWeight: 800 }}>KRYS LEAGUES</p><h1 style={{ fontSize: "clamp(2rem, 5vw, 4rem)", margin: "8px 0" }}>SUBMIT YOUR SCORECARD</h1><p style={{ color: "#cbd5e1", maxWidth: 700 }}>Choose one of your active league scorecards. Your Discord identity and fixture are verified on the server before private evidence is accepted.</p><DiscordSignInButton returnTo="/scorecards" style={{ margin: "18px 0" }} />{error && <p role="alert" style={{ color: "#fecaca", padding: 14, border: "1px solid #7f1d1d", borderRadius: 10 }}>{error}</p>}{loading ? <p>Loading active scorecards…</p> : contexts.length === 0 && !error ? <p>No active scorecards are waiting for your submission.</p> : <div style={{ display: "grid", gap: 16, marginTop: 24 }}>{contexts.map((context) => <ScorecardContextCard key={`${context.adapterKey}:${context.sourceKey}`} context={context} onUploaded={() => setRefresh((value) => value + 1)} />)}</div>}</div></main>
}

function ScorecardContextCard({ context, onUploaded }: { context: Context; onUploaded: () => void }) {
  return <article style={{ border: "1px solid #334155", borderRadius: 16, padding: 20, background: "#111827" }}><p style={{ color: "#a5b4fc", fontWeight: 800, letterSpacing: ".1em" }}>{context.adapterKey.toUpperCase()}</p><h2 style={{ margin: "6px 0" }}>{context.divisionLabel || "Active fixture"} · Game {context.gameNumber ?? "—"}</h2><p style={{ color: "#cbd5e1" }}>{context.opponentLabel ? `Opponent: ${context.opponentLabel} · ` : ""}{context.courseName} {context.difficulty} · {context.adapterKey === "pyp" ? "COURSE 1 + COURSE 2" : "ONE SCORECARD"}</p><div style={{ display: "grid", gap: 12, marginTop: 16 }}>{context.evidence.map((slot) => <EvidenceUpload key={slot.componentKey} context={context} slot={slot} onUploaded={onUploaded} />)}</div></article>
}

function EvidenceUpload({ context, slot, onUploaded }: { context: Context; slot: Context["evidence"][number]; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  async function upload(file: File | undefined) { if (!file) return; setBusy(true); setMessage(""); const form = new FormData(); form.set("adapterKey", context.adapterKey); form.set("sourceKey", context.sourceKey); form.set("componentKey", slot.componentKey); form.set("file", file); try { const response = await fetch("/api/scorecards/upload", { method: "POST", body: form }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "Upload failed."); setMessage("SCORECARD SUBMITTED FOR REVIEW"); onUploaded() } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Upload failed.") } finally { setBusy(false) } }
  return <label style={{ display: "grid", gap: 6, border: "1px solid #475569", borderRadius: 10, padding: 12 }}><strong>{slot.label}</strong><span style={{ color: slot.reviewStatus ? "#fbbf24" : "#cbd5e1" }}>{slot.reviewStatus ? slot.reviewStatus.toUpperCase() : "NOT SUBMITTED"}</span>{!slot.reviewStatus && <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={(event) => void upload(event.target.files?.[0])} />}{busy && <span>SUBMITTING…</span>}{message && <span role="status">{message}</span>}</label>
}
