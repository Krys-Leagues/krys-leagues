"use client"

import { useState } from "react"
import { detectBrowserTimeZone } from "@/lib/majorTimeZone"
import type { MajorTimeZoneSource } from "@/lib/useMajorDisplayTimeZone"

type Props = {
  timeZone: string
  source: MajorTimeZoneSource
  savedTimeZone: string | null
  needsConfirmation: boolean
  saving: boolean
  message: string
  saveTimeZone: (timeZone: string) => Promise<boolean>
  compact?: boolean
}

export default function MajorTimeZoneControl({ timeZone, source, savedTimeZone, needsConfirmation, saving, message, saveTimeZone, compact = false }: Props) {
  const [editing, setEditing] = useState(needsConfirmation)
  const [draft, setDraft] = useState(timeZone)

  async function confirm() {
    if (await saveTimeZone(draft)) setEditing(false)
  }

  return <section aria-label="Local timezone" style={{ margin: compact ? "10px 0" : "14px 0", padding: compact ? "10px 12px" : "12px 14px", border: "1px solid rgba(120, 210, 220, .35)", borderRadius: 10, background: "rgba(3, 26, 35, .58)", color: "#e8ffff" }}>
    <p style={{ margin: 0, fontSize: compact ? 12 : 13 }}><strong>Display times in {timeZone}</strong>{source === "saved" ? " · saved preference" : source === "browser" ? " · browser detected" : " · event fallback"}{!editing && !needsConfirmation && <button type="button" onClick={() => setEditing(true)} style={{ marginLeft: 8, color: "inherit", background: "transparent", border: 0, textDecoration: "underline", cursor: "pointer" }}>Change</button>}</p>
    {(editing || needsConfirmation) && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginTop: 8 }}>
      <label style={{ display: "grid", gap: 3, fontSize: 12, flex: "1 1 230px" }}>IANA timezone identifier<input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={detectBrowserTimeZone() || "America/New_York"} aria-label="IANA timezone identifier" style={{ minHeight: 34, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(180, 230, 235, .45)", background: "rgba(0, 0, 0, .28)", color: "inherit" }} /></label>
      <button type="button" onClick={() => void confirm()} disabled={saving} style={{ minHeight: 34, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(120, 220, 220, .55)", background: "rgba(20, 115, 125, .7)", color: "#fff", cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : savedTimeZone ? "Save timezone" : "Confirm timezone"}</button>
    </div>}
    {needsConfirmation && !savedTimeZone && <p style={{ margin: "8px 0 0", fontSize: 12 }}>Confirm or change this detected timezone before relying on local schedule times. America/New_York is used only when no browser timezone is available.</p>}
    {message && <p role="status" style={{ margin: "8px 0 0", fontSize: 12 }}>{message}</p>}
  </section>
}
