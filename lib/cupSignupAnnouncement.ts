export const CUP_SIGNUP_ANNOUNCEMENT_ENABLED = true
export const CUP_SIGNUP_ANNOUNCEMENT_VERSION = "cup-signups-2026-v2"
export const CUP_SIGNUP_DISMISSAL_KEY = `krys-leagues:announcement:${CUP_SIGNUP_ANNOUNCEMENT_VERSION}:dismissed`
export const CUP_SIGNUP_ARTWORK_PATH = "/images/announcements/cup-signups-2026-v1.jpg"
export const CUP_SIGNUP_ARTWORK_SHA256 = "fdf2640ae4840a52c12f170988437c4e934fa01e127b3c7d660e6aab1ea4940c"
export const CUP_SIGNUP_INSTRUCTION = "CLICK THE CUP FOR YOUR DIVISION TO SIGN UP"
export const CUP_SIGNUP_DISCORD_INVITE_URL = "https://discord.gg/FfaqUMx9N"

export type CupSignupDestination = {
  id: "rydervale" | "tiara" | "next-gen"
  label: string
  url: string
  area: {
    left: number
    top: number
    width: number
    height: number
  }
}

export const CUP_SIGNUP_DESTINATIONS: readonly CupSignupDestination[] = [
  {
    id: "rydervale",
    label: "SIGN UP FOR THE RYDERVALE CUP",
    url: "https://discord.com/channels/1036296151651074168/1554740606905884713",
    area: { left: 1, top: 1, width: 28, height: 89 },
  },
  {
    id: "tiara",
    label: "SIGN UP FOR THE TIARA CUP",
    url: "https://discord.com/channels/1036296151651074168/1554740768478855221",
    area: { left: 29, top: 1, width: 21, height: 89 },
  },
  {
    id: "next-gen",
    label: "SIGN UP FOR THE NEXT GEN CUP",
    url: "https://discord.com/channels/1036296151651074168/1554740930484117554",
    area: { left: 50, top: 1, width: 23, height: 89 },
  },
] as const

export function shouldRenderCupSignupAnnouncement(pathname: string | null) {
  if (!pathname) return false
  return pathname !== "/testing-access"
    && pathname !== "/access-denied"
    && pathname !== "/auth/callback"
    && !pathname.startsWith("/admin")
    && !pathname.startsWith("/api/")
    && !pathname.startsWith("/auth/")
    && !pathname.startsWith("/majors/masters-stream")
}
