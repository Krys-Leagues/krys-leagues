import { notFound } from "next/navigation"
import CourseChallengeBook from "@/components/course-challenges/CourseChallengeBook"
import { getCourseChallenge } from "@/lib/courseChallenges/catalog"

export default async function CourseChallengeCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = getCourseChallenge(slug)
  if (!course || course.status !== "live") notFound()
  return <CourseChallengeBook course={course} />
}
