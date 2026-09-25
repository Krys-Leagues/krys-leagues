import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createDoublesRuntimeClient } from "@/lib/doublesParticipantServer"
import { createDoublesDiscordEventStore } from "@/lib/doublesDiscordEventSupabaseStore"
import { createDoublesDiscordSupabaseStore } from "@/lib/doublesDiscordSupabaseStore"
import { createDoublesDiscordTransport } from "@/lib/doublesDiscordTransport"
import { dispatchDoublesDiscordEvent, processNextDoublesDiscordEvent, type DoublesDiscordEvent } from "@/lib/doublesDiscordEventDispatcher"
import { NEXT_SEASON_DOUBLES_DISCORD_ENABLED } from "@/lib/doublesDiscordRuntime"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  let body: { action?: "enqueue" | "process"; event?: DoublesDiscordEvent }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid Doubles Discord worker request" }, { status: 400 }) }
  const client = createDoublesRuntimeClient()
  const enabled = NEXT_SEASON_DOUBLES_DISCORD_ENABLED && process.env.NEXT_SEASON_DOUBLES_DISCORD_ENABLED === "true"
  if (!enabled) return NextResponse.json({ status: "DISABLED" })
  const eventStore = createDoublesDiscordEventStore(client)
  const mappingStore = createDoublesDiscordSupabaseStore(client)
  const transport = createDoublesDiscordTransport()
  if (body.action === "enqueue" && body.event) return NextResponse.json({ result: await dispatchDoublesDiscordEvent({ eventStore, mappingStore, transport, event: body.event, enabled }) })
  if (body.action === "process") return NextResponse.json({ result: await processNextDoublesDiscordEvent({ eventStore, mappingStore, transport, enabled }) })
  return NextResponse.json({ error: "Unsupported worker action" }, { status: 400 })
}
