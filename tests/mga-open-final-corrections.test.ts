import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import assert from "node:assert/strict"

const root = resolve(import.meta.dirname, "..")
const signupPage = readFileSync(resolve(root, "app/majors/[slug]/page.tsx"), "utf8")
const signupCss = readFileSync(resolve(root, "app/majors/[slug]/page.module.css"), "utf8")

test("MGA Open uses the approved Gardens of Babylon display and continuous slot picker", () => {
  assert.match(signupPage, /Gardens of Babylon Easy/u)
  assert.match(signupPage, /Gardens of Babylon Hard/u)
  assert.match(signupPage, /Choose Your Time Slot/u)
  assert.match(signupPage, /slotNumbers\.get\(slot\.id\)/u)
  assert.match(signupPage, /ALL SKILL LEVELS WELCOME!/u)
  assert.match(signupCss, /url\("\/approved-pages\/gardens-of-babylon-background\.png"\)/u)
  assert.match(signupCss, /\.slotSelect\s*\{/u)
})

test("MGA Open artwork is the previously approved asset", () => {
  const artwork = readFileSync(resolve(root, "public/approved-pages/the mga open.jpg"))
  assert.equal(
    createHash("sha256").update(artwork).digest("hex").toUpperCase(),
    "35E66D4F0A386CBFA0689B980BD3AA0B8D3204C0619A40FD16060A47013296FD",
  )
})

test("MGA Open uses the supplied trophy with transparent background", () => {
  const trophy = readFileSync(resolve(root, "public/approved-pages/mga-cup.png"))
  assert.equal(
    createHash("sha256").update(trophy).digest("hex").toUpperCase(),
    "692B2F5E12B3A2432E328D65AFA4E07ADAAF4249793D328A83AAA159DB1B6D8D",
  )
  assert.match(signupPage, /approved-pages\/mga-cup\.png/u)
  assert.match(signupPage, /className=\{styles\.mgaCup\}/u)
})

test("MGA Open keeps player-facing copy clean and does not expose a personal VIP badge", () => {
  assert.match(signupPage, /The MGA Open — Four rounds, November 12–15, 2026\./u)
  assert.match(signupPage, /const displayDescription = mgaOpen/u)
  assert.match(signupPage, /!mgaOpen && <p className=\{styles\.meta\}/u)
  assert.match(signupPage, /signupState === "priority" \? "Priority registration"/u)
  assert.match(signupPage, /signupState === "priority" \? "priority" : signupState/u)
  assert.doesNotMatch(signupPage, /Staging configuration; Production registration remains closed\./u)
  assert.doesNotMatch(signupPage, />Priority signup is open for eligible previous-Major players\./u)
})

test("MGA priority registration leaves the signup form usable for eligible VIP players", () => {
  assert.match(signupPage, /signupState !== "open" && signupState !== "priority"/u)
  assert.doesNotMatch(signupPage, /const signupDisabled = priorityWindow/u)
  assert.match(signupPage, /The RPC remains the source of truth for eligibility/u)
})

test("MGA Open uses the supplied Gardens of Babylon screenshot as the page background", () => {
  assert.doesNotMatch(signupPage, /mgaFeature/u)
  assert.match(signupCss, /url\("\/approved-pages\/gardens-of-babylon-background\.png"\)/u)
  assert.match(signupCss, /background-attachment: fixed/u)
  assert.match(signupCss, /\.mga \.contentCard,\s*\.mga \.signupCard[\s\S]*background: rgba\(3, 17, 24, 0\.42\)/u)
})

test("MGA Open background asset preserves the supplied source bytes", () => {
  const artwork = readFileSync(resolve(root, "public/approved-pages/gardens-of-babylon-background.png"))
  assert.equal(
    createHash("sha256").update(artwork).digest("hex").toUpperCase(),
    "FB96B707EF834DDE5672CBF9ED3A67DE5A3DA354263FEC7F78501DA12F12AEE8",
  )
})

test("MGA Open keeps the approved course section and removes only the duplicate signup introduction", () => {
  assert.match(signupPage, /You are signing up to play four rounds/u)
  assert.match(signupPage, /Gardens of Babylon Easy/u)
  assert.match(signupPage, /Gardens of Babylon Hard/u)
  assert.match(signupPage, /Player-local time:/u)
  assert.match(signupPage, /General registration opens/u)
  assert.match(signupPage, /YOU ARE SIGNING UP FOR THE MGA OPEN/u)
  assert.match(signupPage, /The MGA Open is our second Major Championship/u)
  assert.match(signupPage, /Choose your preferred playing time for each round\./u)
  assert.match(signupPage, /!mgaOpen && <p className=\{styles\.lockDeadline\}/u)
  assert.match(signupPage, /const dateShift = mgaOpen \? ""/u)
  assert.doesNotMatch(signupPage, /Your job right now/u)
  assert.doesNotMatch(signupPage, /Choose one preferred playing time for each of the four rounds/u)
  assert.doesNotMatch(signupPage, /Your Thursday, Friday, Saturday, and Sunday choices are independent\./u)
  assert.doesNotMatch(signupPage, /event\.signup_instructions/u)
  assert.doesNotMatch(signupPage, /Choose one independent time for Thursday, Friday, Saturday, and Sunday\./u)
})

test("MGA Open outer and inner panels remain translucent for background visibility", () => {
  assert.match(signupCss, /\.mga \.hero[\s\S]*rgba\(3, 18, 26, 0\.3\)/u)
  assert.match(signupCss, /\.mga \.contentCard,\s*\.mga \.signupCard[\s\S]*rgba\(3, 17, 24, 0\.42\)/u)
  assert.match(signupCss, /\.mga \.dayCard[\s\S]*rgba\(4, 24, 31, 0\.5\)/u)
})
