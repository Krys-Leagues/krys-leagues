import { NextResponse } from "next/server"
import { createScorecardServiceClient, resolveCanonicalSessionPlayer, storeWebsiteScorecardEvidence } from "@/lib/scorecards/server"
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const session = await createServerSupabaseClient()
  const userResult = await session.auth.getUser()
  if (userResult.error || !userResult.data.user) return NextResponse.json({ error: "Sign in with Discord to submit a scorecard." }, { status: 401 })
  const service = createScorecardServiceClient()
  const identity = await resolveCanonicalSessionPlayer(service, userResult.data.user)
  if (identity.status !== "resolved") return NextResponse.json({ error: "Your Discord account is not linked to exactly one Global Player." }, { status: 403 })
  const form = await request.formData()
  const adapterKey = form.get("adapterKey")
  const sourceKey = form.get("sourceKey")
  const componentKey = form.get("componentKey")
  const file = form.get("file")
  if (!["pyp", "stroke", "match"].includes(String(adapterKey)) || typeof sourceKey !== "string" || !sourceKey || !(file instanceof File)) return NextResponse.json({ error: "A valid scorecard context and image are required." }, { status: 400 })
  if (adapterKey === "pyp" && componentKey !== "course1" && componentKey !== "course2") return NextResponse.json({ error: "Choose Course 1 or Course 2." }, { status: 400 })
  try {
    const result = await storeWebsiteScorecardEvidence({ client: service, playerId: identity.playerId, adapterKey: adapterKey as "pyp" | "stroke" | "match", sourceKey, componentKey: typeof componentKey === "string" ? componentKey : undefined, filename: file.name, contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) })
    if (!result.stored) return NextResponse.json({ error: result.reason === "already_submitted" ? "This scorecard component is already submitted or under review." : "This scorecard image could not be accepted." }, { status: 409 })
    return NextResponse.json(result, { status: 201 })
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Scorecard upload failed." }, { status: 400 })
  }
}
