export function shouldRenderMastersLiveAnnouncement(pathname: string) {
  return pathname !== "/testing-access"
    && pathname !== "/auth/callback"
    && !pathname.startsWith("/admin")
    && !pathname.startsWith("/auth/")
}
