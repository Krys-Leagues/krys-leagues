"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import styles from "./PlayerProfileEditor.module.css"

export type ProfilePreferences = { background_color: string; glow_color: string; text_color: string; about_me: string | null }
type Props = { playerId: string; initial: ProfilePreferences; onSaved: (value: ProfilePreferences) => void }
const DEFAULTS = { background_color: "#07111f", glow_color: "#ff2bd6", text_color: "#f8fafc" }

export default function PlayerProfileEditor({ playerId, initial, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const set = (key: keyof ProfilePreferences, value: string) => setDraft(current => ({ ...current, [key]: value }))

  async function save() {
    setSaving(true); setMessage("")
    const { data, error } = await supabase.rpc("save_player_profile_preferences", { p_player_id: playerId, p_background_color: draft.background_color, p_glow_color: draft.glow_color, p_text_color: draft.text_color, p_about_me: draft.about_me || null })
    setSaving(false)
    if (error) return setMessage(error.message)
    const saved = (Array.isArray(data) ? data[0] : data) as ProfilePreferences
    setDraft(saved); onSaved(saved); setMessage("Profile saved.")
  }

  return <section className={styles.wrap}>
    <button type="button" className={styles.editButton} onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? "Close Editor" : "Edit My Profile"}</button>
    {open && <div className={styles.editor}>
      <div className={styles.heading}><div><h2>Make it yours</h2><p>Choose your profile colors and tell the league a little about yourself.</p></div></div>
      <div className={styles.colors}>
        {([['background_color','Background Color'],['glow_color','Glow Color'],['text_color','Text Color']] as const).map(([key, label]) => <label key={key} className={styles.colorField}><span>{label}</span><input type="color" value={draft[key] || DEFAULTS[key]} onChange={event => set(key, event.target.value)} /><code>{draft[key]}</code></label>)}
      </div>
      <label className={styles.about}><span>About Me</span><textarea value={draft.about_me || ""} maxLength={500} rows={6} onChange={event => set("about_me", event.target.value)} placeholder="What should other golfers know about you?" /><small>{(draft.about_me || "").length}/500</small></label>
      <div className={styles.preview} style={{ background: draft.background_color, color: draft.text_color, boxShadow: `inset 0 0 70px ${draft.glow_color}33` }}><strong>Preview</strong><span>Your profile colors update here before you save.</span></div>
      <div className={styles.actions}>
        <button type="button" className={styles.save} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className={styles.reset} disabled={saving} onClick={() => setDraft(current => ({ ...current, ...DEFAULTS }))}>Reset Colors to Krys Default</button>
      </div>
      {message && <p className={styles.message} role="status">{message}</p>}
    </div>}
  </section>
}
