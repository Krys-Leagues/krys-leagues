import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { DEFAULT_PROFILE_PRESENTATION, normalizeProfilePresentation, profilePresentationStyle } from "../../lib/playerProfilePresentation.ts"

const read = (path: string) => readFileSync(path, "utf8")

test("existing profiles receive backward-compatible visible defaults", () => {
  assert.deepEqual(normalizeProfilePresentation(null), DEFAULT_PROFILE_PRESENTATION)
  assert.equal(DEFAULT_PROFILE_PRESENTATION.show_featured_trophy, true)
  assert.equal(DEFAULT_PROFILE_PRESENTATION.show_career_highlights, true)
  assert.equal(DEFAULT_PROFILE_PRESENTATION.show_recognition_box, true)
})

test("showcase controls are independent presentation settings", () => {
  const editor = read("components/PlayerProfileEditor.tsx")
  const page = read("app/players/[id]/page.tsx")
  for (const field of ["show_featured_trophy", "show_career_highlights", "show_recognition_box"]) {
    assert.match(editor, new RegExp(field))
    assert.match(page, new RegExp(`preferences\\.${field}`))
  }
  assert.doesNotMatch(editor, /set_site_player_profile_recognition|player_trophies.*delete|profile_badges.*update/)
})

test("avatar glow controls remain independent from name recognition", () => {
  const hero = read("components/PlayerProfileHero.tsx")
  const editor = read("components/PlayerProfileEditor.tsx")
  assert.match(hero, /isServerBooster && showAvatarGlow/)
  assert.match(hero, /--profile-avatar-glow-opacity/)
  assert.match(editor, /Avatar Glow Color/)
  assert.match(editor, /Avatar Glow Strength/)
  assert.match(editor, /disabled=\{!draft\.show_avatar_glow\}/)
  assert.doesNotMatch(hero, /showAvatarGlow.*nameEffectClass/)
})

test("glass presets and blue panel glow are profile-wide and curated", () => {
  for (const style of ["clear", "frosted", "dark"] as const) {
    const variables = profilePresentationStyle({ ...DEFAULT_PROFILE_PRESENTATION, glass_style: style }) as Record<string,string>
    assert.ok(variables["--profile-panel-background"])
  }
  const on = profilePresentationStyle(DEFAULT_PROFILE_PRESENTATION) as Record<string,string>
  const off = profilePresentationStyle({ ...DEFAULT_PROFILE_PRESENTATION, blue_panel_glow: false }) as Record<string,string>
  assert.notEqual(on["--profile-panel-border"], off["--profile-panel-border"])
  assert.match(read("components/PlayerProfileEditor.tsx"), /\["clear","frosted","dark"\]/)
})

test("only the v6 no-row marker activates the clear frosted fallback", () => {
  const presentation = read("lib/playerProfilePresentation.ts")
  const page = read("app/players/[id]/page.tsx")
  const fallback = profilePresentationStyle(DEFAULT_PROFILE_PRESENTATION, true) as Record<string,string>
  const savedClear = profilePresentationStyle({ ...DEFAULT_PROFILE_PRESENTATION, glass_style: "clear" }, false) as Record<string,string>
  assert.match(presentation, /useDefaultFrostedGlass = false/)
  assert.match(presentation, /blur\(12px\) saturate\(120%\)/)
  assert.equal(fallback["--profile-panel-blur"], "blur(12px) saturate(120%)")
  assert.equal(savedClear["--profile-panel-blur"], "none")
  assert.match(page, /get_public_player_profile_preferences_v6/)
  assert.match(page, /preferences\.has_saved_preferences === false/)
  assert.match(page, /has_saved_preferences: loaded\.has_saved_preferences === true/)
  assert.match(page, /has_saved_preferences: null/)
})

test("migration is additive, constrained, idempotent, and does not grant eligibility", () => {
  const sql = read("player_profile_showcase_preferences.sql")
  assert.match(sql, /add column if not exists show_featured_trophy/)
  assert.match(sql, /avatar_glow_strength between 15 and 100/)
  assert.match(sql, /glass_style in \('clear', 'frosted', 'dark'\)/)
  assert.doesNotMatch(sql, /update public\.players|is_server_booster\s*=|has_krys_server_tag\s*=|profile_badges\s*=/)
  assert.doesNotMatch(sql, /disable row level security|drop policy|create policy/i)
})

test("saved-preferences reader exposes row existence without changing profile values", () => {
  const sql = read("player_profile_preferences_saved_marker.sql")
  assert.match(sql, /get_public_player_profile_preferences_v6/)
  assert.match(sql, /has_saved_preferences boolean/)
  assert.match(sql, /pref\.player_id is not null/)
  for (const field of [
    "background_key",
    "background_id",
    "background_path",
    "background_display_name",
    "name_effect",
    "background_color",
    "glow_color",
    "text_color",
    "about_me",
    "show_featured_trophy",
    "show_career_highlights",
    "show_recognition_box",
    "show_avatar_glow",
    "avatar_glow_color",
    "avatar_glow_strength",
    "glass_style",
    "blue_panel_glow",
  ]) assert.match(sql, new RegExp(`\\b${field}\\b`))
  assert.doesNotMatch(sql, /\b(insert into|update|delete from)\s+public\.player_profile_preferences\b/i)
})
