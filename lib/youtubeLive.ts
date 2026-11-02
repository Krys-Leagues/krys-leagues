export const KRYS_LEAGUES_YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@PrincessBankshot"

export function getYouTubeLiveState(env: Record<string, string | undefined> = process.env) {
  const liveUrl = env.NEXT_PUBLIC_KRYS_LEAGUES_LIVE_STREAM_URL?.trim() || ""
  const streamId = env.NEXT_PUBLIC_KRYS_LEAGUES_LIVE_STREAM_ID?.trim() || ""
  const isLive = env.NEXT_PUBLIC_KRYS_LEAGUES_STREAM_IS_LIVE === "true" && Boolean(liveUrl)
  return { isLive, destination: isLive ? liveUrl : KRYS_LEAGUES_YOUTUBE_CHANNEL_URL, streamId: isLive ? streamId || liveUrl : null }
}
