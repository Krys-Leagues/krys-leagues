export function shouldAutoOpenOwnProfile(search: string): boolean {
  return new URLSearchParams(search).get("browse") !== "1"
}

export function ownProfilePath(canonicalPlayerId: string | null): string | null {
  if (!canonicalPlayerId || !canonicalPlayerId.trim()) return null
  return "/players/" + encodeURIComponent(canonicalPlayerId.trim())
}