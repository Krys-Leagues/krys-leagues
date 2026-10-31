export function shouldAutoOpenOwnProfile(search: string): boolean {
  return new URLSearchParams(search).get("browse") !== "1"
}

export function ownProfilePath(canonicalPlayerId: string | null): string | null {
  if (!canonicalPlayerId || !canonicalPlayerId.trim()) return null
  return "/players/" + encodeURIComponent(canonicalPlayerId.trim())
}

export function playerProfileNavigationPath(currentPlayerId: string | undefined, ownPlayerId: string | null): string | null {
  const normalizedOwnPlayerId = ownPlayerId?.trim()
  const ownPath = ownProfilePath(normalizedOwnPlayerId || null)
  if (!ownPath || !normalizedOwnPlayerId) return null
  return currentPlayerId && currentPlayerId.trim() === normalizedOwnPlayerId
    ? "/players?browse=1"
    : ownPath
}
