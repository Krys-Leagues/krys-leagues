import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminDataClient } from "@/lib/adminDataServer"
import { readHandicapAdminProductionData } from "@/lib/handicap/adminReviewServer"

export async function GET() {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const data = await readHandicapAdminProductionData(createAdminDataClient())
  return NextResponse.json(
    { data },
    { headers: { "Cache-Control": "no-store" } },
  )
}
