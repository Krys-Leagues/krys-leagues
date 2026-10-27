import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

test("protected admin review exposes quarantine and publication gates without mutation controls", async () => {
  const source = await readFile("app/admin/handicaps/page.tsx", "utf8")
  assert.match(source, /DRAFT \/ QUARANTINED/)
  assert.match(source, /All current ratings and indexes are UNPUBLISHED/)
  assert.match(source, /No approval, import, recalculation, rebuild, or publication controls exist/)
  assert.match(source, /PRELIMINARY \/ UNPUBLISHED REVIEW SET/)
})
