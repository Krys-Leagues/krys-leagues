import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

const panel = readFileSync(join(process.cwd(), "app/tournaments/[slug]/TournamentRegistrationPanel.tsx"), "utf8")

test("public signup refreshes the authoritative roster after a successful registration", () => {
  assert.match(panel, /fetch\(`\/api\/tournaments\/\$\{tournamentId\}`/)
  assert.match(panel, /setRegistrations\(body\.registrations\)/)
  assert.match(panel, /Registration confirmed\./)
  assert.match(panel, /Already registered/)
})

test("public signup prevents duplicate clicks and preserves failure state", () => {
  assert.match(panel, /if \(busy \|\| confirmed\) return/)
  assert.match(panel, /if \(!response\.ok\) throw new Error/)
  assert.match(panel, /setBusy\(false\)/)
  assert.match(panel, /One canonical Global Player registration per tournament/)
})
