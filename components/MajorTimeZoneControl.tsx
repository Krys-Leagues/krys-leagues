"use client"

import { useState } from "react"

type Props = {
  timeZone: string
  saving: boolean
  message: string
  saveTimeZone: (timeZone: string) => Promise<boolean>
  compact?: boolean
}

const TIME_ZONE_OPTIONS = [
  { value: "America/New_York", label: "New York (Eastern Time)" },
  { value: "America/Chicago", label: "Chicago (Central Time)" },
  { value: "America/Denver", label: "Denver (Mountain Time)" },
  { value: "America/Los_Angeles", label: "Los Angeles (Pacific Time)" },
  { value: "Europe/London", label: "London (United Kingdom)" },
  { value: "Europe/Madrid", label: "Madrid (Central European Time)" },
  { value: "UTC", label: "UTC" },
]

function friendlyTimeZoneLabel(value: string) {
  const known = TIME_ZONE_OPTIONS.find((option) => option.value === value)
  if (known) return known.label
  const city = value.split("/").pop()?.replaceAll("_", " ") || value
  return `${city} (selected time zone)`
}

export default function MajorTimeZoneControl({ timeZone, saving, message, saveTimeZone, compact = false }: Props) {
  const [draft, setDraft] = useState(timeZone)
  const options = TIME_ZONE_OPTIONS.some((option) => option.value === draft)
    ? TIME_ZONE_OPTIONS
    : [{ value: draft, label: friendlyTimeZoneLabel(draft) }, ...TIME_ZONE_OPTIONS]

  async function confirm() {
    await saveTimeZone(draft)
  }

  return <section aria-label="Your Local Time Zone" style={{ margin: compact ? "10px 0" : "14px 0", padding: compact ? "10px 12px" : "12px 14px", border: "1px solid rgba(120, 210, 220, .35)", borderRadius: 10, background: "rgba(3, 26, 35, .58)", color: "#e8ffff" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
      <label style={{ display: "grid", gap: 3, fontSize: 12, flex: "1 1 230px" }}>
        <strong>Your Local Time Zone</strong>
        <select value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Your Local Time Zone" style={{ minHeight: 34, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(180, 230, 235, .45)", background: "rgba(0, 0, 0, .28)", color: "inherit" }}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => void confirm()} disabled={saving} style={{ minHeight: 34, padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(120, 220, 220, .55)", background: "rgba(20, 115, 125, .7)", color: "#fff", cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Confirm"}</button>
    </div>
    <p style={{ margin: "8px 0 0", fontSize: 12 }}>All playing times will be shown in your selected time zone.</p>
    {message && <p role="status" style={{ margin: "8px 0 0", fontSize: 12 }}>{message}</p>}
  </section>
}
