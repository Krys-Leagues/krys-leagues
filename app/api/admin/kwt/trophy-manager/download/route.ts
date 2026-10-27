import "server-only"

import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { trustedTournamentClient } from "@/lib/tournaments/server"
import { createStoreZip } from "@/lib/kwt/zip"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const BUCKET = "tournament-trophies"

export async function GET(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const client = trustedTournamentClient()
  const url = new URL(request.url)
  const awardId = url.searchParams.get("awardId")?.trim()
  const batchId = url.searchParams.get("batchId")?.trim()
  try {
    if (awardId) {
      const result = await client.from("kwt_trophy_awards").select("id,recipient_name_snapshot,personalized_storage_path,status").eq("id", awardId).maybeSingle()
      if (result.error) throw result.error
      if (!result.data || !["approved", "awarded"].includes(result.data.status) || !result.data.personalized_storage_path) return NextResponse.json({ error: "This trophy is not approved for download." }, { status: 403 })
      const signed = await client.storage.from(BUCKET).createSignedUrl(result.data.personalized_storage_path, 3600)
      if (signed.error) throw signed.error
      return NextResponse.json({ downloadUrl: signed.data.signedUrl }, { headers: { "Cache-Control": "no-store" } })
    }
    if (!batchId) return NextResponse.json({ error: "Award or batch ID is required." }, { status: 400 })
    const result = await client.from("kwt_trophy_awards").select("id,recipient_name_snapshot,personalized_storage_path,status").eq("batch_id", batchId).in("status", ["approved", "awarded"])
    if (result.error) throw result.error
    const entries: Array<{ name: string; bytes: Uint8Array }> = []
    for (const award of result.data || []) {
      if (!award.personalized_storage_path) continue
      const file = await client.storage.from(BUCKET).download(award.personalized_storage_path)
      if (file.error) throw file.error
      entries.push({ name: `${award.recipient_name_snapshot.replace(/[^a-z0-9._-]+/gi, "_")}-${award.id}.png`, bytes: new Uint8Array(await file.data.arrayBuffer()) })
    }
    if (!entries.length) return NextResponse.json({ error: "No approved personalized trophies are available." }, { status: 409 })
    const zip = createStoreZip(entries)
    return new NextResponse(zip as BodyInit, { status: 200, headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="kwt-trophies-${batchId}.zip"`, "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The trophy download is unavailable." }, { status: 503 })
  }
}
