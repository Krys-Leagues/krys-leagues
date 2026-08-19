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
  const [playerSearch, setPlayerSearch] = useState("")
  const [uploadForm, setUploadForm] = useState({ playerId: "", displayName: "", title: "", eventName: "", division: "", placement: "", season: "", month: "" })
  const [editing, setEditing] = useState<Trophy | null>(null)
  const uploadPreview = useMemo(() => uploadFile ? URL.createObjectURL(uploadFile) : null, [uploadFile])

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
  useEffect(() => () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview) }, [uploadPreview])

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
        const matched = { ...candidate, playerId: player?.id || null, playerName: candidate.playerName || player?.screenName || "" }
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
    if (!uploadFile || !player || !uploadForm.title.trim()) {
      setMessage("Choose an image and canonical player, then enter the trophy title.")
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
      const { error: insertError } = await supabase.from("player_trophies").insert({ player_name: uploadForm.displayName.trim() || player.screenName, player_id: player.id, event_type: "Uploaded", event_name: uploadForm.eventName.trim(), league_type: "", division: uploadForm.division.trim(), placement: uploadForm.placement.trim(), season: uploadForm.season.trim(), month: uploadForm.month.trim(), trophy_title: uploadForm.title.trim(), image_url: imageUrl, source_key: sourceKey, notes: "Uploaded through Trophy Importer" })
      if (insertError) {
        await supabase.storage.from(TROPHY_IMAGE_BUCKET).remove([objectPath])
        throw new Error(insertError.message)
      }
      const { data } = await supabase.from("player_trophies").select(trophySelect).order("created_at", { ascending: false })
      setTrophies((data || []) as Trophy[])
      setUploadFile(null)
      setUploadForm({ playerId: "", displayName: "", title: "", eventName: "", division: "", placement: "", season: "", month: "" })
      setMessage("Trophy image uploaded and the canonical player trophy was published.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Trophy upload failed.") }
    finally { setUploading(false) }
  }

  async function saveEdit() {
    if (!editing?.player_id || !editing.trophy_title?.trim()) return setMessage("Canonical player and trophy title are required.")
    const owner = players.find((player) => player.id === editing.player_id)
    if (!owner) return setMessage("Choose a canonical player.")
    const { error } = await supabase.from("player_trophies").update({ player_id: owner.id, player_name: editing.player_name.trim() || owner.screenName, trophy_title: editing.trophy_title.trim(), event_name: editing.event_name?.trim() || "", division: editing.division?.trim() || "", placement: editing.placement?.trim() || "", season: editing.season?.trim() || "", month: editing.month?.trim() || "" }).eq("id", editing.id)
    if (error) return setMessage(error.message)
    setTrophies((current) => current.map((trophy) => trophy.id === editing.id ? editing : trophy)); setEditing(null); setMessage("Trophy record updated.")
  }

  async function deleteTrophy(trophy: Trophy) {
    if (!confirm(`Delete ${trophy.trophy_title || "this trophy"}?`)) return
    const { error } = await supabase.from("player_trophies").delete().eq("id", trophy.id)
    if (error) return setMessage(error.message)
    const marker = "/storage/v1/object/public/trophy-images/"
    const path = trophy.image_url?.includes(marker) ? decodeURIComponent(trophy.image_url.split(marker)[1]) : null
    if (path) await supabase.storage.from(TROPHY_IMAGE_BUCKET).remove([path])
    setTrophies((current) => current.filter((item) => item.id !== trophy.id)); setEditing(null); setMessage("Trophy record deleted.")
  }

  const counts = useMemo(() => ({ ready: candidates.filter((item) => item.status === "ready").length, review: candidates.filter((item) => item.status === "needs-player").length, duplicate: candidates.filter((item) => item.status === "duplicate").length, selected: candidates.filter((item) => item.selected && item.status === "ready").length }), [candidates])
  const visible = filter === "all" ? candidates : candidates.filter((item) => item.status === filter)
  const filteredPlayers = useMemo(() => players.filter((player) => !playerSearch.trim() || [player.screenName, ...player.verifiedAliases].some((name) => name.toLocaleLowerCase().includes(playerSearch.trim().toLocaleLowerCase()))), [players, playerSearch])

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>Krys Leagues · Awards Desk</p><h1>Trophy Importer</h1><p>Scan the artwork library, match winners to canonical player identities, and publish their achievements to every trophy case.</p></div><div className={styles.heroActions}><Link href="/admin">Admin home</Link><Link href="/champions">Hall of Champions</Link></div></header>
    <section className={styles.stats} aria-label="Trophy importer summary"><div><strong>{trophies.length}</strong><span>Published</span></div><div><strong>{counts.ready}</strong><span>Ready</span></div><div><strong>{counts.review}</strong><span>Needs a player</span></div><div><strong>{counts.duplicate}</strong><span>Already imported</span></div></section>
    <section className={styles.toolbar}><div><h2>Artwork library</h2><p>The importer reads Monthly trophy images already shipped in <code>public/league-media/trophies</code>.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={scanLibrary} disabled={scanning || loading}>{scanning ? "Scanning…" : candidates.length ? "Scan again" : "Scan trophy library"}</button><button className={styles.primary} onClick={importSelected} disabled={importing || counts.selected === 0}>{importing ? "Importing…" : `Import selected (${counts.selected})`}</button></div></section>
    <section className={styles.uploadPanel}><div><h2>Upload from computer</h2><p>The selected file is copied to Supabase Storage before its trophy record is saved. Only the player, title, and image are required.</p></div><div className={styles.uploadGrid}><label>Image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} /></label><label>Search Global Players<input value={playerSearch} placeholder="Screen name or verified alias" onChange={(event) => setPlayerSearch(event.target.value)} /></label><label>Canonical player<select value={uploadForm.playerId} onChange={(event) => setUploadForm({ ...uploadForm, playerId: event.target.value })}><option value="">Choose a player…</option>{filteredPlayers.map((player) => <option key={player.id} value={player.id}>{player.screenName}</option>)}</select></label><label>Historical/display name<input value={uploadForm.displayName} placeholder="Defaults to current player name" onChange={(event) => setUploadForm({ ...uploadForm, displayName: event.target.value })} /></label><label>Trophy title<input value={uploadForm.title} onChange={(event) => setUploadForm({ ...uploadForm, title: event.target.value })} /></label><label>Event<input value={uploadForm.eventName} onChange={(event) => setUploadForm({ ...uploadForm, eventName: event.target.value })} /></label><label>Division<input value={uploadForm.division} onChange={(event) => setUploadForm({ ...uploadForm, division: event.target.value })} /></label><label>Placement / award type<input list="trophy-placement-options" value={uploadForm.placement} onChange={(event) => setUploadForm({ ...uploadForm, placement: event.target.value })} /></label><label>Season / year<input value={uploadForm.season} onChange={(event) => setUploadForm({ ...uploadForm, season: event.target.value })} /></label><label>Month / event detail<input value={uploadForm.month} onChange={(event) => setUploadForm({ ...uploadForm, month: event.target.value })} /></label></div><datalist id="trophy-placement-options">{["Champion","Winner","1st Place","2nd Place","3rd Place","Division Winner"].map((value) => <option key={value} value={value} />)}</datalist>{uploadPreview && <div className={styles.uploadPreview}><img src={uploadPreview} alt="Selected trophy preview" /><div><strong>{uploadForm.title || "Trophy preview"}</strong><span>{players.find((player) => player.id === uploadForm.playerId)?.screenName || "Choose a player"}</span><span>{[uploadForm.eventName,uploadForm.division,uploadForm.placement,uploadForm.season,uploadForm.month].filter(Boolean).join(" · ")}</span></div></div>}<button className={styles.primary} onClick={uploadTrophy} disabled={uploading || loading}>{uploading ? "Uploading…" : "Upload and publish trophy"}</button></section>
    {message && <p className={styles.message} role="status">{message}</p>}
    {candidates.length > 0 && <><nav className={styles.filters} aria-label="Filter candidates">{(["all", "ready", "needs-player", "duplicate"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} aria-pressed={filter === item}>{item === "needs-player" ? "Needs player" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav><section className={styles.grid} aria-label="Trophy import candidates">{visible.map((candidate) => <article className={styles.card} key={candidate.key} data-status={candidate.status}><div className={styles.art}><img src={candidate.imageUrl} alt={candidate.trophyTitle} /></div><div className={styles.cardBody}><div className={styles.cardHeading}><span className={styles.badge}>{candidate.status === "needs-player" ? "Review" : candidate.status}</span><label className={styles.checkbox}><input type="checkbox" checked={candidate.selected} disabled={candidate.status !== "ready"} onChange={(event) => setCandidates((current) => current.map((item) => item.key === candidate.key ? { ...item, selected: event.target.checked } : item))} /> Select</label></div><h3>{candidate.trophyTitle}</h3><p>{candidate.eventName} · {candidate.division}</p><label className={styles.playerLabel}>Winner<select value={candidate.playerId || ""} disabled={candidate.status === "duplicate"} onChange={(event) => assignPlayer(candidate.key, event.target.value)}><option value="">Choose a player…</option>{players.map((player) => <option key={player.id} value={player.id}>{player.screenName}</option>)}</select></label>{candidate.playerName && !candidate.playerId && <small>Filename suggests: {candidate.playerName}</small>}</div></article>)}</section></>}
    {!loading && candidates.length === 0 && <section className={styles.empty}><span>🏆</span><h2>Ready for the first scan</h2><p>Nothing is written until you review the matches and choose Import selected.</p></section>}
    <section className={styles.uploadPanel}><div><h2>Published trophies</h2><p>Edit incorrect metadata or delete an incorrect trophy record.</p></div><div className={styles.publishedList}>{trophies.map((trophy) => <article key={trophy.id} className={styles.publishedRow}>{trophy.image_url && <img src={trophy.image_url} alt="" />}{editing?.id === trophy.id ? <div className={styles.editGrid}><label>Canonical player<select value={editing.player_id || ""} onChange={(event) => setEditing({ ...editing, player_id: event.target.value })}>{players.map((player) => <option key={player.id} value={player.id}>{player.screenName}</option>)}</select></label><label>Historical/display name<input value={editing.player_name} onChange={(event) => setEditing({ ...editing, player_name: event.target.value })} /></label><label>Title<input value={editing.trophy_title || ""} onChange={(event) => setEditing({ ...editing, trophy_title: event.target.value })} /></label><label>Event<input value={editing.event_name || ""} onChange={(event) => setEditing({ ...editing, event_name: event.target.value })} /></label><label>Division<input value={editing.division || ""} onChange={(event) => setEditing({ ...editing, division: event.target.value })} /></label><label>Placement<input value={editing.placement || ""} onChange={(event) => setEditing({ ...editing, placement: event.target.value })} /></label><label>Season<input value={editing.season || ""} onChange={(event) => setEditing({ ...editing, season: event.target.value })} /></label><label>Month<input value={editing.month || ""} onChange={(event) => setEditing({ ...editing, month: event.target.value })} /></label><div className={styles.actions}><button className={styles.primary} onClick={saveEdit}>Save changes</button><button className={styles.secondary} onClick={() => setEditing(null)}>Cancel</button></div></div> : <div><strong>{trophy.trophy_title || "Trophy"}</strong><p>{trophy.player_name} · {[trophy.event_name,trophy.division,trophy.placement,trophy.season,trophy.month].filter(Boolean).join(" · ")}</p><div className={styles.actions}><button className={styles.secondary} onClick={() => setEditing({ ...trophy })}>Edit</button><button className={styles.danger} onClick={() => deleteTrophy(trophy)}>Delete</button></div></div>}</article>)}</div></section>
  </div></main>
}
