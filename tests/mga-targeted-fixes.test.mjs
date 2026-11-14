import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("MGA Room Builder searches authoritative names and blocks duplicate creation", async () => {
  const source = await readFile(new URL("../app/admin/mga/rooms/page.tsx", import.meta.url), "utf8")
  assert.match(source, /mga_regular_room_admin_v1/)
  assert.match(source, /exactRoomMatches/)
  assert.match(source, /mga_regular_room_create_v1/)
  assert.match(source, /normalizeMgaRoomNameInput/)
  assert.match(source, /p_room_name: newMoveRoomName/)
  assert.match(source, /p_room_name: name/)
  assert.match(source, /no second room was created/)
  assert.match(source, /window\.confirm\(`Create \$\{name\}/)
  assert.match(source, /already exists as \$\{duplicateNumber\.room_name\}/)
  assert.doesNotMatch(source, /Create KMGA\$\{snapshot\.next_room_number\}/)
  assert.doesNotMatch(source, /p_room_name: null/)
  assert.match(source, /mga_regular_room_save_v1/)
  assert.match(source, /p_registration_ids: \[\]/)
  assert.match(source, /mga-room-\$\{room\.id\}/)
})

test("MGA Admin publication uses only the audited instance publisher and preserves disabled submissions", async () => {
  const source = await readFile(new URL("../components/liveScoring/LiveStudio.tsx", import.meta.url), "utf8")
  assert.match(source, /scoring_studio_publish_instance_v1/)
  assert.match(source, /p_instance_id: instanceId, p_publish: publish/)
  assert.match(source, /if \(!instanceId \|\| !isAdmin\) return/)
  assert.match(source, /Player score submissions remain disabled/)
  assert.match(source, /publicResults/)
})
