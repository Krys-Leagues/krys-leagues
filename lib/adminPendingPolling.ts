export const ADMIN_PENDING_POLL_INTERVAL_MS = 60_000
export const ADMIN_PENDING_REQUEST_TIMEOUT_MS = 15_000
export const ADMIN_PENDING_MAX_BACKOFF_MS = 10 * 60_000

export function adminPendingPollDelayMs(consecutiveFailures: number) {
  if (consecutiveFailures <= 0) return ADMIN_PENDING_POLL_INTERVAL_MS
  return Math.min(
    ADMIN_PENDING_POLL_INTERVAL_MS * (2 ** Math.min(consecutiveFailures, 4)),
    ADMIN_PENDING_MAX_BACKOFF_MS,
  )
}

export function shouldPollAdminPendingAlerts({
  hasSession,
  accessDenied,
  hiddenForStream,
  documentVisible,
}: {
  hasSession: boolean
  accessDenied: boolean
  hiddenForStream: boolean
  documentVisible: boolean
}) {
  return hasSession && !accessDenied && !hiddenForStream && documentVisible
}
