const disallowedPublicHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"])

function approvedPublicDestination(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "https:" || disallowedPublicHosts.has(url.hostname) || url.hostname.endsWith(".vercel.app")) return null
    return url.toString().replace(/\/$/, "")
  } catch {
    return null
  }
}

/**
 * Project 22 supplies this only after its public destination is approved.
 * Preview and local URLs are intentionally rejected from public navigation.
 */
export const KWT_NET_PUBLIC_DESTINATION = approvedPublicDestination(process.env.NEXT_PUBLIC_KWT_NET_URL)
