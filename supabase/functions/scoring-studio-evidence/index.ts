import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const errorResponse = (message: string, status: number) => Response.json({ error: message }, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } })
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" }

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return errorResponse("Use POST for evidence operations.", 405)

  const authorization = request.headers.get("Authorization")
  const apiKey = request.headers.get("apikey")
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!authorization || !apiKey || !supabaseUrl || !serviceKey) return errorResponse("Evidence service is not configured.", 503)

  const userClient = createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: auth, error: authError } = await userClient.auth.getUser()
  if (authError || !auth.user) return errorResponse("Sign in before using scorecard evidence.", 401)

  const { data: playerId } = await userClient.rpc("current_major_player_id")

  const serviceClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      const file = form.get("file")
      const instanceId = String(form.get("instanceId") || "")
      const roundId = String(form.get("roundId") || "")
      const submissionId = String(form.get("submissionId") || "")
      const uploadId = String(form.get("uploadId") || "")
      if (!(file instanceof File) || !uuidPattern.test(instanceId) || !uuidPattern.test(roundId) || (form.get("action") === "upload-room-card" ? !uuidPattern.test(uploadId) : !uuidPattern.test(submissionId))) return errorResponse("Provide a valid scorecard image and tournament round.", 400)
      const extension = extensions[file.type]
      if (!extension || file.size < 1 || file.size > 10 * 1024 * 1024) return errorResponse("Use a JPG, PNG, WebP, or HEIC scorecard image up to 10 MB.", 400)
      if (form.get("action") === "upload-room-card") {
        const roomId = String(form.get("roomId") || "")
        const roomSource = String(form.get("roomSource") || "")
        if (!uuidPattern.test(roomId) || !uuidPattern.test(uploadId) || !["studio","mga_regular"].includes(roomSource)) return errorResponse("Provide a valid published room.", 400)
        const { data: canUpload, error: accessError } = await userClient.rpc("scoring_studio_room_access_v1", {
          p_instance_id: instanceId, p_round_id: roundId, p_room_source: roomSource, p_room_id: roomId, p_player_id: null,
        })
        if (accessError || !canUpload) return errorResponse("Only assigned players and authorized tournament Admins can upload this room's shared scorecard.", 403)
        const path = instanceId + "/" + roundId + "/room:" + roomSource + ":" + roomId + "/" + uploadId + "." + extension
        const bytes = new Uint8Array(await file.arrayBuffer())
        const { error: uploadError } = await serviceClient.storage.from("scoring-studio-evidence").upload(path, bytes, { contentType: file.type, upsert: false })
        if (uploadError) return errorResponse("The shared room scorecard could not be stored.", 400)
        const { error: attachError } = await userClient.rpc("scoring_studio_register_shared_room_card_v1", {
          p_instance_id: instanceId, p_round_id: roundId, p_room_source: roomSource, p_room_id: roomId, p_evidence_path: path,
        })
        if (attachError) return errorResponse(attachError.message || "The shared room scorecard could not be attached.", 403)
        return Response.json({ path, size: file.size, contentType: file.type }, { status: 201, headers: { ...corsHeaders, "Cache-Control": "no-store" } })
      }

      const [{ data: tournament, error: tournamentError }, { data: roster, error: rosterError }] = await Promise.all([
        userClient.from("scoring_studio_instances").select("id,status,public_results").eq("id", instanceId).single(),
        userClient.rpc("scoring_studio_registered_players_v1", { p_instance_id: instanceId }),
      ])
      if (tournamentError || !tournament || tournament.status !== "live" || !tournament.public_results) return errorResponse("This tournament is not accepting player submissions.", 403)
      if (!playerId) return errorResponse("This account is not linked to a canonical Global Player.", 403)
      if (rosterError || !(roster || []).some((entry: { canonical_player_id: string }) => entry.canonical_player_id === playerId)) return errorResponse("This Global Player is not registered for this tournament.", 403)
      const { data: round, error: roundError } = await userClient.from("scoring_studio_rounds").select("id").eq("id", roundId).eq("instance_id", instanceId).maybeSingle()
      if (roundError || !round) return errorResponse("The selected tournament round was not found.", 404)

      const path = `${instanceId}/${roundId}/${playerId}/${submissionId}.${extension}`
      const bytes = new Uint8Array(await file.arrayBuffer())
      const { error: uploadError } = await serviceClient.storage.from("scoring-studio-evidence").upload(path, bytes, { contentType: file.type, upsert: false })
      if (uploadError) return errorResponse("The scorecard image could not be stored.", 400)
      return Response.json({ path, size: file.size, contentType: file.type }, { status: 201, headers: { ...corsHeaders, "Cache-Control": "no-store" } })
    }

    const body = await request.json() as { action?: string; evidencePath?: string }
    if (body.action !== "sign" || typeof body.evidencePath !== "string") return errorResponse("Unsupported evidence operation.", 400)
    const isSharedRoomCard = body.evidencePath.split("/")[2]?.startsWith("room:")
    const { data: canRead, error: accessError } = isSharedRoomCard
      ? await userClient.rpc("scoring_studio_can_read_shared_card_v1", { p_path: body.evidencePath })
      : await userClient.rpc("scoring_studio_can_read_evidence", { p_path: body.evidencePath })
    if (accessError || !canRead) return errorResponse("This scorecard evidence is private to its player and tournament Admins.", 403)
    const { data: signed, error: signError } = await serviceClient.storage.from("scoring-studio-evidence").createSignedUrl(body.evidencePath, 60)
    if (signError || !signed?.signedUrl) return errorResponse("Unable to prepare a private evidence link.", 404)
    return Response.json({ signedUrl: signed.signedUrl }, { headers: { ...corsHeaders, "Cache-Control": "no-store" } })
  } catch {
    return errorResponse("Evidence request failed.", 400)
  }
})
