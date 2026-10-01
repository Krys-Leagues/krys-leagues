import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { shouldRenderMastersLiveAnnouncement } from "./mastersLiveAnnouncement.ts"

test("announcement is available on public pages but not private boundary pages", () => {
  assert.equal(shouldRenderMastersLiveAnnouncement("/"), true)
  assert.equal(shouldRenderMastersLiveAnnouncement("/majors/masters"), true)
  assert.equal(shouldRenderMastersLiveAnnouncement("/players"), true)
  assert.equal(shouldRenderMastersLiveAnnouncement("/admin"), false)
  assert.equal(shouldRenderMastersLiveAnnouncement("/admin/majors"), false)
  assert.equal(shouldRenderMastersLiveAnnouncement("/auth/callback"), false)
  assert.equal(shouldRenderMastersLiveAnnouncement("/testing-access"), false)
})

test("public tracker opens on entry and collapse keeps a reusable launcher", async () => {
  const component = await readFile("components/announcements/MastersLiveAnnouncement.tsx", "utf8")
  assert.match(component, /useState\(true\)/u)
  assert.match(component, /if \(!open\)[\s\S]*VIEW LIVE MASTERS SCORE TRACKER/u)
  assert.doesNotMatch(component, /localStorage|sessionStorage/u)
})

test("public live tracker is independently mounted, public, collapsible, and left-side", async () => {
  const component = await readFile("components/announcements/MastersLiveAnnouncement.tsx", "utf8")
  const css = await readFile("components/announcements/MastersLiveAnnouncement.module.css", "utf8")
  const layout = await readFile("app/layout.tsx", "utf8")

  assert.match(component, /LIVE SCORE TRACKER/u)
  assert.match(component, /VIEW LIVE MASTERS SCORE TRACKER/u)
  assert.match(component, /href="\/majors\/masters\/results"/u)
  assert.match(component, /setOpen\(false\)/u)
  assert.match(component, /setOpen\(true\)/u)
  assert.doesNotMatch(component, /localStorage|sessionStorage|supabase|get_my_major_signup_schedule/u)
  assert.doesNotMatch(component, /Signups are now open/u)
  assert.match(css, /\.card,\s*\n\.launcherDock \{[\s\S]*?position: fixed/u)
  assert.match(css, /left: max\(16px, env\(safe-area-inset-left\)\)/u)
  assert.doesNotMatch(css, /right: max\(16px, env\(safe-area-inset-right\)\)/u)
  assert.match(layout, /<MastersLiveAnnouncement \/>/u)
})

test("full tracker closes directly to the public Hub without changing player-detail close behavior", async () => {
  const tracker = await readFile("app/majors/[slug]/results/page.tsx", "utf8")

  assert.match(tracker, /CLOSE LIVE SCORE TRACKER/u)
  assert.match(tracker, /href="\/" replace/u)
  assert.match(tracker, /Close Live Masters Score Tracker and return to the Krys Leagues Hub/u)
  assert.doesNotMatch(tracker, /router\.back\(|history\.back\(/u)
  assert.match(tracker, /selectedRow && <PlayerDetail[\s\S]*onClose=\{\(\) => setSelectedPlayerId\(null\)\}/u)
  assert.match(tracker, /function PlayerDetail[\s\S]*<button ref=\{closeRef\} type="button" onClick=\{onClose\}>CLOSE<\/button>/u)
})
