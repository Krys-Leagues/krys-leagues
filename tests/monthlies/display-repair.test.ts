import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("Monthly Back keeps the existing controls and receives pointer priority", () => {
  const page = read("app/monthlies/page.tsx")
  const styles = read("app/monthlies/page.module.css")
  const artworkMap = read("lib/artworkPageMaps.ts")

  assert.match(page, /monthlyArtwork/)
  assert.match(page, /Previous Month/)
  assert.match(page, /Next Month/)
  assert.match(styles, /\.page :global\(\.artwork-navigation__targets\)\s*\{[\s\S]*z-index:\s*3;/)
  assert.match(artworkMap, /id: "back-to-krys-leagues", label: "Back to Krys Leagues", href: "\//)
})

test("Monthly keeps the approved proportional layout and masks the baked Division artifact", () => {
  const page = read("app/monthlies/page.tsx")
  const styles = read("app/monthlies/page.module.css")

  assert.match(page, /selection\.year/)
  assert.match(page, /monthOptionsForYear/)
  assert.match(page, /divisionOptionsForSelection/)
  assert.match(page, /data-monthly-results="expanded"/)
  assert.match(styles, /\.page\s*\{[\s\S]*min-height:\s*0;[\s\S]*padding-bottom:\s*24px;/)
  assert.match(styles, /\.page :global\(\.artwork-navigation\)\s*\{[\s\S]*min-height:\s*0;[\s\S]*padding:\s*0;/)
  assert.match(styles, /\.page :global\(\.artwork-navigation__targets\)\s*\{[\s\S]*pointer-events:\s*none;/)
  assert.match(styles, /\.page :global\(\.artwork-navigation__target\)\s*\{[\s\S]*pointer-events:\s*auto;/)
  assert.match(styles, /\.artworkValueMask\s*\{[\s\S]*pointer-events:\s*none;/)
  assert.match(styles, /\.yearValueMask\s*\{[\s\S]*top:\s*16%;[\s\S]*left:\s*19%;[\s\S]*width:\s*20%;[\s\S]*height:\s*68%;/)
  assert.match(styles, /\.monthValueMask\s*\{[\s\S]*left:\s*12%;[\s\S]*width:\s*40%;/)
  assert.match(styles, /\.divisionValueMask\s*\{[\s\S]*left:\s*18%;[\s\S]*width:\s*28%;/)
  assert.match(styles, /\.yearSelectedValue\s*\{[\s\S]*padding-left:\s*21%;/)
  assert.match(styles, /\.status,\s*\.resultsShell\s*\{[\s\S]*margin:\s*18px auto 0;/)
  assert.doesNotMatch(styles, /min-height:\s*100vh|height:\s*100vh|margin-top:\s*-/)
})

test("Monthly uses the exact approved PNG and not a retired presentation asset", () => {
  const artworkMap = read("lib/artworkPageMaps.ts")
  const artwork = readFileSync("public/approved-pages/monthly-results-approved.png")

  assert.match(artworkMap, /imageSrc:\s*["']\/approved-pages\/monthly-results-approved\.png["']/)
  assert.doesNotMatch(artworkMap, /monthly-results-approved\.(?:jpg|webp)/i)
  assert.equal(createHash("sha256").update(artwork).digest("hex"), "81009534555c63691e9c62e31fabafdbb9da86cb4cbc80f9013b6ea64aca92e4")
})
