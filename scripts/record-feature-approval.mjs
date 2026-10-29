import { createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { validateRegistry } from "./verify-feature-registry.mjs"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const registryPath = resolve(root, "release/approved-feature-registry.json")
const args = process.argv.slice(2)
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
const required = (flag) => {
  const result = value(flag)
  if (!result) throw new Error(`missing required argument ${flag}`)
  return result
}

if (!args.includes("--owner-approved")) {
  console.error("BLOCKED: recording an approval requires the explicit --owner-approved flag.")
  process.exit(1)
}

const featureId = required("--feature")
const commit = required("--commit")
const deploymentId = required("--deployment-id")
const previewUrl = required("--preview-url")
const approvalDate = required("--approval-date")
const evidence = required("--evidence").split(",").map((item) => item.trim()).filter(Boolean)
const list = (flag) => (value(flag) ?? "").split(",").map((item) => item.trim()).filter(Boolean)
const registry = JSON.parse(readFileSync(registryPath, "utf8"))
const feature = registry.features.find((entry) => entry.id === featureId)
if (!feature) throw new Error(`unknown feature ${featureId}`)
if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error("--commit must be a full Git SHA")
if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) throw new Error("--deployment-id must be a Vercel deployment ID")
if (!/^https:\/\/[^/]+\.vercel\.app(?:\/.*)?$/.test(previewUrl)) throw new Error("--preview-url must be a private Vercel Preview URL")
if (!/^\d{4}-\d{2}-\d{2}$/.test(approvalDate)) throw new Error("--approval-date must be YYYY-MM-DD")
if (evidence.length === 0) throw new Error("--evidence must name at least one evidence artifact")

const previous = {
  status: feature.status,
  checkpoint: feature.checkpoint,
  approval: feature.approval,
  capturedAt: new Date().toISOString(),
}
feature.history = [...(feature.history ?? []), previous]
feature.status = "APPROVED"
feature.checkpoint = { commit, deploymentId, previewUrl }
feature.artwork = (feature.artwork ?? []).map((asset) => {
  if (!existsSync(resolve(root, asset.path))) throw new Error(`approved artwork is missing: ${asset.path}`)
  return { ...asset, sha256: createHash("sha256").update(readFileSync(resolve(root, asset.path))).digest("hex").toUpperCase() }
})
feature.screenshots = {
  desktop: list("--desktop-screenshots"),
  mobile: list("--mobile-screenshots"),
}
feature.approval = {
  ownerApproved: true,
  approvalDate,
  evidence,
  notes: value("--notes") ?? "Owner-approved versioned checkpoint.",
}

const candidate = validateRegistry(registry, { candidateCommit: commit })
if (candidate.errors.length) {
  console.error("BLOCKED: the proposed approval does not pass registry validation.")
  for (const error of candidate.errors) console.error(`- ${error}`)
  process.exit(1)
}

writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8")
console.log(`RECORDED: ${featureId} approved at ${commit}; prior checkpoint preserved in feature.history.`)
