"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadGlobalPlayerDirectory, type GlobalPlayerDirectoryEntry } from "@/lib/identity/globalPlayerDirectory"
import { normalizeTrophyPlayerName, trophySemanticKey, type TrophyImportCandidate } from "@/lib/trophies/trophyImport"
import { TROPHY_IMAGE_BUCKET, trophyImageObjectPath, trophyImagePublicUrl, trophyImageSha256, validateTrophyImageFile } from "@/lib/trophies/trophyImages"
import styles from "./trophies.module.css"

type Trophy = { id: string; player_name: string; player_id: string | null; trophy_title: string | null; placement: string | null; event_name: string | null; division: string | null; season: string | null; month: string | null; image_url: string | null; source_key: string | null }
type ReviewCandidate = TrophyImportCandidate & { selected: boolean }

export default function TrophyAdminPage() {
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [players, setPlayers] = useState<GlobalPlayerDirectoryEntry[]>([])
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [importing, setImporting] = useState(false)
  const [filter, setFilter] = useState<"all" | "ready" | "needs-player" | "duplicate">("all")
  const [message, setMessage] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadForm, setUploadForm] = useState({ playerId: "", title: "", eventName: "", division: "", placement: "", season: "", month: "" })

  const trophySelect = "id, player_name, player_id, trophy_title, placement, event_name, division, season, month, image_url, source_key"

  useEffect(() => {
    Promise.all([
      supabase.from("player_trophies").select(trophySelect).order("created_at", { ascending: false }),
      loadGlobalPlayerDirectory(),
    ]).then(([trophyResult, directory]) => {
      if (trophyResult.error) throw trophyResult.error
      setTrophies((trophyResult.data || []) as Trophy[])
      setPlayers(directory)
    }).catch((error) => setMessage(error instanceof Error ? error.message : "Could not load trophy data."))
      .finally(() => setLoading(false))
  }, [])

  async function scanLibrary() {
    setScanning(true); setMessage("")
    try {
      const response = await fetch("/api/trophies/assets")
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Could not scan trophy assets.")
      const existingUrls = new Set(trophies.map((trophy) => trophy.image_url).filter(Boolean))
      const existingSources = new Set(trophies.map((trophy) => trophy.source_key).filter(Boolean))
      const existingSemantics = new Set(trophies.map((trophy) => trophySemanticKey({ playerId: trophy.player_id, playerName: trophy.player_name, eventName: trophy.event_name || "", division: trophy.division || "", placement: trophy.placement || "", season: trophy.season || "", month: trophy.month || "" })))
      const identityMap = new Map<string, GlobalPlayerDirectoryEntry>()
      for (const player of players) {
        identityMap.set(normalizeTrophyPlayerName(player.screenName), player)
        for (const alias of player.verifiedAliases) identityMap.set(normalizeTrophyPlayerName(alias), player)
      }
      setCandidates((payload.candidates as TrophyImportCandidate[]).map((candidate) => {
        const player = identityMap.get(normalizeTrophyPlayerName(candidate.playerName))
        const matched = { ...candidate, playerId: player?.id || null, playerName: player?.screenName || candidate.playerName }
        const duplicate = existingSources.has(candidate.sourceKey) || existingUrls.has(candidate.imageUrl) || existingSemantics.has(trophySemanticKey(matched))
        const status = duplicate ? "duplicate" : player ? "ready" : "needs-player"
        return { ...matched, status, selected: status === "ready" }
      }))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not scan trophy assets.") }
    finally { setScanning(false) }
  }

  function assignPlayer(key: string, playerId: string) {
    const player = players.find((item) => item.id === playerId)
    setCandidates((current) => current.map((candidate) => candidate.key === key ? { ...candidate, playerId: player?.id || null, playerName: player?.screenName || "", status: player ? "ready" : "needs-player", selected: Boolean(player) } : candidate))
  }

  async function importSelected() {
    const selected = candidates.filter((candidate) => candidate.selected && candidate.status === "ready" && candidate.playerId)
    if (selected.length === 0) return
    setImporting(true); setMessage("")
    const rows = selected.map((candidate) => ({ player_name: candidate.playerName, player_id: candidate.playerId, event_type: candidate.eventType, event_name: candidate.eventName, league_type: candidate.leagueType, division: candidate.division, placement: candidate.placement, season: candidate.season, month: candidate.month, trophy_title: candidate.trophyTitle, image_url: candidate.imageUrl, source_key: candidate.sourceKey, notes: "Imported from trophy asset library" }))
    const { error } = await supabase.from("player_trophies").insert(rows)
    if (error) setMessage(error.message)
    else {
      setMessage(`${rows.length} ${rows.length === 1 ? "trophy" : "trophies"} imported and connected to player profiles.`)
      setCandidates((current) => current.map((candidate) => selected.some((item) => item.key === candidate.key) ? { ...candidate, status: "duplicate", selected: false } : candidate))
      const { data } = await supabase.from("player_trophies").select(trophySelect).order("created_at", { ascending: false })
      setTrophies((data || []) as Trophy[])
    }
    setImporting(false)
  }

  async function uploadTrophy() {
    const player = players.find((item) => item.id === uploadForm.playerId)
    if (!uploadFile || !player || !uploadForm.title.trim() || !uploadForm.eventName.trim()) {
      setMessage("Choose an image and canonical player, then enter the trophy title and event.")
      return
    }
    setUploading(true); setMessage("")
    let objectPath = ""
    try {
      const validation = await validateTrophyImageFile(uploadFile)
      if (validation) throw new Error(validation)
      const digest = await trophyImageSha256(uploadFile)
      const sourceKey = `upload:sha256:${digest}`
      const semanticKey = trophySemanticKey({ playerId: player.id, playerName: player.screenName, eventName: uploadForm.eventName, division: uploadForm.division, placement: uploadForm.placement, season: uploadForm.season, month: uploadForm.month })
      const duplicate = trophies.some((trophy) => trophy.source_key === sourceKey || trophySemanticKey({ playerId: trophy.player_id, playerName: trophy.player_name, eventName: trophy.event_name || "", division: trophy.division || "", placement: trophy.placement || "", season: trophy.season || "", month: trophy.month || "" }) === semanticKey)
      if (duplicate) throw new Error("This image or trophy achievement is already recorded.")
      objectPath = trophyImageObjectPath(player.id, uploadFile, digest)
      const { error: uploadError } = await supabase.storage.from(TROPHY_IMAGE_BUCKET).upload(objectPath, uploadFile, { contentType: uploadFile.type, upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      const imageUrl = trophyImagePublicUrl(objectPath)
      const { error: insertError } = await supabase.from("player_trophies").insert({ player_name: player.screenName, player_id: player.id, event_type: "Uploaded", event_name: uploadForm.eventName.trim(), league_type: "", division: uploadForm.division.trim(), placement: uploadForm.placement.trim(), season: uploadForm.season.trim(), month: uploadForm.month.trim(), trophy_title: uploadForm.title.trim(), image_url: imageUrl, source_key: sourceKey, notes: "Uploaded through Trophy Importer" })
      if (insertError) {
        await supabase.storage.from(TROPHY_IMAGE_BUCKET).remove([objectPath])
        throw new Error(insertError.message)
      }
      const { data } = await supabase.from("player_trophies").select(trophySelect).order("created_at", { ascending: false })
      setTrophies((data || []) as Trophy[])
      setUploadFile(null)
      setUploadForm({ playerId: "", title: "", eventName: "", division: "", placement: "", season: "", month: "" })
      setMessage("Trophy image uploaded and the canonical player trophy was published.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Trophy upload failed.") }
    finally { setUploading(false) }
  }

  const counts = useMemo(() => ({ ready: candidates.filter((item) => item.status === "ready").length, review: candidates.filter((item) => item.status === "needs-player").length, duplicate: candidates.filter((item) => item.status === "duplicate").length, selected: candidates.filter((item) => item.selected && item.status === "ready").length }), [candidates])
  const visible = filter === "all" ? candidates : candidates.filter((item) => item.status === filter)

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>Krys Leagues · Awards Desk</p><h1>Trophy Importer</h1><p>Scan the artwork library, match winners to canonical player identities, and publish their achievements to every trophy case.</p></div><div className={styles.heroActions}><Link href="/admin">Admin home</Link><Link href="/champions">Hall of Champions</Link></div></header>
    <section className={styles.stats} aria-label="Trophy importer summary"><div><strong>{trophies.length}</strong><span>Published</span></div><div><strong>{counts.ready}</strong><span>Ready</span></div><div><strong>{counts.review}</strong><span>Needs a player</span></div><div><strong>{counts.duplicate}</strong><span>Already imported</span></div></section>
    <section className={styles.toolbar}><div><h2>Artwork library</h2><p>The importer reads Monthly trophy images already shipped in <code>public/league-media/trophies</code>.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={scanLibrary} disabled={scanning || loading}>{scanning ? "Scanning…" : candidates.length ? "Scan again" : "Scan trophy library"}</button><button className={styles.primary} onClick={importSelected} disabled={importing || counts.selected === 0}>{importing ? "Importing…" : `Import selected (${counts.selected})`}</button></div></section>
    <section className={styles.uploadPanel}><div><h2>Upload from computer</h2><p>The selected file is copied to Supabase Storage before its trophy record is saved.</p></div><div className={styles.uploadGrid}><label>Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} /></label><label>Canonical player<select value={uploadForm.playerId} onChange={(event) => setUploadForm({ ...uploadForm, playerId: event.target.value })}><option value="">Choose a player…</option>{players.map((player) => <option key={player.id} value={player.id}>{player.screenName}</option>)}</select></label><label>Trophy title<input value={uploadForm.title} onChange={(event) => setUploadForm({ ...uploadForm, title: event.target.value })} /></label><label>Event<input value={uploadForm.eventName} onChange={(event) => setUploadForm({ ...uploadForm, eventName: event.target.value })} /></label><label>Division<input value={uploadForm.division} onChange={(event) => setUploadForm({ ...uploadForm, division: event.target.value })} /></label><label>Placement<input value={uploadForm.placement} onChange={(event) => setUploadForm({ ...uploadForm, placement: event.target.value })} /></label><label>Season<input value={uploadForm.season} onChange={(event) => setUploadForm({ ...uploadForm, season: event.target.value })} /></label><label>Month<input value={uploadForm.month} onChange={(event) => setUploadForm({ ...uploadForm, month: event.target.value })} /></label></div><button className={styles.primary} onClick={uploadTrophy} disabled={uploading || loading}>{uploading ? "Uploading…" : "Upload and publish trophy"}</button></section>
    {message && <p className={styles.message} role="status">{message}</p>}
    {candidates.length > 0 && <><nav className={styles.filters} aria-label="Filter candidates">{(["all", "ready", "needs-player", "duplicate"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item === "needs-player" ? "Needs player" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav><section className={styles.grid} aria-label="Trophy import candidates">{visible.map((candidate) => <article className={styles.card} key={candidate.key} data-status={candidate.status}><div className={styles.art}><img src={candidate.imageUrl} alt={candidate.trophyTitle} /></div><div className={styles.cardBody}><div className={styles.cardHeading}><span className={styles.badge}>{candidate.status === "needs-player" ? "Review" : candidate.status}</span><label className={styles.checkbox}><input type="checkbox" checked={candidate.selected} disabled={candidate.status !== "ready"} onChange={(event) => setCandidates((current) => current.map((item) => item.key === candidate.key ? { ...item, selected: event.target.checked } : item))} /> Select</label></div><h3>{candidate.trophyTitle}</h3><p>{candidate.eventName} · {candidate.division}</p><label className={styles.playerLabel}>Winner<select value={candidate.playerId || ""} disabled={candidate.status === "duplicate"} onChange={(event) => assignPlayer(candidate.key, event.target.value)}><option value="">Choose a player…</option>{players.map((player) => <option key={player.id} value={player.id}>{player.screenName}</option>)}</select></label>{candidate.playerName && !candidate.playerId && <small>Filename suggests: {candidate.playerName}</small>}</div></article>)}</section></>}
    {!loading && candidates.length === 0 && <section className={styles.empty}><span>🏆</span><h2>Ready for the first scan</h2><p>Nothing is written until you review the matches and choose Import selected.</p></section>}
  </div></main>
}
