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

test("MGA homepage banner preserves the original asset and compact signup route", () => {
  const component = read("components/home/MgaHomepageBanner.tsx")
  const css = read("components/navigation/artwork-navigation.css")
  const page = read("app/page.tsx")
  const mgaCss = css.match(/\.artwork-navigation__mga-link \{[\s\S]*?\n\}/u)?.[0] || ""
  assert.match(component, /href="\/majors\/major-2"/)
  assert.match(component, /approved-pages\/the mga open registration nov 1st\.png/)
  assert.match(component, /width=\{2172\}/u)
  assert.match(component, /height=\{724\}/u)
  assert.match(component, /<Link[\s\S]*href="\/majors\/major-2"/u)
  assert.doesNotMatch(component, /<section[\s\S]*artwork-navigation__mga-section/u)
  assert.doesNotMatch(component, /COMING SOON/i)
  assert.doesNotMatch(component, /mga-status-panel|mga-status-copy|mga-status-cta/u)
  assert.match(mgaCss, /width: 50%/u)
  assert.match(mgaCss, /aspect-ratio: 2048 \/ 430/u)
  assert.doesNotMatch(mgaCss, /border:/u)
  assert.doesNotMatch(mgaCss, /background:/u)
  assert.doesNotMatch(css, /artwork-navigation__mga-section/u)
  assert.doesNotMatch(css, /mga-status-panel|mga-status-title|mga-status-copy|mga-status-cta/u)
  assert.ok(page.indexOf("<MgaHomepageBanner />") < page.indexOf("<YouTubeLiveLauncher />"))
  assert.ok(page.indexOf("<YouTubeLiveLauncher />") < page.indexOf("ADMIN LOGIN"))
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
  const artwork = readFileSync(resolve(root, "public/approved-pages/the mga open registration nov 1st.png"))
  assert.equal(createHash("sha256").update(artwork).digest("hex").toUpperCase(), "4E16EA16AD3CAD95692DD80822443DD37E97963ECCE182547DE8136BCB5C3056")
  const previousArtwork = readFileSync(resolve(root, "public/approved-pages/the mga open.jpg"))
  assert.equal(createHash("sha256").update(previousArtwork).digest("hex").toUpperCase(), "35E66D4F0A386CBFA0689B980BD3AA0B8D3204C0619A40FD16060A47013296FD")
})
