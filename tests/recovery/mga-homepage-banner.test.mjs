import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

test("homepage keeps Course Challenges above the compact MGA signup banner", () => {
  const page = read("app/page.tsx")
  assert.match(page, /course-challenges\/course-challenges-hub-extension-preview\.png/)
  assert.match(page, /<MgaHomepageBanner \/>/)
  assert.ok(page.indexOf("course-challenges\/course-challenges-hub-extension-preview.png") < page.indexOf("<MgaHomepageBanner />"))
})

test("MGA homepage banner preserves the original asset and signup route", () => {
  const component = read("components/home/MgaHomepageBanner.tsx")
  const css = read("components/navigation/artwork-navigation.css")
  assert.match(component, /href="\/majors\/major-2"/)
  assert.match(component, /approved-pages\/the mga open\.jpg/)
  assert.match(component, /General registration opens/)
  assert.match(component, /VIP priority registration is open for eligible Masters finalists/)
  assert.doesNotMatch(component, /COMING SOON/i)
  assert.match(css, /\.artwork-navigation__mga-link[\s\S]*aspect-ratio: 2048 \/ 430/)
  assert.match(css, /\.artwork-navigation__mga-status-panel[\s\S]*background: rgba\(4, 8, 23, 0\.96\)/)
})

test("MGA homepage status is personalized only after authenticated eligibility checks", () => {
  const route = read("app/api/majors/home-banner/route.ts")
  assert.match(route, /createServerSupabaseClient/)
  assert.match(route, /current_user_canonical_player_id/)
  assert.match(route, /major_final_placements/)
  assert.match(route, /weekend_field === "main"/)
  assert.match(route, /field_placement.*<= 10/)
  assert.match(route, /result_status === "completed"/)
  assert.match(route, /is_finalized/)
  assert.doesNotMatch(route, /insert\s+into|update\s+public\.|delete\s+from/i)
})

test("approved MGA artwork bytes remain unchanged in the candidate", () => {
  const artwork = readFileSync(resolve(root, "public/approved-pages/the mga open.jpg"))
  assert.equal(createHash("sha256").update(artwork).digest("hex").toUpperCase(), "35E66D4F0A386CBFA0689B980BD3AA0B8D3204C0619A40FD16060A47013296FD")
})
