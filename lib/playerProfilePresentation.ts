import type React from "react"

export type ProfileGlassStyle = "clear" | "frosted" | "dark"

export type ProfilePresentationPreferences = {
  show_featured_trophy: boolean
  show_career_highlights: boolean
  show_recognition_box: boolean
  show_avatar_glow: boolean
  avatar_glow_color: string
  avatar_glow_strength: number
  glass_style: ProfileGlassStyle
  blue_panel_glow: boolean
}

export const DEFAULT_PROFILE_PRESENTATION: ProfilePresentationPreferences = {
  show_featured_trophy: true,
  show_career_highlights: true,
  show_recognition_box: true,
  show_avatar_glow: true,
  avatar_glow_color: "#ff2bd6",
  avatar_glow_strength: 85,
  glass_style: "clear",
  blue_panel_glow: true,
}

export function normalizeProfilePresentation(value: Partial<ProfilePresentationPreferences> | null | undefined): ProfilePresentationPreferences {
  const strength = Number(value?.avatar_glow_strength)
  const glassStyle = value?.glass_style
  const avatarGlowColor = value?.avatar_glow_color || ""
  return {
    ...DEFAULT_PROFILE_PRESENTATION,
    ...value,
    avatar_glow_strength: Number.isFinite(strength) ? Math.min(100, Math.max(15, Math.round(strength))) : DEFAULT_PROFILE_PRESENTATION.avatar_glow_strength,
    avatar_glow_color: /^#[0-9a-f]{6}$/i.test(avatarGlowColor) ? avatarGlowColor : DEFAULT_PROFILE_PRESENTATION.avatar_glow_color,
    glass_style: glassStyle === "frosted" || glassStyle === "dark" ? glassStyle : "clear",
  }
}

export function profilePresentationStyle(preferences: ProfilePresentationPreferences): React.CSSProperties {
  const glass = preferences.glass_style === "frosted"
    ? { background: "linear-gradient(135deg,#02111d94,#06132688 52%,#1e10267d)", blur: "blur(10px) saturate(115%)" }
    : preferences.glass_style === "dark"
      ? { background: "linear-gradient(135deg,#020817e8,#030b18e3 52%,#130817df)", blur: "blur(4px)" }
      : { background: "linear-gradient(135deg,#02111d75,#06132668 52%,#1e102660)", blur: "none" }
  return {
    "--profile-panel-background": glass.background,
    "--profile-panel-blur": glass.blur,
    "--profile-panel-border": preferences.blue_panel_glow ? "#38d9f052" : "#ffffff2e",
    "--profile-panel-shadow": preferences.blue_panel_glow ? "inset 0 1px #d9fbff17,0 16px 44px #02061738" : "inset 0 1px #ffffff14,0 12px 34px #0206172e",
    "--profile-row-border": preferences.blue_panel_glow ? "#a5f3fc26" : "#ffffff24",
  } as React.CSSProperties
}
