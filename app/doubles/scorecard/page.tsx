"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"

export default function DoublesScorecardPage() {
  const searchParams = useSearchParams()
  const fixtureId = searchParams.get("fixture_id") || ""
  const [componentKey, setComponentKey] = useState<"course1" | "course2">("course1")
  const [file, setFile] = useState<File | null>(null)
  const [evidenceId, setEvidenceId] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function reserve() {
    if (!fixtureId || !file) return setMessage("Choose a scorecard image first.")
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch("/api/doubles/scorecard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reserve", fixture_id: fixtureId, component_key: componentKey, original_filename: file.name, content_type: file.type || "image/*" }) })
      const data = await response.json() as { component?: { id?: string }; error?: string }
      if (!response.ok || !data.component?.id) throw new Error(data.error || "Could not reserve private evidence")
      setEvidenceId(data.component.id)
      const form = new FormData()
      form.set("fixture_id", fixtureId)
      form.set("component_key", componentKey)
      form.set("evidence_id", data.component.id)
      form.set("file", file)
      const upload = await fetch("/api/doubles/scorecard", { method: "POST", body: form })
      const uploaded = await upload.json() as { error?: string }
      if (!upload.ok) throw new Error(uploaded.error || "Could not upload private evidence")
      setMessage(`${componentKey === "course1" ? "Course 1" : "Course 2"} scorecard received for private admin review.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scorecard upload failed")
    } finally {
      setBusy(false)
    }
  }

  return <main style={{ maxWidth: 680, margin: "40px auto", padding: 24 }}>
    <h1>Submit Doubles Scorecard</h1>
    <p>Submit one private photo for a course component. The date and time must be visible on the card.</p>
    <label>Course component<select value={componentKey} onChange={(event) => setComponentKey(event.target.value as "course1" | "course2")} disabled={busy || Boolean(evidenceId)}><option value="course1">Course 1</option><option value="course2">Course 2</option></select></label>
    <label>Scorecard photo<input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] || null)} disabled={busy || Boolean(evidenceId)} /></label>
    <button type="button" onClick={reserve} disabled={busy || !file || !fixtureId || Boolean(evidenceId)}>{busy ? "Uploading…" : "Submit Scorecard"}</button>
    {message && <p role="status">{message}</p>}
  </main>
}
