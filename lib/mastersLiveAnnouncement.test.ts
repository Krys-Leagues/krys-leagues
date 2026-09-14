import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { MASTERS_LIVE_ANNOUNCEMENT_KEY, shouldRenderMastersLiveAnnouncement } from "./mastersLiveAnnouncement.ts"

test("Masters announcement uses a versioned browser-only campaign key", () => {
  assert.equal(MASTERS_LIVE_ANNOUNCEMENT_KEY, "krys-leagues:masters-live-announcement-v1")
})

test("announcement is available on public pages but not private boundary pages", () => {
  assert.equal(shouldRenderMastersLiveAnnouncement("/"), true)
  assert.equal(shouldRenderMastersLiveAnnouncement("/majors/masters"), true)
  assert.equal(shouldRenderMastersLiveAnnouncement("/players"), true)
  assert.equal(shouldRenderMastersLiveAnnouncement("/admin"), false)
  assert.equal(shouldRenderMastersLiveAnnouncement("/admin/majors"), false)
  assert.equal(shouldRenderMastersLiveAnnouncement("/auth/callback"), false)
  assert.equal(shouldRenderMastersLiveAnnouncement("/testing-access"), false)
})

test("announcement copy, destination, and client-only dismissal are wired", async () => {
  const component = await readFile("components/announcements/MastersLiveAnnouncement.tsx", "utf8")
  const layout = await readFile("app/layout.tsx", "utf8")

  assert.match(component, /THE MINI-GOLF MASTERS IS LIVE! 🌸⛳/u)
  assert.match(component, /className=\{styles\.jacketIcon\}/u)
  assert.match(component, /🧥/u)
  assert.match(component, /Players of ALL skill levels are welcome in The Masters\./u)
  assert.match(component, /Signups are now open\. Choose your times for all four rounds/u)
  assert.match(component, /href="\/majors\/masters"/u)
  assert.match(component, /localStorage/u)
  assert.match(layout, /<MastersLiveAnnouncement \/>/u)
})
