import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../..")
const read = (path) => readFileSync(resolve(root, path), "utf8")

test("homepage keeps the full Course Challenges banner above the full MGA signup banner", () => {
  const page = read("app/page.tsx")
  assert.match(page, /course-challenges\/course-challenges-hub-extension-preview\.png/)
  assert.match(page, /<MgaHomepageBanner \/>/)
  assert.ok(page.indexOf("course-challenges\/course-challenges-hub-extension-preview.png") < page.indexOf("<MgaHomepageBanner />"))
})

test("MGA homepage banner preserves the original asset and full signup route", () => {
  const component = read("components/home/MgaHomepageBanner.tsx")
  const css = read("components/navigation/artwork-navigation.css")
  const page = read("app/page.tsx")
  const mgaCss = css.match(/\.artwork-navigation__mga-link \{[\s\S]*?\n\}/u)?.[0] || ""
  assert.match(component, /href="https:\/\/mga-championship-independent\.vercel\.app\//)
  assert.match(component, /approved-pages\/mga-registration-now-open-approved\.png/)
  assert.doesNotMatch(component, /COMING SOON/i)
  assert.doesNotMatch(component, /mga-status-panel|mga-status-copy|mga-status-cta/u)
  assert.match(mgaCss, /width: min\(100%, 2172px\)/u)
  assert.match(mgaCss, /height: auto/u)
  assert.doesNotMatch(mgaCss, /aspect-ratio:/u)
  assert.doesNotMatch(mgaCss, /border:/u)
  assert.doesNotMatch(mgaCss, /background:/u)
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
  const artwork = readFileSync(resolve(root, "public/approved-pages/mga-registration-now-open-approved.png"))
  assert.equal(createHash("sha256").update(artwork).digest("hex").toUpperCase(), "611720F5213412D575823EEE5CE60B1C035E973D5EBF264AA7C93BB12F39F2C0")
})
