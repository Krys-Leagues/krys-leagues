"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { PROFILE_BACKGROUND_BUCKET, loadApprovedProfileBackgrounds, profileBackgroundObjectPath, profileBackgroundPublicUrl, validateProfileBackgroundFile, type ApprovedProfileBackground } from "@/lib/profileBackgrounds"

export default function ProfileBackgroundImporterPage() {
  const [backgrounds, setBackgrounds] = useState<ApprovedProfileBackground[]>([])
  const [displayName, setDisplayName] = useState("")
  const [active, setActive] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const preview = useMemo(() => file ? URL.createObjectURL(file) : null, [file])

  useEffect(() => { loadApprovedProfileBackgrounds().then(setBackgrounds).catch((error) => setMessage(error.message)) }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function save() {
    if (!file || !displayName.trim()) return setMessage("Choose an image and enter a display name.")
    setSaving(true); setMessage("")
    let storagePath = ""
    try {
      const validation = await validateProfileBackgroundFile(file)
      if (validation) throw new Error(validation)
      storagePath = profileBackgroundObjectPath(file)
      const { error: uploadError } = await supabase.storage.from(PROFILE_BACKGROUND_BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false })
      if (uploadError) throw new Error(uploadError.message)
      const { error: recordError } = await supabase.rpc("admin_create_player_profile_background", { p_display_name: displayName.trim(), p_storage_path: storagePath, p_active: active })
      if (recordError) {
        await supabase.storage.from(PROFILE_BACKGROUND_BUCKET).remove([storagePath])
        throw new Error(recordError.message)
      }
      setBackgrounds(await loadApprovedProfileBackgrounds())
      setDisplayName(""); setFile(null); setActive(true)
      setMessage("Approved Player Profile background saved.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "Background upload failed.") }
    finally { setSaving(false) }
  }

  return <main style={page}><div style={shell}>
    <nav style={nav}><Link href="/admin/import" style={link}>← Import Hub</Link></nav>
    <h1>Profile Background Importer</h1><p style={muted}>Upload Krys-approved artwork for the existing Edit My Profile selector.</p>
    <section style={panel}><div style={form}>
      <label style={field}>Display name<input style={input} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label style={field}>Background image<input style={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      <label style={check}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active and available to players</label>
      {preview && <div style={{ ...previewBox, backgroundImage: `url("${preview}")` }} role="img" aria-label="Selected background preview" />}
      <button style={button} disabled={saving} onClick={save}>{saving ? "Uploading…" : "Upload approved background"}</button>
      {message && <p role="status" style={messageStyle}>{message}</p>}
    </div></section>
    <section style={panel}><h2>Available backgrounds</h2><div style={grid}><article style={tile}><div style={{ ...thumb, backgroundImage: 'url("/player-profile-background.png")' }} /><strong>Krys Scenic Golf Course</strong><small style={muted}>Built-in default</small></article>{backgrounds.map((background) => <article key={background.id} style={tile}><div style={{ ...thumb, backgroundImage: `url("${profileBackgroundPublicUrl(background.storage_path)}")` }} /><strong>{background.display_name}</strong></article>)}</div></section>
  </div></main>
}

const page: React.CSSProperties = { minHeight: "100vh", padding: 28, background: "#05070b", color: "white" }
const shell: React.CSSProperties = { width: "min(1100px,100%)", margin: "0 auto" }
const nav: React.CSSProperties = { marginBottom: 20 }, link: React.CSSProperties = { color: "#bae6fd" }
const panel: React.CSSProperties = { marginTop: 20, padding: 22, border: "1px solid #334155", borderRadius: 16, background: "#0f172a" }
const form: React.CSSProperties = { display: "grid", gap: 14, maxWidth: 720 }, field: React.CSSProperties = { display: "grid", gap: 7, fontWeight: 750 }
const input: React.CSSProperties = { padding: 11, border: "1px solid #64748b", borderRadius: 9, background: "#020617", color: "white" }
const check: React.CSSProperties = { display: "flex", gap: 9, alignItems: "center" }, button: React.CSSProperties = { width: "fit-content", padding: "11px 16px", border: 0, borderRadius: 9, background: "#0e7490", color: "white", fontWeight: 800, cursor: "pointer" }
const previewBox: React.CSSProperties = { aspectRatio: "16/7", border: "1px solid #475569", borderRadius: 12, backgroundPosition: "center", backgroundSize: "cover" }
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }, tile: React.CSSProperties = { display: "grid", gap: 7, padding: 12, border: "1px solid #334155", borderRadius: 12, background: "#020617" }
const thumb: React.CSSProperties = { aspectRatio: "16/9", borderRadius: 8, backgroundPosition: "center", backgroundSize: "cover" }, muted: React.CSSProperties = { color: "#94a3b8" }, messageStyle: React.CSSProperties = { color: "#bae6fd" }
