export const ADMIN_PENDING_POLL_INTERVAL_MS = 60_000

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
