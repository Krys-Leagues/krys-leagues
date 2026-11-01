import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { buildAdminPlayerIdentityDisplay } from "../../lib/adminPlayerIdentityDisplay.ts"

test("canonical player display keeps the public.players UUID and linked Discord ID", () => {
  assert.deepEqual(
    buildAdminPlayerIdentityDisplay(
      { id: "canonical-id", screen_name: "Player", discord_id: "discord-id" },
      undefined,
      undefined,
    ),
    { kind: "canonical", canonicalUuid: "canonical-id", discordId: "discord-id" },
  )
})

test("merged player display preserves original and destination identity details", () => {
  assert.deepEqual(
    buildAdminPlayerIdentityDisplay(
      { id: "original-id", screen_name: "Old Name", discord_id: null },
      { historical_player_id: "original-id", canonical_player_id: "canonical-id" },
      { id: "canonical-id", screen_name: "Current Name", discord_id: null },
    ),
    {
      kind: "merged",
      originalUuid: "original-id",
      destinationUuid: "canonical-id",
      destinationName: "Current Name",
      discordId: null,
    },
  )
})

test("Global Players page exposes admin-only UUID and Discord copy controls", async () => {
  const page = await readFile(new URL("../../app/admin/players/page.tsx", import.meta.url), "utf8")
  assert.match(page, /Canonical UUID/)
  assert.match(page, /Original record UUID/)
  assert.match(page, /DISCORD ID/)
  assert.match(page, /Copy \$\{label\}/)
  assert.match(page, /navigator\.clipboard\.writeText\(value\)/)
  assert.match(page, /from\("player_identity_links"\)/)
})
