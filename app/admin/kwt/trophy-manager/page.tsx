"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./page.module.css"

type Placement = { x: number; y: number; width: number; height: number; fontSize: number; color: string; align: "left" | "center" | "right"; fontFamily: "Arial" | "Georgia" | "Verdana" | "Trebuchet MS" }
type Player = { id: string; screen_name: string; division: string | null; status: string | null }
type Template = { id: string; season_number: number; week_number: number; course_code: string; award_category: string; award_scope?: string; template_kind?: string; division: string; placement: number; template_name: string; status: string }
type Batch = { id: string; season_number: number; week_number: number; course_code: string; award_category: string; award_scope?: string; status: string; source_snapshot: { resultsFinal?: boolean } }
type Award = { id: string; batch_id: string; recipient_name_snapshot: string; division: string; placement: number; status: string }

const defaultPlacement: Placement = { x: 50, y: 80, width: 76, height: 18, fontSize: 42, color: "#ffffff", align: "center", fontFamily: "Arial" }
type Gesture = { mode: "move" | "resize"; startX: number; startY: number; initial: Placement }

function ordinal(value: number) {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  return `${value}${value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th"}`
}

function generatedTemplateName(form: { season: string; week: string; course: string; awardCategory: string; awardScope: string; division: string; placementNumber: string }) {
  const course = form.course.toUpperCase() === "RCE/RCH" ? "Raptor Cliffs" : form.course.trim() || "KWT Course"
  const week = form.week.trim().padStart(2, "0")
  const placement = Math.max(1, Number(form.placementNumber) || 1)
  const prefix = `${course} Season ${form.season.trim() || "0"} Week ${week}`
  if (form.awardScope === "overall") return `${prefix} ${form.awardCategory} Overall Winner ${ordinal(placement)}`
  if (form.awardScope === "historical") return `${prefix} Historical ${form.division} ${ordinal(placement)}`
  return `${prefix}${form.awardCategory === "GROSS" ? "" : ` ${form.awardCategory}`} ${form.division} ${ordinal(placement)}`
}

export default function KwtTrophyManagerPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [awards, setAwards] = useState<Award[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [playerSearch, setPlayerSearch] = useState("")
  const [playerResults, setPlayerResults] = useState<Player[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [winnerCandidates, setWinnerCandidates] = useState<Array<Player & { placement: number; source_kind: string; source_reference: string | null }>>([])
  const [studioEdit, setStudioEdit] = useState(false)
  const [placement, setPlacement] = useState<Placement>(defaultPlacement)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [batchForm, setBatchForm] = useState({ season: "15", week: "1", course: "RCE/RCH", awardCategory: "GROSS", awardScope: "division" })
  const [templateForm, setTemplateForm] = useState({ season: "15", week: "1", course: "RCE/RCH", awardCategory: "GROSS", awardScope: "division", templateKind: "individual", division: "ELITE", placementNumber: "1", templateName: "Raptor Cliffs Season 15 Week 01 Elite 1st" })
  const [templateNameEdited, setTemplateNameEdited] = useState(false)
  const generatedName = generatedTemplateName(templateForm)

  function setTemplateField<K extends keyof typeof templateForm>(key: K, value: (typeof templateForm)[K]) {
    setTemplateForm(current => {
      const next = { ...current, [key]: value }
      if (!templateNameEdited && key !== "templateName") next.templateName = generatedTemplateName(next)
      return next
    })
  }

  const sourceUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file])
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl) }, [sourceUrl])

  async function load() {
    const response = await fetch("/api/admin/kwt/trophy-manager", { cache: "no-store" })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Could not load Trophy Manager")
    setTemplates(data.templates || [])
    setBatches(data.batches || [])
    setAwards(data.awards || [])
  }
  useEffect(() => { void Promise.resolve().then(() => load()).catch((error) => setMessage(error instanceof Error ? error.message : "Could not load Trophy Manager")) }, [])

  useEffect(() => {
    const query = playerSearch.trim()
    if (query.length < 2) return
    const controller = new AbortController()
    void fetch(`/api/admin/kwt/trophy-manager?playerSearch=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { players?: Player[]; error?: string }
        if (!response.ok) throw new Error(data.error || "Player search failed")
        setPlayerResults(data.players || [])
      })
      .catch(error => { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage(error instanceof Error ? error.message : "Player search failed") })
    return () => controller.abort()
  }, [playerSearch])

  useEffect(() => {
    const params = new URLSearchParams({ winnerQueue: "1", season: batchForm.season, week: batchForm.week, course: batchForm.course, awardCategory: batchForm.awardCategory })
    void fetch(`/api/admin/kwt/trophy-manager?${params}`, { cache: "no-store" }).then(async response => { const data = await response.json() as { winners?: typeof winnerCandidates }; if (response.ok) setWinnerCandidates(data.winners || []) }).catch(() => undefined)
  }, [batchForm.season, batchForm.week, batchForm.course, batchForm.awardCategory])

  useEffect(() => {
    if (!gesture) return
    const move = (event: PointerEvent) => {
      const bounds = editorRef.current?.getBoundingClientRect()
      if (!bounds) return
      const dx = (event.clientX - gesture.startX) / bounds.width * 100
      const dy = (event.clientY - gesture.startY) / bounds.height * 100
      setPlacement(current => gesture.mode === "move"
        ? { ...current, x: Math.min(100 - current.width / 2, Math.max(current.width / 2, gesture.initial.x + dx)), y: Math.min(100 - current.height / 2, Math.max(gesture.initial.height / 2, gesture.initial.y + dy)) }
        : { ...current, width: Math.min(98, Math.max(8, gesture.initial.width + dx)), height: Math.min(80, Math.max(6, gesture.initial.height + dy)) })
    }
    const stop = () => setGesture(null)
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop, { once: true })
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop) }
  }, [gesture])

  function startGesture(event: React.PointerEvent, mode: Gesture["mode"]) {
    event.preventDefault()
    event.stopPropagation()
    setGesture({ mode, startX: event.clientX, startY: event.clientY, initial: placement })
  }

  function updatePlacement(key: keyof Placement, value: string) {
    const numeric = ["x", "y", "width", "height", "fontSize"].includes(key)
    setPlacement((current) => ({ ...current, [key]: numeric ? Number(value) : value } as Placement))
  }

  async function postJson(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/kwt/trophy-manager", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Trophy Manager action failed")
    return data
  }

  async function renderPreview() {
    if (!file) { setMessage("Choose an original PNG first."); return }
    if (!selectedPlayer) { setMessage("Select a canonical Global Player before rendering a personalized preview."); return }
    setBusy(true); setMessage("")
    try {
      const body = new FormData(); body.set("action", "preview"); body.set("file", file); body.set("playerId", selectedPlayer.id); body.set("placement", JSON.stringify(placement))
      const response = await fetch("/api/admin/kwt/trophy-manager", { method: "POST", body }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Preview failed")
      setPreview(data.preview); setMessage("Preview rendered from the original PNG. The uploaded original remains unchanged.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview failed") } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!file || !selectedPlayer) return
    let active = true
    const timer = window.setTimeout(async () => {
      const body = new FormData(); body.set("action", "preview"); body.set("file", file); body.set("playerId", selectedPlayer.id); body.set("placement", JSON.stringify(placement))
      try { const response = await fetch("/api/admin/kwt/trophy-manager", { method: "POST", body }); const data = await response.json() as { preview?: string }; if (active && response.ok && data.preview) { setPreview(data.preview); setMessage(`Finished trophy preview ready for ${selectedPlayer.screen_name}.`) } } catch { /* Edit still exposes a manual retry */ }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [file, selectedPlayer, placement.x, placement.y, placement.width, placement.height, placement.fontSize, placement.color, placement.align, placement.fontFamily])

  async function saveTemplate() {
    if (!file) { setMessage("Choose an original PNG first."); return }
    if (templateForm.templateKind === "historical_personalized" && !selectedPlayer) { setMessage("Select the canonical Global Player attached to this historical trophy."); return }
    setBusy(true); setMessage("")
    try {
      const body = new FormData(); body.set("action", templateForm.templateKind === "historical_personalized" ? "attach_historical" : "upload_template"); body.set("file", file); body.set("placement", JSON.stringify(placement)); if (selectedPlayer) body.set("playerId", selectedPlayer.id)
      Object.entries(templateForm).forEach(([key, value]) => body.set(key, value))
      const response = await fetch("/api/admin/kwt/trophy-manager", { method: "POST", body }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Template upload failed")
      setMessage(`Saved ${data.template.template_name}. ${selectedPlayer ? `${selectedPlayer.screen_name} remains selected; use Prepare candidate below when ready.` : "No recipient was selected, so no candidate was created."}`); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Template upload failed") } finally { setBusy(false) }
  }

  async function prepareCandidate(templateId: string) {
    if (!selectedPlayer) { setMessage("Select a canonical Global Player above before preparing a candidate."); return }
    setBusy(true); setMessage("")
    try {
      const data = await postJson({ action: "prepare_candidate", templateId, playerId: selectedPlayer.id })
      setMessage(`${data.created ? "Candidate prepared" : "Candidate already exists"} for ${selectedPlayer.screen_name}. No award was approved or published. Use Generate PNGs, then Approve, then Publish to profile.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Candidate preparation failed") } finally { setBusy(false) }
  }

  async function createBatch() {
    setBusy(true)
    try { const data = await postJson({ action: "create_batch", season: Number(batchForm.season), week: Number(batchForm.week), course: batchForm.course, awardCategory: batchForm.awardCategory, awardScope: batchForm.awardScope }); setMessage(`Batch ready: ${data.batch.id}`); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : "Batch creation failed") } finally { setBusy(false) }
  }

  async function batchAction(action: string, id: string) {
    setBusy(true)
    try { const data = await postJson({ action, batchId: id, reason: action === "mark_final" ? "Admin reviewed the verified source standings." : undefined }); setMessage(action === "resolve_recipients" ? `Recipients prepared: ${data.createdCount}.` : action === "render_batch" ? `Personalized PNGs generated: ${data.renderedCount}.` : "Batch updated."); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : "Batch action failed") } finally { setBusy(false) }
  }

  async function awardAction(action: string, id: string) {
    setBusy(true)
    try { await postJson({ action, awardId: id }); setMessage(action === "approve_award" ? "Award approved for publication." : "Award published to the player profile."); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : "Award action failed") } finally { setBusy(false) }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>KWT ADMIN</p><h1>KWT Trophy Manager</h1><p>Upload each original design once, configure its nameplate, and prepare secure personalized copies for review.</p></div>
      <Link href="/admin/kwt">Back to KWT Admin</Link>
    </header>
    {message && <p className={styles.message} role="status">{message}</p>}

    <section className={styles.panel}>
      <p className={styles.eyebrow}>TROPHY STUDIO</p>
      <h2>Load trophy → load winner → auto-fit name → approve → publish</h2>
      <p className={styles.note}>Verified winner candidates are loaded from official results. The finished preview is generated from a copy; the original PNG remains unchanged. Approval and publication are always separate actions.</p>
      <div className={styles.actions}><button disabled={busy} aria-expanded={studioEdit} onClick={() => setStudioEdit(!studioEdit)}>Edit artwork / nameplate</button><a href="#award-review">Open approval queue ↓</a></div>
      {winnerCandidates.length > 0 && <div className={styles.playerResults} aria-label="Verified winner queue">{winnerCandidates.slice(0, 18).map((winner) => <button type="button" key={`${winner.id}-${winner.division}-${winner.placement}`} onClick={() => { setSelectedPlayer(winner); setPlayerSearch(winner.screen_name) }}>{winner.screen_name} · {winner.division} {winner.placement}</button>)}</div>}
      {selectedPlayer && <p className={styles.selectedPlayer}>Loaded winner: <strong>{selectedPlayer.screen_name}</strong>. {preview ? "Finished personalized PNG is visible below." : "Choose an original PNG to render it automatically."}</p>}
    </section>

    <section className={styles.panel}>
      <h2>1. Prepare an award batch</h2>
      <div className={styles.formGrid}>
        <label>Season<input value={batchForm.season} onChange={(event) => setBatchForm({ ...batchForm, season: event.target.value })} /></label>
        <label>Week<input value={batchForm.week} onChange={(event) => setBatchForm({ ...batchForm, week: event.target.value })} /></label>
        <label>Course / course pair<input value={batchForm.course} onChange={(event) => setBatchForm({ ...batchForm, course: event.target.value })} /></label>
        <label>Award category<select value={batchForm.awardCategory} onChange={(event) => setBatchForm({ ...batchForm, awardCategory: event.target.value })}><option>GROSS</option><option>NET</option><option>OTHER</option></select></label>
        <label>Award scope<select value={batchForm.awardScope} onChange={(event) => setBatchForm({ ...batchForm, awardScope: event.target.value })}><option value="division">Division placement</option><option value="overall">Overall Winner</option><option value="historical">Historical evidence</option></select></label>
      </div>
      <button disabled={busy} onClick={createBatch}>Create / load review batch</button>
      <p className={styles.note}>A batch organizes templates and review. It does not finalize results or award anyone. Preparing a selected-player candidate below creates or loads the matching batch automatically.</p>
    </section>

    <section className={styles.panel}>
      <h2>2. Upload original PNG and configure nameplate</h2>
      <div className={styles.playerPicker}>
        <label>Canonical Global Player for preview / historical attachment<input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Search exact screen name" autoComplete="off" /></label>
        {selectedPlayer && <p className={styles.selectedPlayer}>Selected: <strong>{selectedPlayer.screen_name}</strong>{selectedPlayer.division ? ` · ${selectedPlayer.division}` : ""} <button type="button" onClick={() => setSelectedPlayer(null)}>Clear</button></p>}
        {playerSearch.trim().length >= 2 && playerResults.length > 0 && <div className={styles.playerResults} role="listbox" aria-label="Global Player results">{playerResults.map(player => <button type="button" key={player.id} onClick={() => { setSelectedPlayer(player); setPlayerSearch(player.screen_name); setPlayerResults([]) }}>{player.screen_name}{player.division ? ` · ${player.division}` : ""}</button>)}</div>}
        <p className={styles.note}>Names are always resolved from canonical Global Players. Manual name typing is not used for awards.</p>
      </div>
      <div className={styles.uploadGrid}>
        <div>
          <label className={styles.fileLabel}>Original trophy PNG<input type="file" accept="image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
          {sourceUrl && <img className={styles.sourceImage} src={sourceUrl} alt="Original trophy preview" />}
        </div>
        <div className={styles.editor}>
          <div className={styles.editorCanvas} ref={editorRef}>
            {(preview || sourceUrl) && <img src={preview || sourceUrl || ""} alt="Trophy nameplate editor preview" />}
            <span className={styles.nameplate} onPointerDown={(event) => startGesture(event, "move")} style={{ left: `${placement.x}%`, top: `${placement.y}%`, width: `${placement.width}%`, height: `${placement.height}%`, color: placement.color, fontSize: `${Math.max(10, placement.fontSize / 3)}px`, fontFamily: placement.fontFamily, textAlign: placement.align }}>{selectedPlayer?.screen_name || "Select a Global Player"}<span className={styles.resizeHandle} onPointerDown={(event) => startGesture(event, "resize")} aria-hidden="true" /></span>
          </div>
          <p className={styles.note}>Adjust the nameplate against the real artwork. Long names are fit inside the saved box when rendered.</p>
          <div className={styles.controlGrid}>
            {(["x", "y", "width", "height", "fontSize"] as const).map((key) => <label key={key}>{key}<input type="number" min={key === "fontSize" ? 8 : 1} max={key === "fontSize" ? 512 : 100} value={placement[key]} onChange={(event) => updatePlacement(key, event.target.value)} /></label>)}
            <label>Font<select value={placement.fontFamily} onChange={(event) => updatePlacement("fontFamily", event.target.value)}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option></select></label>
            <label>Color<input type="color" value={placement.color} onChange={(event) => updatePlacement("color", event.target.value)} /></label>
            <label>Align<select value={placement.align} onChange={(event) => updatePlacement("align", event.target.value)}><option>left</option><option>center</option><option>right</option></select></label>
          </div>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label>Season<input value={templateForm.season} onChange={(event) => setTemplateField("season", event.target.value)} /></label>
        <label>Week<input value={templateForm.week} onChange={(event) => setTemplateField("week", event.target.value)} /></label>
        <label>Course / course pair<input value={templateForm.course} onChange={(event) => setTemplateField("course", event.target.value)} /></label>
        <label>Award category<select value={templateForm.awardCategory} onChange={(event) => setTemplateField("awardCategory", event.target.value)}><option>GROSS</option><option>NET</option><option>OTHER</option></select></label>
        <label>Award scope<select value={templateForm.awardScope} onChange={(event) => setTemplateField("awardScope", event.target.value)}><option value="division">Division placement</option><option value="overall">Overall Winner</option><option value="historical">Historical evidence</option></select></label>
        <label>Template kind<select value={templateForm.templateKind} onChange={(event) => setTemplateField("templateKind", event.target.value)}><option value="individual">Reusable blank design</option><option value="historical_personalized">Season 14 already-personalized image</option><option value="commemorative">Commemorative image</option></select></label>
        <label>Division<select value={templateForm.division} onChange={(event) => setTemplateField("division", event.target.value)}><option>OVERALL</option><option>ELITE</option><option>PRO</option><option>SEMI-PRO</option><option>AMATEUR</option><option>PROVISIONAL</option></select></label>
        <label>Placement<input value={templateForm.placementNumber} onChange={(event) => setTemplateField("placementNumber", event.target.value)} /></label>
        <label>Template name<input value={templateForm.templateName} onChange={(event) => { setTemplateNameEdited(true); setTemplateForm({ ...templateForm, templateName: event.target.value }) }} /><button type="button" onClick={() => { setTemplateNameEdited(false); setTemplateForm({ ...templateForm, templateName: generatedName }) }}>Use generated name</button></label>
      </div>
      <div className={styles.actions}><button disabled={busy} onClick={renderPreview}>Render preview</button><button disabled={busy} onClick={saveTemplate}>Save original as template</button></div>
    </section>

    <section className={styles.panel}><h2>3. Review and personalize</h2>{batches.length === 0 ? <p className={styles.note}>No batches yet. Create one above before the final CSV is available.</p> : <div className={styles.list}>{batches.map((item) => <article key={item.id} className={styles.row}><div><strong>Season {item.season_number} · Week {item.week_number} · {item.course_code} · {item.award_category}</strong><span>Status: {item.status} · {item.source_snapshot?.resultsFinal ? "source marked final" : "source not final"}</span></div><div className={styles.actions}><button disabled={busy} onClick={() => batchAction("resolve_recipients", item.id)}>Prepare recipients</button><button disabled={busy} onClick={() => batchAction("render_batch", item.id)}>Generate PNGs</button><button disabled={busy} onClick={() => batchAction("mark_final", item.id)}>Confirm source final</button><a href={`/api/admin/kwt/trophy-manager/download?batchId=${item.id}`}>Download approved ZIP</a></div></article>)}</div>}</section>

    <section className={styles.panel}><h2>Templates and award review</h2><p className={styles.note}>{templates.length} original template(s) · {awards.length} award candidate(s). Awards remain private until explicitly approved and awarded.</p>{templates.length > 0 && <div className={styles.list}>{templates.map((item) => <article className={styles.row} key={item.id}><div><strong>{item.template_name}</strong><span>Season {item.season_number} Week {item.week_number} · {item.award_category} · {item.division} · {item.placement}</span></div><div className={styles.actions}>{selectedPlayer && item.template_kind !== "historical_personalized" ? <button disabled={busy} onClick={() => prepareCandidate(item.id)}>Prepare candidate for {selectedPlayer.screen_name}</button> : <span className={styles.note}>{item.template_kind === "historical_personalized" ? "Historical recipient is attached during import." : "Select a Global Player above to prepare a candidate."}</span>}</div></article>)}</div>}{awards.length > 0 && <div className={styles.list}>{awards.map((item) => <article className={styles.row} key={item.id}><div><strong>{item.recipient_name_snapshot}</strong><span>{item.division} · {item.placement} · {item.status}</span></div><div className={styles.actions}>{item.status === "personalized" && <button disabled={busy} onClick={() => awardAction("approve_award", item.id)}>Approve</button>}{item.status === "approved" && <button disabled={busy} onClick={() => awardAction("award", item.id)}>Publish to profile</button>}{["approved", "awarded"].includes(item.status) && <a href={`/api/admin/kwt/trophy-manager/download?awardId=${item.id}`}>Download PNG</a>}</div></article>)}</div>}</section>

    <section className={styles.warning}><strong>Safety boundaries</strong><p>This manager never imports CSVs, changes KWT scores, recalculates Handicaps, or awards provisional/disputed results. Season 14 records are only used when verified; otherwise the batch waits for evidence or an audited manual recipient review.</p></section>
  </main>
}
