export const KWT_NET_LAUNCH_ANNOUNCEMENT_VERSION = "kwt-net-live-2026-10-25"
export const KWT_NET_LAUNCH_ANNOUNCEMENT_DISMISSAL_KEY = `krys-leagues:announcement:${KWT_NET_LAUNCH_ANNOUNCEMENT_VERSION}:dismissed`

// Keep the announcement admin-controlled without coupling it to a deployment date or time of day.
export const KWT_NET_LAUNCH_ANNOUNCEMENT_ENABLED = process.env.NEXT_PUBLIC_KWT_NET_LAUNCH_ANNOUNCEMENT_ENABLED !== "false"

export function shouldRenderKwtNetLaunchAnnouncement(pathname: string | null) {
  return KWT_NET_LAUNCH_ANNOUNCEMENT_ENABLED && pathname === "/kwt"
}
