import { existsSync, readFileSync } from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const productionFlag = args.indexOf("--production-commit")
const productionCommit = productionFlag >= 0 ? args[productionFlag + 1] : process.env.PRODUCTION_COMMIT_SHA
const errors = []

const source = (relativePath) => readFileSync(resolve(root, relativePath), "utf8")
const requireSource = (relativePath, fragments) => {
  const value = source(relativePath)
  for (const fragment of fragments) {
    if (!value.includes(fragment)) errors.push(`${relativePath} is missing approved marker ${JSON.stringify(fragment)}`)
  }
}

requireSource("app/page.tsx", ["ArtworkNavigation", "mainHubArtwork"])
requireSource("app/league-play/page.tsx", ["ArtworkNavigation", "leaguePlayArtwork"])
requireSource("app/join/page.tsx", ["ArtworkNavigation", "joinArtwork"])
requireSource("app/kwt/page.tsx", ["ArtworkNavigation", "kwtArtwork"])
requireSource("lib/artworkPageMaps.ts", ['id: "main-hub"', 'id: "league-play"', 'id: "join-leagues"', 'id: "kwt-hub"'])
requireSource("components/navigation/ArtworkNavigation.tsx", ["data-approved-artwork-page={definition.id}", "artwork-navigation__overlay"])

for (const asset of [
  "public/main-hub-approved.jpg",
  "public/approved-pages/league-play-approved.png",
  "public/approved-pages/join-leagues-approved.jpg",
  "public/approved-pages/kwt-hub-approved.jpg",
]) {
  if (!existsSync(resolve(root, asset))) errors.push(`Required approved artwork asset is missing: ${asset}`)
}

if (!productionCommit) {
  errors.push("Production commit ancestry input is required (--production-commit SHA or PRODUCTION_COMMIT_SHA).")
} else if (!/^[0-9a-f]{40}$/i.test(productionCommit)) {
  errors.push(`Invalid Production commit SHA: ${productionCommit}`)
} else {
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", productionCommit, "HEAD"], { cwd: root })
  if (ancestry.status !== 0) errors.push(`HEAD is not descended from Production commit ${productionCommit}.`)
}

if (errors.length > 0) {
  console.error("BLOCKED: approved artwork release guard failed.")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
console.log(`READY: approved Main Hub, League Play, Join, and KWT markers present; HEAD ${head} descends from Production ${productionCommit}.`)
