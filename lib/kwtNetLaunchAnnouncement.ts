export const KWT_NET_LAUNCH_ANNOUNCEMENT_VERSION = "kwt-net-live-2026-10-25"
export const KWT_NET_LAUNCH_ANNOUNCEMENT_DISMISSAL_KEY = `krys-leagues:announcement:${KWT_NET_LAUNCH_ANNOUNCEMENT_VERSION}:dismissed`

// Admin-controlled Vercel flag: set NEXT_PUBLIC_KWT_NET_LAUNCH_ANNOUNCEMENT_ENABLED=false
// when this announcement should no longer appear for new visitors.
export const KWT_NET_LAUNCH_ANNOUNCEMENT_ENABLED = process.env.NEXT_PUBLIC_KWT_NET_LAUNCH_ANNOUNCEMENT_ENABLED !== "false"

export function shouldRenderKwtNetLaunchAnnouncement(pathname: string | null) {
  return KWT_NET_LAUNCH_ANNOUNCEMENT_ENABLED && pathname === "/"
}
