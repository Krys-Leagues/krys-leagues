export const DISCORD_BOARD_MAX_AUTOMATIC_ATTEMPTS = 5
export const DISCORD_BOARD_MANUAL_RETRY_AT = "9999-12-31T23:59:59.000Z"

export type DiscordBoardFailureKind = "not_found" | "temporary"

function safeErrorMessage(error: unknown) {
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message
  return "Discord board sync failed."
}

export function extractDiscordBoardErrorMessage(error: unknown) {
  return safeErrorMessage(error).slice(0, 500)
}

export function classifyDiscordBoardSyncError(error: unknown): DiscordBoardFailureKind {
  return /not\s*found|unknown message|unknown channel|10003|10008/i.test(safeErrorMessage(error)) ? "not_found" : "temporary"
}

export function discordBoardRetryAt(attemptCount: number, now = Date.now()) {
  const exponent = Math.max(0, Math.min(Math.max(1, attemptCount) - 1, 5))
  return new Date(now + Math.min(60_000 * (2 ** exponent), 60 * 60_000)).toISOString()
}

export function discordBoardFailureUpdate(input: { attemptCount: number; error: unknown; now?: number }) {
  const kind = classifyDiscordBoardSyncError(input.error)
  const exhausted = input.attemptCount >= DISCORD_BOARD_MAX_AUTOMATIC_ATTEMPTS
  const manualRetryRequired = kind === "not_found" || exhausted
  return {
    kind,
    manualRetryRequired,
    reason: kind === "not_found" ? "board_rebind_required" : exhausted ? "board_retry_exhausted" : "board_sync_retry",
    syncState: "failed" as const,
    nextAttemptAt: manualRetryRequired ? DISCORD_BOARD_MANUAL_RETRY_AT : discordBoardRetryAt(input.attemptCount, input.now),
    lastError: `${kind === "not_found" ? "Discord message not found; explicit board rebind required." : exhausted ? "Automatic Discord board retries exhausted; explicit admin retry required." : "Temporary Discord board sync failure."} ${extractDiscordBoardErrorMessage(input.error)}`.slice(0, 500),
  }
}
