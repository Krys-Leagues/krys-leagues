export type StrokeBoardSyncSnapshot = {
  syncState: string | null
  lastSyncedAt: string | null
}

export function strokeBoardSyncCompleted(snapshot: StrokeBoardSyncSnapshot) {
  return snapshot.syncState === "succeeded" && Boolean(snapshot.lastSyncedAt)
}

export function strokeBoardSyncPollDelay(attempt: number) {
  return Math.min(1_000 * Math.max(1, attempt), 5_000)
}
