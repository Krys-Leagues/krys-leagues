import type {
  HistoricalPypIdentityDecision,
  HistoricalPypIdentityReview,
  HistoricalPypPairingDecision,
} from "./historicalPypCommit"

function sha256(value: string) {
  return globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)).then((digest) =>
    [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  )
}

export function historicalPypClientCommitFingerprint(
  previewFingerprint: string,
  identityReviews: HistoricalPypIdentityReview[],
  identityDecisions: Record<string, HistoricalPypIdentityDecision>,
  pairingDecisions: Record<string, HistoricalPypPairingDecision>,
) {
  return sha256(JSON.stringify({
    preview: previewFingerprint,
    identities: Object.entries(identityDecisions).sort(),
    automaticIdentities: identityReviews.map((review) => [review.historicalPlayerName, review.canonicalPlayerId]).sort(),
    pairings: Object.entries(pairingDecisions).sort(),
  }))
}
