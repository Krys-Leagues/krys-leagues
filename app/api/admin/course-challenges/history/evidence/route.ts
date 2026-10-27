import { createCourseChallengesServiceClient, requireCourseChallengeAdmin } from "@/lib/courseChallenges/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authorization = await requireCourseChallengeAdmin()
  if (authorization.response) return authorization.response
  const submissionId = new URL(request.url).searchParams.get("submissionId")?.trim()
  if (!submissionId) return Response.json({ error: "Submission ID is required." }, { status: 400 })
  try {
    const service = createCourseChallengesServiceClient()
    const result = await service.from("course_challenge_submissions").select("id,proof_photo_path").eq("id", submissionId).maybeSingle()
    if (result.error) throw result.error
    if (!result.data?.proof_photo_path) return Response.json({ proofAvailable: false, signedUrl: null }, { headers: { "Cache-Control": "no-store" } })
    const signed = await service.storage.from("course-challenge-proof").createSignedUrl(String(result.data.proof_photo_path), 600)
    if (signed.error) throw signed.error
    return Response.json({ proofAvailable: Boolean(signed.data?.signedUrl), signedUrl: signed.data?.signedUrl || null }, { headers: { "Cache-Control": "no-store" } })
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "Private evidence is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
