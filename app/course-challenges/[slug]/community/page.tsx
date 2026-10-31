import { notFound } from "next/navigation"
import CourseChallengeCommunity from "@/components/course-challenges/CourseChallengeCommunity"
import { getCourseChallenge } from "@/lib/courseChallenges/catalog"

export default async function CourseChallengeCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = getCourseChallenge(slug)
  if (!course || course.status !== "live") notFound()
  return <CourseChallengeCommunity course={course} />
}
