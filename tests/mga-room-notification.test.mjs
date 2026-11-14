import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

test("room notifications are dismissed per published assignment version and never block Admin scoring", async () => {
  const source = await readFile(new URL("../components/liveScoring/LiveStudio.tsx", import.meta.url), "utf8")
  assert.match(source, /ROOM_NOTIFICATION_STORAGE_KEY/)
  assert.match(source, /localStorage\.setItem\(ROOM_NOTIFICATION_STORAGE_KEY/)
  assert.match(source, /r\.notification_pending && !dismissedRoomNotificationKeys\.has\(roomNotificationKey\(r\)\)/)
  assert.match(source, /scoring_studio_ack_room_v2/)
  assert.match(source, /!adminOnly && popupRoom && <RoomNotificationPopup/)
})

test("Enter My Score uses the scorecard callback without hash navigation", async () => {
  const source = await readFile(new URL("../components/liveScoring/RoomNotificationPopup.tsx", import.meta.url), "utf8")
  assert.match(source, /event\.preventDefault\(\); onOpenScorecard\(\); onDismiss\(\)/)
})

test("room notification modal cannot overflow horizontally", async () => {
  const source = await readFile(new URL("../components/liveScoring/DemoStudio.module.css", import.meta.url), "utf8")
  assert.match(source, /\.modal\{[^}]*box-sizing:border-box/)
  assert.match(source, /\.modal\{[^}]*max-width:100%/)
  assert.match(source, /\.modal\{[^}]*overflow-x:hidden/)
})
