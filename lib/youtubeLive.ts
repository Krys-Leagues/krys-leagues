export const KRYS_LEAGUES_YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@PrincessBankshot"

export type YouTubeLiveState = {
  isLive: boolean
  destination: string
  streamId: string | null
}

function configuredValue(value: string | undefined) {
  return value?.trim() || ""
}

export function getYouTubeLiveState(env: Record<string, string | undefined> = process.env): YouTubeLiveState {
  const liveUrl = configuredValue(env.NEXT_PUBLIC_KRYS_LEAGUES_LIVE_STREAM_URL)
  const streamId = configuredValue(env.NEXT_PUBLIC_KRYS_LEAGUES_LIVE_STREAM_ID)
  const isLive = env.NEXT_PUBLIC_KRYS_LEAGUES_STREAM_IS_LIVE === "true" && Boolean(liveUrl)

  return {
    isLive,
    destination: isLive ? liveUrl : KRYS_LEAGUES_YOUTUBE_CHANNEL_URL,
    streamId: isLive ? streamId || liveUrl : null,
  }
}

export function shouldRenderPublicLiveAlert(pathname: string | null) {
  if (!pathname) return false
  return !["/admin", "/auth", "/testing-access", "/access-denied"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function liveAlertDismissalKey(streamId: string) {
  return `krys-leagues-live-alert:${streamId}`
}
