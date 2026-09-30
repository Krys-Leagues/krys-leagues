import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("successful Discord player login opens the protected personalized dashboard", () => {
  const callback = read("app/auth/callback/page.tsx")
  const accessDenied = read("app/access-denied/AccessDeniedActions.tsx")
  const adminLayout = read("app/admin/layout.tsx")

  assert.match(callback, /router\.replace\("\/player-dashboard"\)/)
  assert.match(accessDenied, /router\.replace\("\/player-dashboard"\)/)
  assert.match(adminLayout, /router\.replace\("\/player-dashboard"\)/)
  assert.doesNotMatch(callback, /router\.replace\("\/dashboard"\)/)
})

test("admin navigation never opens managed Stroke pages without required context", () => {
  const commandCenter = read("app/admin/command-center/page.tsx")
  const transition = read("app/admin/stroke/transition/page.tsx")
  const legacyResults = read("app/admin/results/page.tsx")

  assert.doesNotMatch(commandCenter, /href: "\/admin\/stroke\/(?:setup|results|standings)"/)
  assert.match(commandCenter, /href: "\/admin\/stroke\/season"/)
  assert.match(commandCenter, /href: "\/admin\/stroke\/manage"/)
  assert.match(transition, /\/admin\/stroke\/standings\?seasonId=/)
  assert.match(legacyResults, /href="\/admin\/stroke\/manage"/)
})

test("the player identity hub exposes the existing protected Discord matcher", () => {
  const identityHub = read("app/admin/player-identity/page.tsx")

  assert.match(identityHub, /href="\/admin\/player-matching"/)
  assert.doesNotMatch(identityHub, /<strong>Discord Links<\/strong>\s*<span>Coming Soon<\/span>/)
})
