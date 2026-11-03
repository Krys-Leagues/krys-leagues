import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const routePath = new URL("./route.ts", import.meta.url)

test("bridge route is server-only, fixed to 5-4-3-2-1, and creation-gated", async () => {
  const source = await readFile(routePath, "utf8")

  assert.match(source, /import ["']server-only["']/)
  assert.match(source, /const TOURNAMENT_ID = ["']061208d4-1374-40f5-a56e-e1e3aa5f6159["']/)
  assert.match(source, /TOURNAMENT_DISCORD_BRIDGE_CREATE_ENABLED !== ["']true["']/)
  assert.match(source, /authorization_required|authentication_required/)
  assert.doesNotMatch(source, /process\.env\.DISCORD_BOT_TOKEN/)
})
