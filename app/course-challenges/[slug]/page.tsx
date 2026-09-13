import { notFound } from "next/navigation"
import CourseChallengeBook from "@/components/course-challenges/CourseChallengeBook"
import { getCourseChallenge } from "@/lib/courseChallenges/catalog"

export default async function CourseChallengeCoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ open?: string }> }) {
  const { slug } = await params
  const query = await searchParams
  const course = getCourseChallenge(slug)
  if (!course || course.status !== "live") notFound()
  return <CourseChallengeBook course={course} autoOpen={query.open === "1"} />
}
