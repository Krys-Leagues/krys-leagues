import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const nav = readFileSync("components/PlayerProfileNavLink.tsx", "utf8")
const welcome = readFileSync("components/auth/OptionalSignInWelcome.tsx", "utf8")
const discordButton = readFileSync("components/auth/DiscordSignInButton.tsx", "utf8")
const modal = readFileSync("components/auth/SignInRequiredModal.tsx", "utf8")
const profile = readFileSync("app/players/[id]/page.tsx", "utf8")
const courseLanding = readFileSync("components/course-challenges/CourseChallengesLanding.tsx", "utf8")

test("signed-out Player Profile navigation stays public and opens the directory", () => {
  assert.match(nav, /if \(!resolved\.authenticated \|\| !resolved\.canonicalId\)/)
  assert.match(nav, /router\.push\(href\)/)
  assert.doesNotMatch(nav, /Your canonical player profile could not be resolved/)
})

test("first-visit welcome is optional, session-scoped, and uses the existing OAuth callback", () => {
  assert.match(welcome, /CONTINUE WITHOUT SIGNING IN/)
  assert.match(welcome, /sessionStorage/)
  assert.match(welcome, /startDiscordSignIn/)
  assert.match(welcome, /pathname\.startsWith\("\/admin"\)/)
  assert.doesNotMatch(welcome, /players\.insert|create.*player/i)
})

test("signed-out public pages use a small self-hiding Discord sign-in control", () => {
  assert.match(discordButton, /aria-label="Sign in with Discord"/)
  assert.match(discordButton, /title="Sign in with Discord"/)
  assert.match(discordButton, /setSignedIn\(Boolean\(session\)\)/)
  assert.match(discordButton, /createDiscordAuthCallbackUrl\("player"/)
})

test("owner actions have an authentication gate while public viewers remain read-only", () => {
  assert.match(modal, /SIGN IN WITH DISCORD/)
  assert.match(modal, /NOT NOW/)
  assert.match(profile, /viewerState === "signed-out"/)
  assert.match(profile, /viewerState === "signed-in-unlinked"/)
  assert.match(profile, /canEditProfile \&\& <PlayerProfileEditor/)
  assert.match(profile, /canEditProfile \&\& <button/)
  assert.match(profile, /current_user_canonical_player_id/)
})

test("Course Challenges uses the shared public-safe Player Profile navigation", () => {
  assert.match(courseLanding, /PlayerProfileNavLink/)
  assert.doesNotMatch(courseLanding, /openOwnProfile|canonical player profile could not be resolved/)
})
