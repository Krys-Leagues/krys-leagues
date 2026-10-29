export function shouldAutoOpenOwnProfile(search: string): boolean {
  const params = new URLSearchParams(search)
  return params.get("profile") === "me" && params.get("browse") !== "1"
}

export function ownProfilePath(canonicalPlayerId: string | null): string | null {
  if (!canonicalPlayerId || !canonicalPlayerId.trim()) return null
  return "/players/" + encodeURIComponent(canonicalPlayerId.trim())
}
