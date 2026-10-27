import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import test from "node:test"

import { isMastersWinnerVideoActive, MASTERS_WINNER_VIDEO_EXPIRES_AT, MASTERS_WINNER_VIDEO_PATH } from "./mastersWinnerVideo.ts"

test("the winner presentation is active for the configured window and then expires", () => {
  const expiresAt = Date.parse(MASTERS_WINNER_VIDEO_EXPIRES_AT)
  assert.ok(isMastersWinnerVideoActive(expiresAt - 1))
  assert.equal(isMastersWinnerVideoActive(expiresAt), false)
})

test("the exact supplied winner video is installed byte-for-byte", async () => {
  const video = await readFile(`public${MASTERS_WINNER_VIDEO_PATH}`)
  const details = await stat(`public${MASTERS_WINNER_VIDEO_PATH}`)
  assert.equal(details.size, 41750047)
  assert.equal(createHash("sha256").update(video).digest("hex"), "9ecee7fa0915325fd42f3db57ab89269f11f83d788048153f8cdeee24ef04cab")
})

test("the feature is mounted only on the Players Hub and preserves existing announcements", async () => {
  const home = await readFile("app/page.tsx", "utf8")
  const component = await readFile("components/announcements/MastersWinnerVideo.tsx", "utf8")
  const navigationCss = await readFile("components/navigation/artwork-navigation.css", "utf8")

  assert.match(home, /<MastersWinnerVideo \/>/u)
  assert.match(home, /artwork-navigation__masters-link/u)
  assert.match(home, /THE MGA OPEN/u)
  assert.match(home, /COMING SOON/u)
  assert.match(home, /disabled/u)
  assert.doesNotMatch(home, /CupSignupAnnouncement/u)
  assert.doesNotMatch(home, /<MastersLiveAnnouncement \/>/u)
  assert.match(home, /<YouTubeLiveLauncher \/>/u)
  assert.match(component, /MASTERS_WINNER_VIDEO_PATH/u)
  assert.match(component, /preload="metadata"/u)
  assert.match(component, /playsInline/u)
  assert.match(component, /WATCH AGAIN/u)
  assert.match(component, /localStorage/u)
  assert.match(component, /video\.play\(\)/u)
  assert.match(component, /type VideoMode = "minimized" \| "open"/u)
  assert.match(component, /className=\{styles\.minimized\}/u)
  assert.match(component, /className=\{styles\.overlay\}/u)
  assert.match(navigationCss, /\.artwork-navigation__hub-after-frame-layout\s*\{[\s\S]*display: block[\s\S]*width: min\(100%, 760px\)/u)
  assert.match(navigationCss, /\.artwork-navigation__course-challenges-preview-banner\s*\{[\s\S]*width: 100%/u)
  assert.doesNotMatch(component, /setInterval|loop=|fetch\(/u)
})

test("the client feature handles blocked autoplay without retrying automatically", async () => {
  const component = await readFile("components/announcements/MastersWinnerVideo.tsx", "utf8")
  assert.match(component, /markWinnerVideoSeen\(\)[\s\S]*video\.play\(\)/u)
  assert.match(component, /playback === "blocked"[\s\S]*PLAY PRESENTATION/u)
  assert.match(component, /video\.muted = true/u)
  assert.match(component, /video\.muted = false/u)
})
