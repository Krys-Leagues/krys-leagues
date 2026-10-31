import { getCourseChallenge, getPublicCourseChallenges } from "@/lib/courseChallenges/catalog"
import { createCourseChallengesServiceClient } from "@/lib/courseChallenges/server"

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug")
  const course = slug ? getCourseChallenge(slug) : null
  if (slug && !course) return Response.json({ error: "Course Challenge course not found." }, { status: 404 })
  try {
    const service = createCourseChallengesServiceClient()
    const courses = course ? [course] : getPublicCourseChallenges()
    const codes = [...new Set(courses.flatMap((item) => [item.easyCode, item.hardCode]))]
    const { data, error } = await service.from("all_time_courses").select("code,par,hole_pars").in("code", codes)
    if (error) throw error
    const rows = (data || []) as Array<{ code: string; par: number | null; hole_pars: number[] | null }>
    const payload = courses.map((item) => ({
      slug: item.slug,
      name: item.name,
      pars: {
        Easy: rows.find((row) => row.code === item.easyCode)?.hole_pars || null,
        Hard: rows.find((row) => row.code === item.hardCode)?.hole_pars || null,
      },
    }))
    const selected = slug ? payload[0] : null
    return Response.json(selected || { courses: payload }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Authoritative course pars are unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
