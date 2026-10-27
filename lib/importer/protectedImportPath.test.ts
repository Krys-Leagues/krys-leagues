import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
}

test("browser import identity readers use the protected admin directory", () => {
  const files = [
    read("lib/importer/loadPlayers.ts"),
    read("lib/importer/loadPlayerAliases.ts"),
    read("lib/importer/loadPlayerIdentityLinks.ts"),
  ]

  for (const source of files) {
    assert.match(source, /fetch\("\/api\/admin\/players"/)
    assert.doesNotMatch(source, /createClient\(/)
  }
})

test("protected import staging receives a server client only after site-admin authorization", () => {
  const route = read("app/api/import/run/route.ts")
  const runner = read("lib/importer/runImport.ts")
  const batch = read("lib/importer/createImportBatch.ts")
  const rows = read("lib/importer/saveImportRows.ts")

  assert.ok(route.indexOf("await authorizeSiteAdminMutation()") < route.indexOf("createAdminDataClient()"))
  assert.match(route, /runImport\(body, createAdminDataClient\(\)\)/)
  assert.match(runner, /import "server-only"/)
  assert.match(runner, /createImportBatch\([\s\S]*client\)/)
  assert.match(runner, /saveImportRows\([\s\S]*client/)
  assert.match(runner, /loadPlayersWithClient\(client\)/)
  assert.match(runner, /loadPlayerAliasesWithClient\(client\)/)
  assert.doesNotMatch(batch, /createClient\(/)
  assert.doesNotMatch(rows, /createClient\(/)
})

test("the protected admin payload supplies complete verified alias metadata", () => {
  const route = read("app/api/admin/players/route.ts")

  assert.match(route, /select\("id, player_id, alias, normalized_alias, source, verified"\)/)
  assert.match(route, /\.eq\("verified", true\)/)
  assert.match(route, /aliases: aliasesResult\.data \|\| \[\]/)
})
