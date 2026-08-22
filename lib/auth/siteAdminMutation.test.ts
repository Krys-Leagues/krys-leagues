import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import type { User } from "@supabase/supabase-js"

import { authorizeSiteAdminWithClient } from "./siteAdminAuthorizationCore.ts"

const user = { id: "11111111-1111-1111-1111-111111111111" } as User

function client(options: {
  user?: User | null
  authenticationError?: Error | null
  siteAdmin?: boolean
  authorizationError?: Error | null
}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: options.user ?? null },
        error: options.authenticationError ?? null,
      }),
    },
    rpc: async () => ({
      data: options.siteAdmin ?? false,
      error: options.authorizationError ?? null,
    }),
  }
}

test("missing or invalid authentication returns 401", async () => {
  const missing = await authorizeSiteAdminWithClient(client({ user: null }))
  assert.equal(missing.authorized, false)
  if (missing.authorized) return
  assert.equal(missing.response.status, 401)

  const invalid = await authorizeSiteAdminWithClient(
    client({ user, authenticationError: new Error("invalid token") }),
  )
  assert.equal(invalid.authorized, false)
  if (invalid.authorized) return
  assert.equal(invalid.response.status, 401)
})

test("authenticated non-admin returns 403", async () => {
  const result = await authorizeSiteAdminWithClient(
    client({ user, siteAdmin: false }),
  )
  assert.equal(result.authorized, false)
  if (result.authorized) return
  assert.equal(result.response.status, 403)
})

test("site admin is authorized", async () => {
  const result = await authorizeSiteAdminWithClient(
    client({ user, siteAdmin: true }),
  )
  assert.equal(result.authorized, true)
  if (!result.authorized) return
  assert.equal(result.user.id, user.id)
})

test("authorization service failure does not proceed", async () => {
  const result = await authorizeSiteAdminWithClient(
    client({ user, authorizationError: new Error("RPC unavailable") }),
  )
  assert.equal(result.authorized, false)
  if (result.authorized) return
  assert.equal(result.response.status, 503)
})

const protectedRoutes = [
  "app/api/create-matches/route.ts",
  "app/api/recalculate-standings/route.ts",
  "app/api/import/run/route.ts",
  "app/api/post-schedule/route.ts",
  "app/api/discord-schedule/route.ts",
  "app/api/discord/route.ts",
  "app/api/discord/result-card/route.ts",
  "app/api/discord/season-schedule/route.ts",
]

for (const route of protectedRoutes) {
  test(`${route} authorizes before reading payload or performing mutations`, async () => {
    const source = await readFile(route, "utf8")
    const authorizationCall = source.indexOf("await authorizeSiteAdminMutation()")
    const denialReturn = source.indexOf("return authorization.response")
    const bodyReads = [source.indexOf("req.json()"), source.indexOf("request.json()")].filter(
      (index) => index >= 0,
    )
    const bodyRead = Math.min(...bodyReads)

    assert.ok(authorizationCall >= 0, "shared site-admin authorization must be called")
    assert.ok(denialReturn > authorizationCall, "denied requests must return immediately")
    assert.ok(bodyRead > denialReturn, "authorization must happen before payload parsing")
  })
}
