import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { loadHandicapRatings, loadHandicapRows } from "@/lib/handicap/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const [rows, ratingState] = await Promise.all([loadHandicapRows(), loadHandicapRatings()])
    return Response.json({ rows, ratings: ratingState.ratings, migrationRequired: ratingState.migrationRequired, readOnly: true })
  } catch (error) {
    console.error("[admin-handicaps] read failed", error)
    return Response.json({ code: "handicap_admin_unavailable", message: "Handicap audit data is temporarily unavailable." }, { status: 503 })
  }
}
