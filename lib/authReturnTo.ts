const AUTH_RETURN_TO_STORAGE_KEY = "krys-leagues:auth-return-to"
const AUTH_CALLBACK_PATH = "/auth/callback"
const MAX_RETURN_TO_LENGTH = 2048

function hasUnsafePathSyntax(value: string) {
  return (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
}

export function safeInternalReturnTo(value: string | null | undefined) {
  if (!value || value.length > MAX_RETURN_TO_LENGTH || hasUnsafePathSyntax(value)) return null

  let decoded = value
  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      return null
    }
  }

  if (hasUnsafePathSyntax(decoded)) return null

  const parsed = new URL(value, "https://krys-leagues.internal")
  if (parsed.origin !== "https://krys-leagues.internal") return null
  if (parsed.pathname === AUTH_CALLBACK_PATH) return null

  return value
}

export function currentInternalReturnTo() {
  if (typeof window === "undefined") return null
  return safeInternalReturnTo(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
}

export function createDiscordAuthCallbackUrl(type: "admin" | "player", returnTo?: string) {
  if (typeof window === "undefined") return AUTH_CALLBACK_PATH

  const destination = safeInternalReturnTo(returnTo) || currentInternalReturnTo()
  if (destination) window.sessionStorage.setItem(AUTH_RETURN_TO_STORAGE_KEY, destination)
  else window.sessionStorage.removeItem(AUTH_RETURN_TO_STORAGE_KEY)

  const callback = new URL(AUTH_CALLBACK_PATH, window.location.origin)
  callback.searchParams.set("type", type)
  if (destination) callback.searchParams.set("next", destination)
  return callback.toString()
}

export function consumeAuthReturnTo(queryDestination: string | null) {
  if (typeof window === "undefined") return safeInternalReturnTo(queryDestination)

  const storedDestination = window.sessionStorage.getItem(AUTH_RETURN_TO_STORAGE_KEY)
  window.sessionStorage.removeItem(AUTH_RETURN_TO_STORAGE_KEY)
  return safeInternalReturnTo(queryDestination) || safeInternalReturnTo(storedDestination)
}
