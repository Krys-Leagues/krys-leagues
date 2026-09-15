import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Hall of Champions loads its public display model through a server route", () => {
  const page = read("app/champions/page.tsx")
  const route = read("app/api/champions/public/route.ts")

  assert.match(page, /fetch\(`\/api\/champions\/public\?scope=/)
  assert.doesNotMatch(page, /@\/lib\/supabase|loadCanonicalPlayerDisplays|\.from\("players"\)/)
  assert.match(route, /loadPublicChampionTrophies/)
  assert.match(route, /export async function GET/)
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/)
})

test("public Hall reader resolves canonical names server-side with a strict field allowlist", () => {
  const reader = read("lib/champions/public.ts")

  assert.match(reader, /import "server-only"/)
  assert.match(reader, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.SUPABASE_SECRET_KEY/)
  assert.match(reader, /get_public_player_canonical_identity/)
  assert.match(reader, /from\("players"\)\.select\("id,screen_name,status,active"\)/)
  assert.match(reader, /buildCanonicalPlayerDisplays/)
  assert.match(reader, /historicalPlayerName/)
  assert.doesNotMatch(reader, /discord_id|discord_name|discord_username|auth_user_id|email/)
})

test("Hall route remains publicly registered while admin routes keep their proxy guard", () => {
  const registry = read("lib/featureVisibility/registry.ts")
  const proxy = read("proxy.ts")

  assert.match(registry, /key: "champions", path: "\/champions", visibility: "live"/)
  assert.match(proxy, /pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)/)
})
