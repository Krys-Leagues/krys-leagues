import { NextResponse } from "next/server"
import { previewInteractionResponse, verifyInteractionSignature } from "@/lib/doublesDiscordRuntime"

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyInteractionSignature(raw, request.headers.get("x-krys-discord-signature"), process.env.DISCORD_INTERACTION_HMAC_SECRET || "")) return NextResponse.json({ error: "Invalid Discord interaction signature" }, { status: 401 })
  let body: { data?: { custom_id?: string } }
  try { body = JSON.parse(raw) as { data?: { custom_id?: string } } } catch { return NextResponse.json({ error: "Invalid interaction payload" }, { status: 400 }) }
  const response = previewInteractionResponse(body.data?.custom_id || "")
  if (!response) return NextResponse.json({ error: "Unsupported or disabled Doubles interaction" }, { status: 403 })
  return NextResponse.json(response)
}
