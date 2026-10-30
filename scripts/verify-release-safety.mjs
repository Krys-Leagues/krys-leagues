import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(resolve(root, "release/isolated-development-manifest.json"), "utf8"))
const args = process.argv.slice(2)
const valueFor = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
const baseline = valueFor("--baseline") || manifest.centralBaselineCommit
const expectedCommit = valueFor("--commit")
const errors = []
const git = (list) => execFileSync("git", list, { cwd: root, encoding: "utf8" }).trim()
const source = (file) => readFileSync(resolve(root, file), "utf8")

if (!/^[0-9a-f]{40}$/i.test(baseline)) errors.push(`Invalid baseline commit: ${baseline}`)
if (git(["status", "--porcelain=v1"])) errors.push("Candidate worktree is not clean; commit or preserve the changes before verification.")
const head = git(["rev-parse", "HEAD"])
if (expectedCommit && head.toLowerCase() !== expectedCommit.toLowerCase()) errors.push(`HEAD ${head} does not match expected candidate ${expectedCommit}.`)
if (spawnSync("git", ["merge-base", "--is-ancestor", baseline, "HEAD"], { cwd: root }).status !== 0) errors.push(`Candidate HEAD is not descended from approved baseline ${baseline}.`)
const migrationDiff = git(["diff", "--name-status", `${baseline}..HEAD`, "--", "supabase/migrations"])
if (migrationDiff) {
  const reviewed = new Map((manifest.reviewedStagingMigrations || []).map((item) => [item.file, item]))
  for (const line of migrationDiff.split(/\r?\n/).filter(Boolean)) {
    const [status, file] = line.split(/\s+/, 2)
    const record = reviewed.get(file)
    if (status !== "A" || !record || record.project !== manifest.stagingDatabaseProject || record.productionAllowed !== false) {
      errors.push(`Candidate changes Supabase migrations without a separately reviewed staging migration:\n${line}`)
      continue
    }
    const digest = createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex")
    if (digest !== record.sha256.toLowerCase()) errors.push(`Reviewed staging migration checksum mismatch: ${file}`)
  }
}

for (const file of manifest.requiredFiles) if (!existsSync(resolve(root, file))) errors.push(`Missing required source file: ${file}`)
for (const file of manifest.requiredAssets) {
  const path = resolve(root, file)
  if (!existsSync(path)) errors.push(`Missing required approved asset: ${file}`)
  else if (statSync(path).size === 0) errors.push(`Approved asset is empty: ${file}`)
}
for (const [file, marker] of manifest.sourceMarkers) {
  if (existsSync(resolve(root, file)) && !source(file).includes(marker)) errors.push(`${file} is missing required marker ${JSON.stringify(marker)}.`)
}
if (manifest.productionDatabaseProject === manifest.stagingDatabaseProject) errors.push("Production and staging Supabase project IDs must be different.")
if (manifest.productionDomains.some((domain) => domain.includes("vercel.app"))) errors.push("Production domain list contains an unexpected Vercel preview host.")

if (errors.length) {
  console.error("BLOCKED: release safety verification failed.")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log(JSON.stringify({ status: "READY", candidateCommit: head, baselineCommit: baseline, stagingDatabaseProject: manifest.stagingDatabaseProject, productionDatabaseWrites: false, productionDeployment: false, sharedStagingAliasChange: false, requiredRoutes: manifest.requiredRoutes.length, requiredAssets: manifest.requiredAssets.length }, null, 2))
