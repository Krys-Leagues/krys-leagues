import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { loadVerifiedKwtNetPayload } from "@/lib/kwtNetServer"

export const dynamic = "force-dynamic"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const payload = await loadVerifiedKwtNetPayload()
  return Response.json({ state: payload.state, event: payload.event, reason: payload.reason ?? null, canPublish: false }, { headers: { "Cache-Control": "no-store" } })
}

