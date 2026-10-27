import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { trustedTournamentClient } from "@/lib/tournaments/server"

const allowed = new Set(["image/jpeg", "image/png", "image/webp"])
const maxBytes = 8 * 1024 * 1024

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response
  const form = await request.formData().catch(() => null)
  const file = form?.get("artwork")
  if (!(file instanceof File) || !allowed.has(file.type) || file.size < 1 || file.size > maxBytes) return NextResponse.json({ error: "Upload a JPG, PNG, or WebP image no larger than 8 MB." }, { status: 400 })
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png"
  const path = `${authorization.user.id}/${crypto.randomUUID()}.${extension}`
  const { error } = await trustedTournamentClient().storage.from("tournament-artwork").upload(path, file, { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 503 })
  return NextResponse.json({ path }, { status: 201 })
}
