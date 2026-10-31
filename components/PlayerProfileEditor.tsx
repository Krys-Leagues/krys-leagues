"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { loadApprovedProfileBackgrounds, profileBackgroundPublicUrl, type ApprovedProfileBackground } from "@/lib/profileBackgrounds"
import { DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, getPlayerProfileBackground } from "@/lib/playerProfileBackgrounds"
import { DEFAULT_PROFILE_PRESENTATION, normalizeProfilePresentation, type ProfileGlassStyle, type ProfilePresentationPreferences } from "@/lib/playerProfilePresentation"
import styles from "./PlayerProfileEditor.module.css"

export type PlayerNameEffect = "auto" | "white" | "booster" | "server-tag" | "both" | "holographic"
export type ProfilePreferences = { background_key: string; background_id: string | null; background_path: string | null; background_display_name: string | null; name_effect: PlayerNameEffect; background_color: string; glow_color: string; text_color: string; about_me: string | null } & ProfilePresentationPreferences
type Props = { playerId: string; initial: ProfilePreferences; isServerBooster: boolean; hasKrysServerTag: boolean; profileBadges: string[]; onSaved: (value: ProfilePreferences) => void }
const DEFAULTS = { background_key: DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, background_id: null, background_path: null, background_display_name: null, name_effect: "auto" as PlayerNameEffect, background_color: "#07111f", glow_color: "#ff2bd6", text_color: "#f8fafc", ...DEFAULT_PROFILE_PRESENTATION }

export default function PlayerProfileEditor({ playerId, initial, isServerBooster, hasKrysServerTag, profileBadges, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [backgrounds, setBackgrounds] = useState<ApprovedProfileBackground[]>([])
  const [backgroundsLoaded, setBackgroundsLoaded] = useState(false)
  const [backgroundsLoading, setBackgroundsLoading] = useState(false)
  const isStaff = profileBadges.some(badge => ["Owner", "Co-Head Admin", "Tournament Admin", "Admin"].includes(badge))
  const set = <Key extends keyof ProfilePreferences>(key: Key, value: ProfilePreferences[Key]) => setDraft(current => ({ ...current, [key]: value }))

  async function save() {
    setSaving(true); setMessage("")
    const { error } = await supabase.rpc("save_player_profile_preferences_v5", { p_player_id: playerId, p_background_key: draft.background_key, p_background_id: draft.background_id, p_name_effect: draft.name_effect, p_background_color: draft.background_color, p_glow_color: draft.glow_color, p_text_color: draft.text_color, p_about_me: draft.about_me || null, p_show_featured_trophy: draft.show_featured_trophy, p_show_career_highlights: draft.show_career_highlights, p_show_recognition_box: draft.show_recognition_box, p_show_avatar_glow: draft.show_avatar_glow, p_avatar_glow_color: draft.avatar_glow_color, p_avatar_glow_strength: draft.avatar_glow_strength, p_glass_style: draft.glass_style, p_blue_panel_glow: draft.blue_panel_glow })
    setSaving(false)
    if (error) return setMessage(error.message)
    const { data, error: readError } = await supabase.rpc("get_public_player_profile_preferences_v5", { p_player_id: playerId })
    if (readError) return setMessage(readError.message)
    const value = Array.isArray(data) ? data[0] : data
    const saved = { ...draft, ...value, ...normalizeProfilePresentation(value as Partial<ProfilePresentationPreferences>) } as ProfilePreferences
    setDraft(saved); onSaved(saved); setMessage("Profile saved.")
  }

  async function toggleEditor() {
    const willOpen = !open
    setOpen(willOpen)
    if (!willOpen || backgroundsLoaded || backgroundsLoading) return
    setBackgroundsLoading(true)
    setMessage("")
    try {
      const loaded = await loadApprovedProfileBackgrounds()
      setBackgrounds(loaded.filter(background => background.display_name.trim().toLocaleLowerCase() !== "krys default"))
      setBackgroundsLoaded(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile backgrounds could not be loaded.")
    } finally {
      setBackgroundsLoading(false)
    }
  }

  function selectImportedBackground(background: ApprovedProfileBackground) {
    setDraft(current => ({ ...current, background_key: DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, background_id: background.id, background_path: background.storage_path, background_display_name: background.display_name }))
  }

  const importedBackgroundUrl = profileBackgroundPublicUrl(draft.background_path)
  const previewImage = importedBackgroundUrl || getPlayerProfileBackground(draft.background_key).imagePath
  const currentImportedIsInactive = Boolean(backgroundsLoaded && draft.background_id && draft.background_path && !backgrounds.some(background => background.id === draft.background_id))

  return <section className={styles.wrap}>
    <button type="button" className={styles.editButton} onClick={() => void toggleEditor()} aria-expanded={open}>{open ? "Close Editor" : "Edit My Profile"}</button>
    {open && <div className={styles.editor}>
      <div className={styles.heading}><div><h2>Make it yours</h2><p>Choose your profile colors and tell the league a little about yourself.</p></div></div>
      <fieldset className={styles.backgroundPicker}>
        <legend>Profile Background</legend>
        <div className={styles.backgroundGrid}>
          <button
            type="button"
            className={`${styles.backgroundOption} ${draft.background_id === null && draft.background_key === DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY ? styles.backgroundOptionSelected : ""}`}
            onClick={() => setDraft(current => ({ ...current, background_key: DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY, background_id: null, background_path: null, background_display_name: null }))}
            aria-pressed={draft.background_id === null && draft.background_key === DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY}
          >
            <span className={styles.backgroundThumbnail} style={{ backgroundImage: 'url("/player-profile-background.png")' }} />
            <span>Krys Default</span>
          </button>
          {backgrounds.map(background => <button key={background.id} type="button" className={`${styles.backgroundOption} ${draft.background_id === background.id ? styles.backgroundOptionSelected : ""}`} onClick={() => selectImportedBackground(background)} aria-pressed={draft.background_id === background.id}>
            <span className={styles.backgroundThumbnail} style={{ backgroundImage: `url("${profileBackgroundPublicUrl(background.storage_path)}")` }} />
            <span>{background.display_name}</span>
          </button>)}
          {currentImportedIsInactive && <button type="button" className={`${styles.backgroundOption} ${styles.backgroundOptionSelected}`} aria-pressed="true" disabled>
            <span className={styles.backgroundThumbnail} style={{ backgroundImage: `url("${importedBackgroundUrl}")` }} />
            <span>{draft.background_display_name || "Current background"} (no longer available)</span>
          </button>}
        </div>
        {backgroundsLoading && <p>Loading approved backgrounds…</p>}
      </fieldset>
      <fieldset className={styles.preferenceGroup}>
        <legend>Profile Showcase</legend>
        {([['show_featured_trophy','Show Featured Trophy'],['show_career_highlights','Show Career Highlights'],['show_recognition_box','Show Recognition Box']] as const).map(([key,label]) => <label className={styles.toggle} key={key}><input type="checkbox" checked={draft[key]} onChange={event => set(key,event.target.checked)} /><span>{label}</span></label>)}
      </fieldset>
      <fieldset className={styles.preferenceGroup}>
        <legend>Profile Appearance</legend>
        <label className={styles.toggle}><input type="checkbox" checked={draft.show_avatar_glow} onChange={event => set("show_avatar_glow",event.target.checked)} /><span>Show Avatar Glow</span></label>
        <div className={`${styles.appearanceControls} ${!draft.show_avatar_glow ? styles.controlsDisabled : ""}`}>
          <label className={styles.colorField}><span>Avatar Glow Color</span><input type="color" disabled={!draft.show_avatar_glow} value={draft.avatar_glow_color} onChange={event => set("avatar_glow_color",event.target.value)} /><code>{draft.avatar_glow_color}</code></label>
          <label className={styles.rangeField}><span>Avatar Glow Strength</span><input type="range" min="15" max="100" value={draft.avatar_glow_strength} disabled={!draft.show_avatar_glow} onChange={event => set("avatar_glow_strength",Number(event.target.value))} /><output>{draft.avatar_glow_strength}%</output></label>
        </div>
        <div className={styles.segmented}><span>Glass Style</span>{(["clear","frosted","dark"] as ProfileGlassStyle[]).map(value => <button type="button" key={value} aria-pressed={draft.glass_style===value} onClick={() => set("glass_style",value)}>{value}</button>)}</div>
        <label className={styles.toggle}><input type="checkbox" checked={draft.blue_panel_glow} onChange={event => set("blue_panel_glow",event.target.checked)} /><span>Blue Panel Glow</span></label>
      </fieldset>
      <fieldset className={styles.nameEffectPicker}>
        <legend>Player Name Effect</legend>
        <div className={styles.nameEffectOptions}>
          <button type="button" className={draft.name_effect === "auto" ? styles.nameEffectSelected : ""} onClick={() => set("name_effect", "auto")} aria-pressed={draft.name_effect === "auto"}>Automatic</button>
          <button type="button" className={draft.name_effect === "white" ? styles.nameEffectSelected : ""} onClick={() => set("name_effect", "white")} aria-pressed={draft.name_effect === "white"}>White</button>
          {isServerBooster && <button type="button" className={draft.name_effect === "booster" ? styles.nameEffectSelected : ""} onClick={() => set("name_effect", "booster")} aria-pressed={draft.name_effect === "booster"}>Server Booster</button>}
          {hasKrysServerTag && <button type="button" className={draft.name_effect === "server-tag" ? styles.nameEffectSelected : ""} onClick={() => set("name_effect", "server-tag")} aria-pressed={draft.name_effect === "server-tag"}>Server Tag</button>}
          {isServerBooster && hasKrysServerTag && <button type="button" className={draft.name_effect === "both" ? styles.nameEffectSelected : ""} onClick={() => set("name_effect", "both")} aria-pressed={draft.name_effect === "both"}>Booster + Tag</button>}
          {isStaff && <button type="button" className={draft.name_effect === "holographic" ? styles.nameEffectSelected : ""} onClick={() => set("name_effect", "holographic")} aria-pressed={draft.name_effect === "holographic"}>Holographic</button>}
        </div>
      </fieldset>
      <div className={styles.colors}>
        {([['background_color','Background Color'],['glow_color','Glow Color'],['text_color','Text Color']] as const).map(([key, label]) => <label key={key} className={styles.colorField}><span>{label}</span><input type="color" value={draft[key] || DEFAULTS[key]} onChange={event => set(key, event.target.value)} /><code>{draft[key]}</code></label>)}
      </div>
      <label className={styles.about}><span>About Me</span><textarea value={draft.about_me || ""} maxLength={500} rows={6} onChange={event => set("about_me", event.target.value)} placeholder="What should other golfers know about you?" /><small>{(draft.about_me || "").length}/500</small></label>
      <div className={styles.preview} style={{ backgroundColor: draft.background_color, backgroundImage: `url("${previewImage}")`, color: draft.text_color, boxShadow: `inset 0 0 70px ${draft.glow_color}33` }}><strong>Preview</strong><span>Your profile background and colors update here before you save.</span></div>
      <div className={styles.actions}>
        <button type="button" className={styles.save} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className={styles.reset} disabled={saving} onClick={() => setDraft(current => ({ ...current, ...DEFAULTS }))}>Reset Appearance to Krys Default</button>
      </div>
      {message && <p className={styles.message} role="status">{message}</p>}
    </div>}
  </section>
}
