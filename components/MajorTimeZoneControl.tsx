"use client"

import { useMemo, useState } from "react"

type Props = {
  timeZone: string
  saving: boolean
  message: string
  saveTimeZone: (timeZone: string) => Promise<boolean>
  compact?: boolean
}

type TimeZoneOption = { value: string; label: string }

const COMMON_ZONE_LABELS: Record<string, string> = {
  "America/New_York": "New York, United States (Eastern Time)",
  "America/Chicago": "Chicago, United States (Central Time)",
  "America/Denver": "Denver, United States (Mountain Time)",
  "America/Los_Angeles": "Los Angeles, United States (Pacific Time)",
  "Europe/London": "London, United Kingdom",
  "Europe/Madrid": "Madrid, Spain (Central European Time)",
  "Australia/Sydney": "Sydney, Australia",
  "Australia/Melbourne": "Melbourne, Australia",
  "Australia/Perth": "Perth, Australia",
  "Australia/Brisbane": "Brisbane, Australia",
  "Australia/Adelaide": "Adelaide, Australia",
  "Pacific/Auckland": "Auckland, New Zealand",
  UTC: "UTC",
}

const AREA_LABELS: Record<string, string> = {
  Africa: "Africa",
  America: "the Americas",
  Antarctica: "Antarctica",
  Arctic: "the Arctic",
  Asia: "Asia",
  Atlantic: "the Atlantic",
  Australia: "Australia",
  Europe: "Europe",
  Indian: "the Indian Ocean",
  Pacific: "the Pacific Islands",
}

function friendlyTimeZoneLabel(value: string) {
  const known = COMMON_ZONE_LABELS[value]
  if (known) return known
  if (value === "GMT" || value === "Etc/UTC") return "UTC"
  const parts = value.split("/")
  const city = parts.at(-1)?.replaceAll("_", " ") || value
  const area = AREA_LABELS[parts[0]] || parts[0]
  return `${city}, ${area}`
}

function supportedTimeZones() {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }).supportedValuesOf
  const values = supportedValuesOf?.("timeZone") || []
  return Array.from(new Set(["UTC", ...values])).sort((left, right) => friendlyTimeZoneLabel(left).localeCompare(friendlyTimeZoneLabel(right)))
}

export default function MajorTimeZoneControl({ timeZone, saving, message, saveTimeZone, compact = false }: Props) {
  const [draft, setDraft] = useState(timeZone)
  const [query, setQuery] = useState(() => friendlyTimeZoneLabel(timeZone))
  const [open, setOpen] = useState(false)
  const options = useMemo<TimeZoneOption[]>(() => supportedTimeZones().map((value) => ({ value, label: friendlyTimeZoneLabel(value) })), [])
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return options.slice(0, 120)
    return options.filter((option) => `${option.label} ${option.value}`.toLocaleLowerCase().includes(normalizedQuery)).slice(0, 120)
  }, [options, query])
  const selectedOption = options.find((option) => option.value === draft) || { value: draft, label: friendlyTimeZoneLabel(draft) }

  function choose(option: TimeZoneOption) {
    setDraft(option.value)
    setQuery(option.label)
    setOpen(false)
  }

  function handleInput(value: string) {
    setQuery(value)
    setOpen(true)
    const exact = options.find((option) => option.value.toLocaleLowerCase() === value.trim().toLocaleLowerCase() || option.label.toLocaleLowerCase() === value.trim().toLocaleLowerCase())
    if (exact) setDraft(exact.value)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery(selectedOption.label)
      setOpen(false)
    } else if (event.key === "Enter" && open && filteredOptions[0]) {
      event.preventDefault()
      choose(filteredOptions[0])
    }
  }

  async function confirm() {
    await saveTimeZone(draft)
  }

  return <section aria-label="Your Local Time Zone" style={{ margin: compact ? "10px 0" : "14px 0", padding: compact ? "10px 12px" : "12px 14px", border: "1px solid rgba(120, 210, 220, .35)", borderRadius: 10, background: "rgba(3, 26, 35, .58)", color: "#e8ffff" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
      <label style={{ position: "relative", display: "grid", gap: 3, fontSize: 12, minWidth: 0, flex: "1 1 230px" }}>
        <strong>Your Local Time Zone</strong>
        <input
          value={open ? query : selectedOption.label}
          onChange={(event) => handleInput(event.target.value)}
          onFocus={() => { setOpen(true); setQuery("") }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-label="Your Local Time Zone"
          aria-expanded={open}
          aria-controls="major-time-zone-options"
          autoComplete="off"
          placeholder="Search city or country"
          style={{ width: "100%", boxSizing: "border-box", minHeight: 34, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(180, 230, 235, .45)", background: "rgba(0, 0, 0, .28)", color: "inherit" }}
        />
        {open && <div id="major-time-zone-options" role="listbox" aria-label="Available time zones" style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, maxHeight: 260, overflowY: "auto", marginTop: 4, width: "min(560px, calc(100vw - 48px))", border: "1px solid rgba(120, 220, 220, .55)", borderRadius: 8, background: "#06232b", boxShadow: "0 12px 28px rgba(0, 0, 0, .5)" }}>
          {filteredOptions.length ? filteredOptions.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === draft} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} style={{ display: "block", width: "100%", padding: "8px 10px", border: 0, borderBottom: "1px solid rgba(180, 230, 235, .12)", background: option.value === draft ? "rgba(40, 150, 155, .32)" : "transparent", color: "inherit", textAlign: "left", cursor: "pointer" }}><strong>{option.label}</strong></button>) : <span style={{ display: "block", padding: 10, color: "rgba(232, 255, 255, .72)" }}>No matching time zones.</span>}
        </div>}
      </label>
      <button type="button" onClick={() => void confirm()} disabled={saving} style={{ minHeight: 34, padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(120, 220, 220, .55)", background: "rgba(20, 115, 125, .7)", color: "#fff", cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Confirm"}</button>
    </div>
    <p style={{ margin: "8px 0 0", fontSize: 12 }}>All playing times will be shown in your selected time zone.</p>
    {message && <p role="status" style={{ margin: "8px 0 0", fontSize: 12 }}>{message}</p>}
  </section>
}
