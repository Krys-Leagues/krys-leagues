import { getPublicCourseChallenges } from "@/lib/courseChallenges/catalog"
import CourseChallengesLanding from "@/components/course-challenges/CourseChallengesLanding"

export default function CourseChallengesPage() {
  return <CourseChallengesLanding courses={getPublicCourseChallenges()} />
}
