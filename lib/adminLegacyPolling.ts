export const LEGACY_ADMIN_POLL_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
  Deprecation: "true",
  "Retry-After": "300",
} as const

export function legacyCourseChallengeSummary() {
  return {
    pendingCount: 0,
    latestPendingId: null,
    latestPendingAt: null,
    legacyPollingDisabled: true,
  }
}

export function legacyMastersVerificationSummary() {
  return {
    rooms: 0,
    scores: 0,
    latestId: null,
    legacyPollingDisabled: true,
  }
}

