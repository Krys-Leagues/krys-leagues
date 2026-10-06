export const MASTERS_WINNER_VIDEO_PATH = "/masters/masters-winner.mp4"
export const MASTERS_WINNER_VIDEO_SEEN_KEY = "mastersWinnerVideoSeen"
export const MASTERS_WINNER_VIDEO_EXPIRES_AT = "2026-10-15T23:59:59-04:00"

export function isMastersWinnerVideoActive(now = Date.now()) {
  return now < Date.parse(MASTERS_WINNER_VIDEO_EXPIRES_AT)
}
