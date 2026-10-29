export type CourseChallengeAudience = "tester" | "public"

export function courseChallengeReleaseConfig() {
  return {
    testingStartDate: process.env.COURSE_CHALLENGES_TESTING_START_DATE?.trim() || null,
    publicLaunchDate: process.env.COURSE_CHALLENGES_PUBLIC_LAUNCH_DATE?.trim() || null,
  }
}

export function audienceForCanonicalPlayer(canonicalPlayerId: string, approvedTester: boolean): CourseChallengeAudience {
  // The existing site-access RPC resolves approvedTester from public.players.id.
  // A missing canonical player identity can never become a tester through this helper.
  return canonicalPlayerId.trim() && approvedTester ? "tester" : "public"
}

export function eligibleRoundDate(roundDate: string, audience: CourseChallengeAudience) {
  const config = courseChallengeReleaseConfig()
  const minimum = audience === "tester" ? config.testingStartDate : config.publicLaunchDate
  if (!minimum) return { allowed: false, reason: `${audience === "tester" ? "Testing start" : "Public launch"} date is not configured.` }
  return roundDate >= minimum
    ? { allowed: true as const, reason: null }
    : { allowed: false as const, reason: `This scorecard predates the ${audience === "tester" ? "testing" : "public launch"} date.` }
}