import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const requiredFiles = [
  "app/page.tsx",
  "app/leaderboards/page.tsx",
  "app/players/page.tsx",
  "app/match-play/page.tsx",
  "app/stroke/page.tsx",
  "app/doubles/page.tsx",
  "app/pyp/page.tsx",
  "app/skins/page.tsx",
  "app/amateur-pro/page.tsx",
  "app/tournaments/page.tsx",
  "app/tournaments/current/page.tsx",
  "app/tournaments/history/page.tsx",
  "app/kwt/page.tsx",
  "app/kwt/upcoming/page.tsx",
  "app/kwt/records/page.tsx",
  "app/monthlies/page.tsx",
  "app/champions/page.tsx",
  "app/invitationals/page.tsx",
  "app/majors/page.tsx",
  "app/majors/[slug]/page.tsx",
  "app/admin/page.tsx",
  "app/admin/majors/scheduling/page.tsx",
]

const requiredAssets = [
  "public/main-hub-approved.jpg",
  "public/approved-pages/league-play-approved.png",
  "public/approved-pages/player-profiles-approved.jpg",
  "public/approved-pages/bracket-tournaments-approved.png",
  "public/approved-pages/kwt-hub-approved.png",
  "public/approved-pages/the mga open.jpg",
  "public/approved-pages/gardens-of-babylon-background.png",
  "public/approved-pages/mga-cup.png",
]

test("integrated source contains approved public route surface", () => {
  const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(repoRoot, file)))
  assert.deepEqual(missing, [], `missing approved route files: ${missing.join(", ")}`)
})

test("integrated source contains approved artwork assets", () => {
  const missing = requiredAssets.filter((file) => !fs.existsSync(path.join(repoRoot, file)))
  assert.deepEqual(missing, [], `missing approved assets: ${missing.join(", ")}`)
})

test("leaderboards preserves the approved records route", () => {
  const source = fs.readFileSync(path.join(repoRoot, "app/leaderboards/page.tsx"), "utf8")
  assert.match(source, /redirect\(["']\/records["']\)/)
})

test("KWT artwork keeps all four public destinations", () => {
  const source = fs.readFileSync(path.join(repoRoot, "lib/artworkPageMaps.ts"), "utf8")
  for (const route of ["/kwt/upcoming", "/kwt/records", "/champions?league=kwt&from=kwt"]) {
    assert.ok(source.includes(route), `missing KWT destination ${route}`)
  }
})

test("homepage exposes the live MGA Open entry artwork", () => {
  const source = fs.readFileSync(path.join(repoRoot, "app/page.tsx"), "utf8")
  assert.match(source, /href="\/majors\/major-2"/)
  assert.match(source, /approved-pages\/the mga open\.jpg/)
})
