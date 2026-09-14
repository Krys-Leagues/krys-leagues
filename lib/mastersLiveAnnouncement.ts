export const MASTERS_LIVE_ANNOUNCEMENT_KEY = "krys-leagues:masters-live-announcement-v1"

export function shouldRenderMastersLiveAnnouncement(pathname: string) {
  return pathname !== "/testing-access"
    && pathname !== "/auth/callback"
    && !pathname.startsWith("/admin")
    && !pathname.startsWith("/auth/")
}
