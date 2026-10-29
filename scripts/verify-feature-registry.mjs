import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const registryPath = resolve(root, "release/approved-feature-registry.json")
const statuses = new Set(["APPROVED", "PENDING OWNER REVIEW", "INCOMPLETE", "REGRESSION DETECTED"])

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
const sha256 = (path) => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex").toUpperCase()
const source = (path) => readFileSync(resolve(root, path), "utf8")
const hasCommit = (commit) => spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: root }).status === 0
const isAncestor = (ancestor, commit) => spawnSync("git", ["merge-base", "--is-ancestor", ancestor, commit], { cwd: root }).status === 0
const routeFile = (route) => {
  const pathname = route.split("?", 1)[0]
  if (pathname === "/") return "app/page.tsx"
  const segments = pathname.split("/").filter(Boolean)
  const candidates = [`app/${segments.join("/")}/page.tsx`]
  for (let index = 0; index < segments.length; index += 1) {
    const dynamic = [...segments]
    dynamic[index] = "[slug]"
    candidates.push(`app/${dynamic.join("/")}/page.tsx`)
  }
  return candidates.find((candidate) => existsSync(resolve(root, candidate))) ?? candidates[0]
}

export function validateRegistry(registry, { candidateCommit = git(["rev-parse", "HEAD"]), changedFrom = null } = {}) {
  const errors = []
  if (registry.schemaVersion !== 1) errors.push(`unsupported registry schema ${registry.schemaVersion}`)
  if (!registry.baseline?.commit || !/^[0-9a-f]{40}$/i.test(registry.baseline.commit)) errors.push("baseline commit must be a full SHA")
  if (!hasCommit(registry.baseline?.commit)) errors.push(`baseline commit is unavailable: ${registry.baseline?.commit}`)
  if (!/^[0-9a-f]{40}$/i.test(candidateCommit) || !hasCommit(candidateCommit)) errors.push(`candidate commit is unavailable: ${candidateCommit}`)
  if (hasCommit(registry.baseline?.commit) && hasCommit(candidateCommit) && !isAncestor(registry.baseline.commit, candidateCommit)) {
    errors.push(`candidate ${candidateCommit} is not descended from baseline ${registry.baseline.commit}`)
  }

  const ids = new Set()
  for (const feature of registry.features ?? []) {
    if (!feature.id || ids.has(feature.id)) errors.push(`duplicate or missing feature id: ${feature.id ?? "<missing>"}`)
    ids.add(feature.id)
    if (!statuses.has(feature.status)) errors.push(`${feature.id} has invalid status ${feature.status}`)
    if (!Array.isArray(feature.routes) || feature.routes.length === 0) errors.push(`${feature.id} has no routes`)
    for (const route of feature.routes ?? []) {
      const path = routeFile(route)
      if (!existsSync(resolve(root, path))) errors.push(`${feature.id} route ${route} is missing ${path}`)
    }
    if (!/^[0-9a-f]{40}$/i.test(feature.checkpoint?.commit ?? "")) errors.push(`${feature.id} checkpoint commit must be a full SHA`)
    if (!hasCommit(feature.checkpoint?.commit)) errors.push(`${feature.id} checkpoint commit is unavailable`)
    if (hasCommit(feature.checkpoint?.commit) && hasCommit(candidateCommit) && !isAncestor(feature.checkpoint.commit, candidateCommit)) {
      errors.push(`${feature.id} candidate does not descend from its checkpoint ${feature.checkpoint.commit}`)
    }
    for (const relativePath of feature.sourceFiles ?? []) {
      const path = resolve(root, relativePath)
      if (!existsSync(path) || !statSync(path).isFile()) errors.push(`${feature.id} missing source file ${relativePath}`)
    }
    for (const artwork of feature.artwork ?? []) {
      const path = resolve(root, artwork.path)
      if (!existsSync(path) || !statSync(path).isFile()) {
        errors.push(`${feature.id} missing artwork ${artwork.path}`)
        continue
      }
      const actual = sha256(artwork.path)
      if (actual !== artwork.sha256.toUpperCase()) errors.push(`${feature.id} artwork hash mismatch: ${artwork.path}`)
      if (feature.status !== "APPROVED" && hasCommit(feature.checkpoint.commit)) {
        const checkpointHash = sha256FromCommit(feature.checkpoint.commit, artwork.path)
        if (checkpointHash && checkpointHash !== artwork.sha256.toUpperCase()) errors.push(`${feature.id} artwork version is not tied to its checkpoint: ${artwork.path}`)
      }
    }
    for (const marker of feature.sourceMarkers ?? []) {
      const file = marker.file
      if (!existsSync(resolve(root, file))) {
        errors.push(`${feature.id} marker file is missing: ${file}`)
      } else if (!source(file).includes(marker.text)) {
        errors.push(`${feature.id} source marker is missing: ${file} contains ${JSON.stringify(marker.text)}`)
      }
    }
    if (feature.status === "APPROVED" && feature.approval?.ownerApproved !== true) errors.push(`${feature.id} is APPROVED without ownerApproved evidence`)
    if (feature.status === "APPROVED" && (!feature.approval?.approvalDate || !feature.approval?.evidence?.length)) errors.push(`${feature.id} is APPROVED without dated evidence`)
  }

  if (changedFrom) {
    if (!/^[0-9a-f]{40}$/i.test(changedFrom) || !hasCommit(changedFrom)) {
      errors.push(`changed-from commit is unavailable: ${changedFrom}`)
    } else {
      const allowed = new Set(registry.policy?.sharedInfrastructurePaths ?? [])
      for (const feature of registry.features ?? []) for (const path of [...(feature.sourceFiles ?? []), ...(feature.artwork ?? []).map((asset) => asset.path)]) allowed.add(path)
      const changed = git(["diff", "--name-only", `${changedFrom}..${candidateCommit}`]).split(/\r?\n/).filter(Boolean)
      for (const path of changed) {
        const allowedByPrefix = [...allowed].some((entry) => entry.endsWith("/") ? path.startsWith(entry) : path === entry)
        if (!allowedByPrefix) errors.push(`unreviewed changed path outside registry allowlist: ${path}`)
      }
    }
  }
  return { errors, featureCount: registry.features?.length ?? 0, candidateCommit, baselineCommit: registry.baseline?.commit }
}

function sha256FromCommit(commit, relativePath) {
  const result = spawnSync("git", ["show", `${commit}:${relativePath}`], { cwd: root })
  if (result.status !== 0) return null
  return createHash("sha256").update(result.stdout).digest("hex").toUpperCase()
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
  const registry = JSON.parse(readFileSync(value("--registry") ? resolve(root, value("--registry")) : registryPath, "utf8"))
  const result = validateRegistry(registry, { candidateCommit: value("--candidate") ?? git(["rev-parse", "HEAD"]), changedFrom: value("--changed-from") })
  if (result.errors.length) {
    console.error("BLOCKED: approved feature registry verification failed.")
    for (const error of result.errors) console.error(`- ${error}`)
    process.exit(1)
  }
  console.log(JSON.stringify({ status: "READY", featureCount: result.featureCount, baselineCommit: result.baselineCommit, candidateCommit: result.candidateCommit }, null, 2))
}
