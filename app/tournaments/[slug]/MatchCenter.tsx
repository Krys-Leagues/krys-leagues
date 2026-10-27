"use client"

import { useEffect, useMemo, useState } from "react"
import { formatLocalDateTime, localDateTimeToUtc } from "@/lib/tournaments/schedule"

/* eslint-disable @next/next/no-img-element */

type Props = { tournamentId: string; matchId?: string; playerAId: string | null; playerBId: string | null; playerAName: string; playerBName: string; status: string }
type Offer = { id: string; proposed_by: string; starts_at: string; proposed_timezone: string; status: "pending" | "accepted" | "countered" | "withdrawn"; is_current_user_proposer?: boolean; player_a_local_time?: string | null; player_b_local_time?: string | null }

export default function MatchCenter({ tournamentId, matchId, playerAId, playerBId, playerAName, playerBName, status }: Props) {
  const zone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", [])
  const [localTime, setLocalTime] = useState("")
  const [offers, setOffers] = useState<Offer[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [winner, setWinner] = useState(playerAId || "")
  const [explanation, setExplanation] = useState("")
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!matchId) return
    let cancelled = false
    void fetch(`/api/tournaments/${tournamentId}/matches/schedule?matchId=${encodeURIComponent(matchId)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ offers?: Offer[]; error?: string }>)
      .then((result) => { if (!cancelled) { setOffers(result.offers ?? []); if (result.error) setMessage(result.error) } })
      .catch(() => { if (!cancelled) setMessage("Schedule offers could not be loaded.") })
    return () => { cancelled = true }
  }, [matchId, tournamentId])
  const refreshOffers = async () => {
    if (!matchId) return
    const response = await fetch(`/api/tournaments/${tournamentId}/matches/schedule?matchId=${encodeURIComponent(matchId)}`, { cache: "no-store" })
    const result = await response.json().catch(() => ({})) as { offers?: Offer[] }
    setOffers(result.offers ?? [])
  }
  const submit = async (path: string, body: unknown) => { setBusy(true); setMessage(""); try { const response = await fetch(`/api/tournaments/${tournamentId}/matches/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json().catch(() => ({})) as { error?: string; result?: { status?: string }; requestId?: string }; setMessage(result.error || result.result?.status || (result.requestId ? "Forfeit request sent to admins." : "Saved.")); if (path === "schedule") await refreshOffers() } finally { setBusy(false) } }
  const localPreview = (() => { if (!localTime) return null; try { const startsAt = localDateTimeToUtc(localTime, zone); return { startsAt, first: formatLocalDateTime(startsAt, zone) } } catch { return null } })()
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} style={{ marginTop: 9, borderTop: "1px solid #334155", paddingTop: 8 }}>
    <summary style={{ cursor: "pointer", color: "#f0abfc", fontWeight: 800 }}>MATCH CENTER</summary>
    <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
      <label style={label}>Propose or counter a time ({zone})<input type="datetime-local" value={localTime} onChange={(event) => setLocalTime(event.target.value)} style={input} /></label>
      {localPreview && <p style={hint}>Your time: {localPreview.first} · Opponent time appears on the offer after saving.</p>}
      <div style={row}><button type="button" disabled={busy || !localPreview} onClick={() => { if (!localPreview) return; void submit("schedule", { action: "propose", startsAt: localPreview.startsAt, timeZone: zone, idempotencyKey: crypto.randomUUID() }) }} style={button}>PROPOSE TIME</button><span style={hint}>Both players will see their own local time.</span></div>
      {offers.length > 0 && <div style={{ display: "grid", gap: 7 }}><strong style={{ color: "#e2e8f0", fontSize: 12 }}>SCHEDULE OFFERS</strong>{offers.map((offer) => <div key={offer.id} style={offerCard}><span style={hint}>{offer.status.toUpperCase()} · {offer.proposed_by === playerAId ? playerAName : playerBName}</span><span style={{ color: "#e2e8f0", fontSize: 12 }}>{playerAName}: {offer.player_a_local_time ?? "Unavailable"}</span><span style={{ color: "#e2e8f0", fontSize: 12 }}>{playerBName}: {offer.player_b_local_time ?? "Unavailable"}</span><span style={hint}>Proposed in {offer.proposed_timezone}</span><div style={row}>{offer.status === "pending" && !offer.is_current_user_proposer && <button type="button" disabled={busy} onClick={() => void submit("schedule", { action: "accept", offerId: offer.id, idempotencyKey: crypto.randomUUID() })} style={button}>ACCEPT</button>}{offer.status === "pending" && !offer.is_current_user_proposer && <button type="button" disabled={busy || !localPreview} onClick={() => { if (localPreview) void submit("schedule", { action: "counter", offerId: offer.id, startsAt: localPreview.startsAt, timeZone: zone, idempotencyKey: crypto.randomUUID() }) }} style={button}>COUNTER</button>}<button type="button" disabled={busy || offer.status !== "pending" || !offer.is_current_user_proposer} onClick={() => void submit("schedule", { action: "withdraw", offerId: offer.id, idempotencyKey: crypto.randomUUID() })} style={button}>WITHDRAW</button></div></div>)}</div>}
      <div style={row}><select value={winner} onChange={(event) => setWinner(event.target.value)} style={input}><option value={playerAId || ""}>{playerAName}</option><option value={playerBId || ""}>{playerBName}</option></select><button type="button" disabled={busy || status === "completed"} onClick={() => void submit("confirm", { winnerPlayerId: winner })} style={button}>CONFIRM WINNER</button></div>
      <div style={row}><input value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Forfeit explanation" style={input} /><button type="button" disabled={busy || !explanation.trim()} onClick={() => void submit("forfeit", { explanation })} style={button}>REQUEST FORFEIT</button></div>
      {status === "completed" && <p style={hint}>This match is complete and its result is locked.</p>}
      {message && <p role="status" style={messageStyle}>{message}</p>}
    </div>
  </details>
}

export function ScorecardWorkspace({ tournamentId, matchId }: { tournamentId: string; matchId: string }) {
  const [scores, setScores] = useState(Array.from({ length: 18 }, () => ""))
  const [image, setImage] = useState<File | null>(null)
  const [message, setMessage] = useState("")
  const [scale, setScale] = useState(1)
  async function submit() { if (!image || scores.some((score) => !score)) { setMessage("Add the original scorecard image and all 18 scores."); return } const body = new FormData(); body.set("evidence", image); body.set("matchId", matchId); body.set("scores", scores.join(",")); body.set("pars", Array(18).fill(4).join(",")); body.set("idempotencyKey", crypto.randomUUID()); const result = await fetch(`/api/tournaments/${tournamentId}/matches/scorecards`, { method: "POST", body }); const json = await result.json().catch(() => ({})) as { error?: string; calculation?: { total?: number; points?: number } }; setMessage(json.error || `Scorecard saved · gross ${json.calculation?.total} · points ${json.calculation?.points}`) }
  return <div style={{ marginTop: 10, display: "grid", gap: 8 }}><label style={label}>Original scorecard image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} style={input} /></label>{image && <div style={{ overflow: "auto", background: "#070b12", borderRadius: 8, minHeight: 120 }}><img src={URL.createObjectURL(image)} alt="Scorecard evidence preview" style={{ transform: `scale(${scale})`, transformOrigin: "top left", maxWidth: "100%", cursor: "grab" }} /></div>}<div style={row}><button type="button" onClick={() => setScale((value) => Math.min(2, value + .1))} style={button}>ZOOM +</button><button type="button" onClick={() => setScale((value) => Math.max(.7, value - .1))} style={button}>ZOOM −</button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(9,minmax(44px,1fr))", gap: 5, overflowX: "auto" }}>{scores.map((score, index) => <label key={index} style={{ color: "#94a3b8", fontSize: 11 }}>H{index + 1}<input aria-label={`Hole ${index + 1}`} inputMode="numeric" value={score} onChange={(event) => setScores((values) => values.map((value, position) => position === index ? event.target.value : value))} style={input} /></label>)}</div><button type="button" onClick={() => void submit()} style={button}>SUBMIT SCORECARD</button>{message && <p role="status" style={messageStyle}>{message}</p>}</div>
}

const label: React.CSSProperties = { color: "#cbd5e1", fontSize: 12, display: "grid", gap: 4 }
const input: React.CSSProperties = { minWidth: 0, padding: "7px 8px", borderRadius: 7, border: "1px solid #475569", background: "#070b12", color: "white" }
const button: React.CSSProperties = { border: 0, borderRadius: 999, padding: "8px 11px", background: "#f0abfc", color: "#24102c", fontWeight: 900, fontSize: 11 }
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }
const hint: React.CSSProperties = { color: "#94a3b8", fontSize: 12, margin: 0 }
const messageStyle: React.CSSProperties = { color: "#fde68a", margin: 0, whiteSpace: "pre-wrap", fontSize: 12 }
const offerCard: React.CSSProperties = { display: "grid", gap: 4, padding: 8, border: "1px solid #334155", borderRadius: 8, background: "#0b111c" }
