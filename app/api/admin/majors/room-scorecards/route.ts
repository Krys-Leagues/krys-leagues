import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { adminRoomScorecardImageUrl } from "@/lib/majorRoomScorecard"
import { createScorecardServiceClient } from "@/lib/scorecards/server"

export const runtime = "nodejs"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  const service = createScorecardServiceClient()
  const url = new URL(request.url)
  const proofId = url.searchParams.get("proofId") || ""

  try {
    if (proofId) {
      if (!UUID.test(proofId)) return json({ error: "Invalid room scorecard proof reference." }, 400)
      const proof = await service
        .from("major_room_scorecard_proofs")
        .select("storage_bucket,storage_path,content_type")
        .eq("id", proofId)
        .is("replaced_at", null)
        .maybeSingle()
      if (proof.error || !proof.data) return json({ error: "The current room scorecard photo was not found." }, 404)
      const download = await service.storage.from(String(proof.data.storage_bucket)).download(String(proof.data.storage_path))
      if (download.error || !download.data) return json({ error: "The room scorecard photo is unavailable." }, 404)
      return new Response(await download.data.arrayBuffer(), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline",
          "Content-Type": String(proof.data.content_type),
          "X-Content-Type-Options": "nosniff",
        },
      })
    }

    const eventId = url.searchParams.get("eventId") || ""
    if (!UUID.test(eventId)) return json({ error: "Invalid Major event reference." }, 400)
    const proofs = await service
      .from("major_room_scorecard_proofs")
      .select("id,major_event_id,play_day_id,schedule_group_id,revision,uploaded_by_player_id,uploaded_at")
      .eq("major_event_id", eventId)
      .is("replaced_at", null)
      .order("uploaded_at", { ascending: false })
    if (proofs.error) throw proofs.error
    const uploaderIds = [...new Set((proofs.data || []).map((proof) => proof.uploaded_by_player_id))]
    const uploaders = uploaderIds.length
      ? await service.from("players").select("id,screen_name").in("id", uploaderIds)
      : { data: [], error: null }
    if (uploaders.error) throw uploaders.error
    const uploaderNames = new Map((uploaders.data || []).map((player) => [player.id, player.screen_name]))
    return json({ proofs: (proofs.data || []).map((proof) => ({
      ...proof,
      uploader_screen_name: uploaderNames.get(proof.uploaded_by_player_id) || "Unknown player",
      image_url: adminRoomScorecardImageUrl(proof.id),
    })) })
  } catch (caught) {
    return json({ error: caught instanceof Error ? caught.message : "Room scorecard proofs could not be loaded." }, 503)
  }
}
