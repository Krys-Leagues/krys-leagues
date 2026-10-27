import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { shouldRenderMastersLiveAnnouncement } from "./mastersLiveAnnouncement.ts"

test("announcement is scoped to the Players Hub only", () => {
  assert.equal(shouldRenderMastersLiveAnnouncement("/"), true)
  for (const path of ["/majors/masters", "/players", "/admin", "/admin/majors", "/auth/callback", "/testing-access", "/course-challenges"]) {
    assert.equal(shouldRenderMastersLiveAnnouncement(path), false, path)
  }
})

test("public final-results pop-up opens on entry and collapse keeps a reusable launcher", async () => {
  const component = await readFile("components/announcements/MastersLiveAnnouncement.tsx", "utf8")
  assert.match(component, /useState\(true\)/u)
  assert.match(component, /if \(!open\)[\s\S]*VIEW MASTERS FINAL RESULTS/u)
  assert.doesNotMatch(component, /localStorage|sessionStorage/u)
})

test("legacy final-results popup remains intact but is no longer mounted beside the signup action", async () => {
  const component = await readFile("components/announcements/MastersLiveAnnouncement.tsx", "utf8")
  const css = await readFile("components/announcements/MastersLiveAnnouncement.module.css", "utf8")
  const layout = await readFile("app/layout.tsx", "utf8")
  const home = await readFile("app/page.tsx", "utf8")

  assert.match(component, /FINAL RESULTS/u)
  assert.match(component, /VIEW MASTERS FINAL RESULTS/u)
  assert.match(component, /href="\/majors\/masters\/results"/u)
  assert.match(component, /setOpen\(false\)/u)
  assert.match(component, /setOpen\(true\)/u)
  assert.doesNotMatch(component, /localStorage|sessionStorage|supabase|get_my_major_signup_schedule/u)
  assert.doesNotMatch(component, /Signups are now open/u)
  assert.match(css, /\.card \{[\s\S]*?position: fixed/u)
  assert.match(css, /\.launcherDock \{[\s\S]*?position: static/u)
  assert.match(css, /left: max\(16px, (?:calc\([^\n]+\)|env\(safe-area-inset-left\))\)/u)
  assert.doesNotMatch(css, /right: max\(16px, env\(safe-area-inset-right\)\)/u)
  assert.doesNotMatch(home, /<MastersLiveAnnouncement \/>/u)
  assert.doesNotMatch(layout, /MastersLiveAnnouncement/u)
})

test("full tracker closes directly to the public Hub without changing player-detail close behavior", async () => {
  const tracker = await readFile("app/majors/[slug]/results/page.tsx", "utf8")

  assert.match(tracker, /CLOSE FINAL RESULTS/u)
  assert.match(tracker, /href="\/" replace/u)
  assert.match(tracker, /Close Masters Final Results and return to the Krys Leagues Hub/u)
  assert.doesNotMatch(tracker, /router\.back\(|history\.back\(/u)
  assert.match(tracker, /selectedRow && <PlayerDetail[\s\S]*onClose=\{\(\) => setSelectedPlayerId\(null\)\}/u)
  assert.match(tracker, /function PlayerDetail[\s\S]*<button ref=\{closeRef\} type="button" onClick=\{onClose\}>CLOSE<\/button>/u)
})

test("the legacy Masters popup is no longer mounted because the signup position owns the single tournament action", async () => {
  const home = await readFile("app/page.tsx", "utf8")
  const youtube = await readFile("components/announcements/YouTubeLiveLauncher.tsx", "utf8")
  assert.doesNotMatch(home, /<MastersLiveAnnouncement \/>/u)
  assert.match(home, /<YouTubeLiveLauncher \/>/u)
  assert.match(youtube, /WATCH KRYS LEAGUES ON YOUTUBE/u)
})
