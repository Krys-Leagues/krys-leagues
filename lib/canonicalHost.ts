export const CANONICAL_PUBLIC_HOST = "krysleagues.com"
export const PRODUCTION_VERCEL_HOST = "krys-leagues.vercel.app"
export const WWW_PUBLIC_HOST = "www.krysleagues.com"

const REDIRECT_HOSTS = new Set([PRODUCTION_VERCEL_HOST, WWW_PUBLIC_HOST])

export function shouldRedirectToCanonicalHost(hostname: string, pathname: string) {
  const normalizedHost = hostname.trim().toLowerCase().replace(/\.$/, "")
  return pathname !== "/auth/callback" && REDIRECT_HOSTS.has(normalizedHost)
}

export function canonicalRedirectUrl(requestUrl: string) {
  const url = new URL(requestUrl)
  if (!shouldRedirectToCanonicalHost(url.hostname, url.pathname)) return null

  url.protocol = "https:"
  url.hostname = CANONICAL_PUBLIC_HOST
  url.port = ""
  return url.toString()
}
