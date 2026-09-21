import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"

const read = (path: string) => readFileSync(path, "utf8")

test("Global Players browser page uses the protected admin API for table data", () => {
  const page = read("app/admin/players/page.tsx")

  assert.match(page, /fetch\("\/api\/admin\/players", \{ cache: "no-store" \}\)/)
  assert.match(page, /method: "POST"/)
  assert.doesNotMatch(page, /supabase\s*\.from\(/)
  assert.doesNotMatch(page, /\.from\("(?:players|player_league_memberships|player_tournament_entries|player_identity_links|schedule|handicap_rounds|player_career_events)"\)/)
})

test("Global Players GET is site-admin protected and returns the complete directory payload", () => {
  const route = read("app/api/admin/players/route.ts")

  assert.match(route, /export async function GET\(\)[\s\S]*?const authorization = await authorizeSiteAdminMutation\(\)/)
  assert.match(route, /if \(!authorization\.authorized\) return authorization\.response/)
  assert.match(route, /PLAYER_FIELDS = [\s\S]*?id, screen_name, discord_id, discord_name, status, active, avatar_path, is_server_booster, has_krys_server_tag, profile_badges/)
  assert.match(route, /leagueMemberships: membershipsResult\.data/)
  assert.match(route, /tournamentEntries: tournamentsResult\.data/)
  assert.match(route, /identityLinks: identityLinksResult\.data/)
  assert.match(route, /Cache-Control.*no-store/)
  assert.match(route, /createAdminDataClient\(\)/)
})

test("Global Players POST protects every table mutation action", () => {
  const route = read("app/api/admin/players/route.ts")

  assert.match(route, /export async function POST\(request: Request\)[\s\S]*?const authorization = await authorizeSiteAdminMutation\(\)/)
  assert.match(route, /action === "create_player"[\s\S]*?\.from\("players"\)[\s\S]*?\.insert/)
  assert.match(route, /action === "update_status"[\s\S]*?\.from\("players"\)[\s\S]*?\.update/)
  assert.match(route, /action === "add_league_membership"[\s\S]*?\.from\("player_league_memberships"\)[\s\S]*?\.insert/)
  assert.match(route, /action === "add_tournament_entry"[\s\S]*?\.from\("player_tournament_entries"\)[\s\S]*?\.insert/)
  assert.match(route, /action === "import_existing_players"[\s\S]*?importExistingPlayers\(client\)/)
  assert.doesNotMatch(route, /grant\s+(select|insert|update)/i)
})

test("existing protected Discord and profile-recognition RPCs remain intact", () => {
  const page = read("app/admin/players/page.tsx")

  assert.match(page, /supabase\.rpc\("set_site_player_discord_identity"/)
  assert.match(page, /supabase\.rpc\("set_site_player_profile_recognition"/)
  assert.match(page, /p_discord_id: trimmedDiscordId/)
  assert.match(page, /p_profile_badges: recognitionBadges/)
})

test("admin Players fix contains no grants, RLS, SQL, or unrelated page behavior changes", () => {
  const page = read("app/admin/players/page.tsx")
  const route = read("app/api/admin/players/route.ts")

  const unsafeSql = /\bGRANT\s+(SELECT|INSERT|UPDATE|DELETE|USAGE|EXECUTE)\b|CREATE\s+POLICY|ALTER\s+TABLE/i
  assert.doesNotMatch(page, unsafeSql)
  assert.doesNotMatch(route, unsafeSql)
  assert.match(page, /Global Players/)
  assert.match(page, /Import Existing Players/)
  assert.match(page, /setStatusFilter/)
  assert.match(page, /router\.push\(`\/admin\/players\/\$\{player\.id\}`\)/)
})
