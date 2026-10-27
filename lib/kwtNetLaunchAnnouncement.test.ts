import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { shouldRenderKwtNetLaunchAnnouncement } from "./kwtNetLaunchAnnouncement.ts"

const component = readFileSync("components/announcements/KwtNetLaunchAnnouncement.tsx", "utf8")
const layout = readFileSync("app/layout.tsx", "utf8")
const css = readFileSync("components/announcements/KwtNetLaunchAnnouncement.module.css", "utf8")

test("KWT NET launch announcement is scoped to a safe first-visit homepage", () => {
  assert.equal(shouldRenderKwtNetLaunchAnnouncement("/"), true)
  assert.equal(shouldRenderKwtNetLaunchAnnouncement("/admin"), false)
  assert.equal(shouldRenderKwtNetLaunchAnnouncement("/register"), false)
  assert.equal(shouldRenderKwtNetLaunchAnnouncement("/scorecards"), false)
  assert.match(component, /localStorage/)
  assert.match(component, /KWT_NET_LAUNCH_ANNOUNCEMENT_DISMISSAL_KEY/)
  assert.match(component, /VIEW KWT NET LEADERBOARD/)
  assert.match(component, /green-kiwi-sticker\.png/)
  assert.match(component, /gold-kiwi-sticker\.png/)
  assert.match(component, /coconut-sticker\.png/)
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /event\.key === "Escape"/)
  assert.match(layout, /<KwtNetLaunchAnnouncement \/>/)
  assert.match(css, /@media\(max-width:600px\)/)
})
