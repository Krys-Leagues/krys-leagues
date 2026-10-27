import { loadVerifiedKwtNetPayload } from "@/lib/kwtNetServer"

export const dynamic = "force-dynamic"

export async function GET() {
  const payload = await loadVerifiedKwtNetPayload()
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } })
}

