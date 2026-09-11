import { NextResponse } from "next/server"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "A schedule row id is required." }, { status: 400 })
  }

  const id = typeof body === "object" && body !== null && "id" in body
    ? (body as { id?: unknown }).id
    : null
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "A valid schedule row id is required." }, { status: 400 })
  }

  const { data, error } = await authorization.supabase
    .from("schedule")
    .delete()
    .eq("id", id)
    .select("id")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data?.length) {
    return NextResponse.json({ error: "Schedule row not found." }, { status: 404 })
  }

  return NextResponse.json({ success: true, id: data[0].id })
}
