export const CUP_SIGNUP_ANNOUNCEMENT_VERSION = "cup-signups-2026-v2"
export const CUP_SIGNUP_DISMISSAL_KEY = `krys-leagues:announcement:${CUP_SIGNUP_ANNOUNCEMENT_VERSION}:dismissed`
export const CUP_SIGNUP_ARTWORK_PATH = "/images/announcements/cup-signups-2026-v1.jpg"
export const XYLODON_SIGNUP_ARTWORK_PATH = "/images/announcements/escape-from-xylodon-1-day-tourney.png"
export const XYLODON_SIGNUP_URL = "https://discord.com/channels/1036296151651074168/1556556353521324092"
export const CUP_SIGNUP_DISCORD_INVITE_URL = "https://discord.gg/FfaqUMx9N"
export const CUP_SIGNUP_INSTRUCTION = "CLICK THE CUP FOR YOUR DIVISION TO SIGN UP"

export const CUP_SIGNUP_DESTINATIONS = [
  { id: "rydervale", label: "SIGN UP FOR THE RYDERVALE CUP", url: "https://discord.com/channels/1036296151651074168/1554740606905884713", area: { left: 1, top: 1, width: 28, height: 89 } },
  { id: "tiara", label: "SIGN UP FOR THE TIARA CUP", url: "https://discord.com/channels/1036296151651074168/1554740768478855221", area: { left: 29, top: 1, width: 21, height: 89 } },
  { id: "next-gen", label: "SIGN UP FOR THE NEXT GEN CUP", url: "https://discord.com/channels/1036296151651074168/1554740930484117554", area: { left: 50, top: 1, width: 23, height: 89 } },
] as const

export function shouldRenderCupSignupAnnouncement(pathname: string | null) {
  return pathname === "/"
}
