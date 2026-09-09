export type CourseChallengeStatus = "draft" | "scheduled" | "live" | "retired"
export type RequirementsStatus = "ready" | "pending_review"
export type CourseChallengeDifficulty = "Easy" | "Hard"
export type CourseChallengeSubmissionStatus = "pending" | "needs_review" | "approved" | "rejected"
export type AutoEvaluationStatus = "auto_pass" | "auto_fail" | "needs_review"

export type CourseChallengeRequirementKind =
  | "complete_course"
  | "relative_to_par"
  | "hole_score"
  | "hole_relative_to_par"
  | "last_hole_score"
  | "last_three_relative_to_par"
  | "hio_count"
  | "bogey_count"
  | "stroke_out_count"
  | "par_or_better_count"
  | "birdie_count"
  | "eagle_count"

export type RequirementOperator = "eq" | "lte" | "gte"

export type CourseChallengeRequirement = {
  id: string
  label: string
  kind: CourseChallengeRequirementKind
  operator?: RequirementOperator
  target?: number
  hole?: number
  reviewRequired?: boolean
  helpText?: string
}

export type CourseChallengeLevel = {
  level: 1 | 2 | 3 | 4 | 5
  easyCode: string
  hardCode: string
  requirementsStatus: RequirementsStatus
  easyRequirements: CourseChallengeRequirement[]
  hardRequirements: CourseChallengeRequirement[]
  stickerKey: string
  stickerAsset: string | null
  badgeKey: string | null
  badgeAsset: string | null
}

export type CourseChallengeAce = {
  unlockAfterLevel: 3
  easyRequirements: CourseChallengeRequirement[]
  hardRequirements: CourseChallengeRequirement[]
  requirementsStatus: RequirementsStatus
  rewardKey: string
  rewardAsset: string | null
}

export type CourseChallengeCourse = {
  slug: string
  name: string
  status: CourseChallengeStatus
  displayOrder: number
  shortDescription: string
  backgroundImage: string | null
  easyCode: string
  hardCode: string
  levels: CourseChallengeLevel[]
  aceChallenge?: CourseChallengeAce
  courseProAsset?: string | null
  courseMasterAsset?: string | null
}

export type CourseChallengeMetrics = {
  totalStrokes: number
  totalPar: number
  relativeToPar: number
  holeInOnes: number
  bogeys: number
  parsOrBetter: number
  birdies: number
  eagles: number
  strokeOuts: number | null
  lastHoleScore: number
  lastThreeRelativeToPar: number
}

export type RequirementEvaluation = {
  requirement: CourseChallengeRequirement
  passed: boolean | null
  status: "passed" | "failed" | "needs_review"
  reason?: string
}

export type CourseChallengeEvaluation = {
  metrics: CourseChallengeMetrics
  requirements: RequirementEvaluation[]
  status: AutoEvaluationStatus
  reason?: string
}

export type CourseChallengePhotoTotalCheck = "passed" | "needs_review"

export type CourseChallengeSubmissionPayload = {
  courseSlug: string
  level: number
  difficulty: CourseChallengeDifficulty
  challengeKey?: "level" | "ace"
  proofPhotoPath: string
  scores: number[]
  roundDate: string
  roundTime: string
  gameMode: "solo" | "multiplayer"
}

export type CourseChallengeProfileReward = {
  rewardKey: string
  label: string
  kind: "sticker" | "badge"
  courseSlug: string
  level: number | null
  earnedAt: string | null
}

export type CourseChallengeRewardDefinition = {
  rewardKey: string
  label: string
  kind: "sticker" | "badge"
  courseSlug: string
  level: number | null
  assetPath: string | null
}