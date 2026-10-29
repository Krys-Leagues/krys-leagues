import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildExistingKwtHistoryInventory } from "./loadKwtExistingHistory.ts"

test("Season 9 KWT review loads existing history through the protected server route", async () => {
  const page = await readFile(new URL("../../app/admin/kwt-import/discord-season-9/KwtDiscordIdentityReview.tsx", import.meta.url), "utf8")
  const route = await readFile(new URL("../../app/api/admin/kwt/season-9/inventory/route.ts", import.meta.url), "utf8")
  const loader = await readFile(new URL("./loadKwtExistingHistory.ts", import.meta.url), "utf8")

  assert.match(page, /fetch\("\/api\/admin\/kwt\/season-9\/inventory"/)
  assert.doesNotMatch(page, /loadExistingKwtHistoryInventory\(\)/)
  assert.doesNotMatch(page, /from\(["']kwt_raw_scores["']\)/)
  assert.doesNotMatch(loader, /from\(["']kwt_raw_scores["']\)/)
  assert.match(route, /authorizeSiteAdminMutation/)
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY\s+\|\|\s+process\.env\.SUPABASE_SECRET_KEY/)
  assert.match(route, /from\(table\)\.select\("\*"\)/)
  assert.match(route, /KWT_EXISTING_HISTORY_TABLES/)
  assert.match(loader, /kwt_raw_scores/)
  assert.match(route, /buildExistingKwtHistoryInventory/)
})

test("KWT inventory response preserves the review data shape and stored scores", () => {
  const inventory = buildExistingKwtHistoryInventory([
    {
      table: "kwt_raw_scores",
      data: [{ season: 9, week: 3, player_id: "player-1", easy_score: -7, source_fingerprint: "source-1" }],
      error: null,
    },
  ])

  assert.deepEqual(inventory, {
    records: [{ season: 9, week: 3, player_id: "player-1", easy_score: -7, source_fingerprint: "source-1", _inventory_table: "kwt_raw_scores", _inventory_season: 9, _inventory_week: 3 }],
    errors: [],
    tableCounts: { kwt_raw_scores: { "9": 1 } },
    truncatedAt: 20000,
  })
})
