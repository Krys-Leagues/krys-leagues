import { NextResponse } from "next/server"

import { readCurrentPlayerHandicap } from "@/lib/handicap/playerRead"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const result = await readCurrentPlayerHandicap(await createServerSupabaseClient())
  if (result.status === "UNAUTHENTICATED") {
    return NextResponse.json({ status: result.status, message: result.message }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }
  return NextResponse.json({ data: result }, { headers: { "Cache-Control": "private, no-store" } })
}
