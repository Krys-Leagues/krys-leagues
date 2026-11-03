import "server-only"

import { COURSE_CHALLENGE_REVIEW_EVENT, COURSE_CHALLENGE_REVIEW_TOPIC, type CourseChallengeReviewEventPayload } from "./reviewRealtime"

const payload: CourseChallengeReviewEventPayload = { version: 1, scope: "review_queue" }

/**
 * Sends only a queue-changed signal. The browser must refetch the protected
 * admin API; no submission id, player id, scorecard, or review data is sent.
 *
 * A failure is deliberately non-fatal: the saved submission/review remains
 * authoritative and the Review Desk's manual refresh remains available.
 */
export async function broadcastCourseChallengeReviewEvent() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "")
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) return false

  try {
    const response = await fetch(`${url}/rest/v1/rpc/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: COURSE_CHALLENGE_REVIEW_TOPIC,
        event: COURSE_CHALLENGE_REVIEW_EVENT,
        payload,
        private: true,
      }),
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}
