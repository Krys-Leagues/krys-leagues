import { authorizedAdminClient } from "@/app/api/admin/records/arizona-modern/_shared"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authorization = await authorizedAdminClient(request)
  if (authorization.error) return authorization.error
  return Response.json({ error: "The legacy 17,462-row Monthly preview is disabled. Use the final repaired Monthly preview." }, { status: 410, headers: { "Cache-Control": "no-store" } })
}
