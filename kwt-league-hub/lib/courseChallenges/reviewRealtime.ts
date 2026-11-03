export const COURSE_CHALLENGE_REVIEW_TOPIC = "course-challenge:review-desk"
export const COURSE_CHALLENGE_REVIEW_EVENT = "queue_changed"

export type CourseChallengeReviewEventPayload = {
  version: 1
  scope: "review_queue"
}
