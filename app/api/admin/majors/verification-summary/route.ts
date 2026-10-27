import { NextResponse } from "next/server"

import { LEGACY_ADMIN_POLL_HEADERS, legacyMastersVerificationSummary } from "@/lib/adminLegacyPolling"

export async function GET() {
  return NextResponse.json(legacyMastersVerificationSummary(), { headers: LEGACY_ADMIN_POLL_HEADERS })
}
