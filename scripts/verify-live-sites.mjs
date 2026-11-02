import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const defaultManifest = fileURLToPath(new URL("../docs/production-verification/manifest.json", import.meta.url))
const defaultOutput = fileURLToPath(new URL("../production-verification-status.json", import.meta.url))

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (token.startsWith("--")) args.set(token.slice(2), process.argv[i + 1]?.startsWith("--") ? true : process.argv[++i] ?? true)
}

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"))
const normalizeUrl = (value) => new URL(value).toString().replace(/\/$/, "")
const verificationMode = String(args.get("mode") || process.env.VERIFICATION_MODE || "full").toLowerCase()
const isProductionUrl = (value) => {
  const url = new URL(value)
  return url.protocol === "https:" && !url.hostname.includes("localhost") && !url.hostname.includes("127.0.0.1")
}

const timeoutFetch = async (url, options = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs ?? 12000))
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "follow" })
  } finally {
    clearTimeout(timer)
  }
}

const parseLinks = (html, baseUrl) => {
  const links = []
  const expression = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(expression)) {
    const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    try {
      links.push({ href: new URL(match[1], baseUrl).toString(), label })
    } catch {
      links.push({ href: match[1], label })
    }
  }
  return links
}

const checkUrl = async (url, expectedContentType) => {
  if (!isProductionUrl(url)) return { url, ok: false, status: 0, error: "Only HTTPS production URLs are allowed." }
  try {
    const response = await timeoutFetch(url)
    const body = await response.text()
    const contentType = response.headers.get("content-type") ?? ""
    const contentTypeOk = !expectedContentType || contentType.toLowerCase().includes(expectedContentType.toLowerCase())
    return { url, ok: response.ok && contentTypeOk, status: response.status, finalUrl: response.url, contentType, body }
  } catch (error) {
    return { url, ok: false, status: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

const checkBaseline = (zone, deployment) => {
  const baseline = zone.approvedBaseline ?? {}
  const issues = []
  if (!baseline.deploymentId || !baseline.commitSha) issues.push("Approved Production deployment and source commit are not recorded.")
  if (!deployment?.deploymentId || !deployment?.commitSha) issues.push("Deployment provenance was not supplied by the deployment event.")
  if (!deployment?.projectId) issues.push("Deployment Vercel project ID was not supplied by the deployment event.")
  else if (zone.projectId && deployment.projectId !== zone.projectId) issues.push(`Deployment project ${deployment.projectId} does not match expected ${zone.projectId}.`)
  if (!deployment?.repository) issues.push("Deployment GitHub repository was not supplied by the deployment event.")
  else if (zone.repository && deployment.repository.toLowerCase() !== zone.repository.toLowerCase()) issues.push(`Deployment repository ${deployment.repository} does not match expected ${zone.repository}.`)
  if (baseline.deploymentId && deployment?.deploymentId && baseline.deploymentId !== deployment.deploymentId) issues.push(`Deployment ${deployment.deploymentId} differs from approved ${baseline.deploymentId}.`)
  if (baseline.commitSha && deployment?.commitSha && baseline.commitSha !== deployment.commitSha) issues.push(`Commit ${deployment.commitSha} differs from approved ${baseline.commitSha}.`)
  return issues
}

const resolveZoneId = (manifest, deployment, requestedZoneId = null) => {
  if (requestedZoneId) return requestedZoneId
  const matches = manifest.zones.filter((zone) =>
    (deployment?.projectId && zone.projectId === deployment.projectId) ||
    (deployment?.repository && zone.repository?.toLowerCase() === deployment.repository.toLowerCase())
  )
  return matches.length === 1 ? matches[0].id : null
}

const validateDeploymentEvent = (manifest, deployment, zoneId) => {
  const issues = []
  if (!zoneId) issues.push("Deployment event did not identify exactly one manifest zone.")
  else if (zoneId !== manifest.hub.id && !manifest.zones.some((zone) => zone.id === zoneId)) issues.push(`Deployment event references unknown zone ${zoneId}.`)
  if (!deployment?.deploymentId) issues.push("Deployment event is missing deployment_id.")
  if (!deployment?.commitSha) issues.push("Deployment event is missing commit_sha.")
  if (!deployment?.projectId) issues.push("Deployment event is missing project_id.")
  if (!deployment?.repository) issues.push("Deployment event is missing repository.")
  return issues
}

const checkArtwork = async (zone) => {
  const issues = []
  const checks = []
  for (const artwork of zone.approvedBaseline?.artwork ?? []) {
    if (!artwork.sourcePath || !artwork.approvedSha256) {
      issues.push(`Artwork baseline is incomplete for ${artwork.sourcePath ?? "unnamed asset"}.`)
      continue
    }
    try {
      const bytes = await readFile(artwork.sourcePath)
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      checks.push({ sourcePath: artwork.sourcePath, sha256, matches: sha256 === artwork.approvedSha256 })
      if (sha256 !== artwork.approvedSha256) issues.push(`Artwork checksum mismatch: ${artwork.sourcePath}.`)
    } catch (error) {
      issues.push(`Artwork could not be read: ${artwork.sourcePath} (${error instanceof Error ? error.message : String(error)}).`)
    }
  }
  return { checks, issues }
}

const checkZone = async (zone, hub, deployment, options = {}) => {
  const startedAt = new Date().toISOString()
  if (!zone.productionUrl) return { id: zone.id, label: zone.label, status: "BLOCKED", startedAt, issues: ["No verified Production URL is recorded."], routeResults: [] }

  const routeResults = []
  const issues = []
  const paths = options.mode === "fast"
    ? (zone.fastRoutes ?? [zone.criticalRoutes?.[0] ?? "/"])
    : (zone.criticalRoutes ?? ["/"])
  for (const path of paths) {
    const result = await checkUrl(new URL(path, `${zone.productionUrl}/`).toString(), path.startsWith("/api/") ? "application/json" : undefined)
    const markerIssues = []
    if (result.ok && path === "/") {
      for (const marker of zone.requiredMarkers ?? []) if (!result.body.includes(marker)) markerIssues.push(`Missing required marker ${JSON.stringify(marker)} on ${path}.`)
    }
    routeResults.push({ path, ok: result.ok && markerIssues.length === 0, status: result.status, finalUrl: result.finalUrl, contentType: result.contentType, error: result.error, markerIssues })
    issues.push(...markerIssues)
    if (!result.ok) issues.push(`${path} did not pass (${result.status || result.error}).`)
    if (path === "/") {
      const links = parseLinks(result.body ?? "", result.finalUrl ?? zone.productionUrl)
      if (zone.backToHub) {
        const backLinks = links.filter((link) => link.label.toLowerCase().includes(zone.backToHub.requiredLabel.toLowerCase()))
        if (backLinks.length === 0) issues.push(`No ${JSON.stringify(zone.backToHub.requiredLabel)} link was found.`)
        else if (!backLinks.some((link) => normalizeUrl(link.href) === normalizeUrl(zone.backToHub.targetUrl))) issues.push(`${JSON.stringify(zone.backToHub.requiredLabel)} link does not target ${zone.backToHub.targetUrl}.`)
      }
      for (const check of zone.readOnlyChecks ?? []) {
        const jsonResult = await checkUrl(new URL(check.path, `${zone.productionUrl}/`).toString(), check.contentType)
        if (!jsonResult.ok) {
          issues.push(`Read-only data check ${check.path} failed (${jsonResult.status || jsonResult.error}).`)
          continue
        }
        try {
          const value = JSON.parse(jsonResult.body)
          for (const key of check.requiredJson ?? []) if (!(key in value)) issues.push(`Read-only data check ${check.path} is missing ${JSON.stringify(key)}.`)
        } catch {
          issues.push(`Read-only data check ${check.path} did not return valid JSON.`)
        }
      }
    }
  }

  if (hub?.productionUrl && zone.hubPath) {
    const hubResult = options.hubResult ?? await checkUrl(hub.productionUrl)
    const hubLinks = parseLinks(hubResult.body ?? "", hubResult.finalUrl ?? hub.productionUrl)
    const expected = normalizeUrl(zone.productionUrl)
    const found = hubLinks.some((link) => normalizeUrl(link.href) === expected || link.href === new URL(zone.hubPath, hub.productionUrl).toString())
    if (!hubResult.ok) issues.push("Main Hub could not be checked for this zone.")
    else if (!found) issues.push(`Main Hub does not link to ${zone.productionUrl} or ${zone.hubPath}.`)
  }

  const artwork = await checkArtwork(zone)
  const provenanceIssues = options.enforceProvenance === false ? [] : checkBaseline(zone, deployment)
  const healthy = routeResults.length > 0 && routeResults.every((route) => route.ok) && issues.length === 0
  const complete = healthy && provenanceIssues.length === 0 && artwork.issues.length === 0 && Boolean(zone.backToHub) && Boolean(zone.hubPath)
  const environment = deployment?.environment ?? "production"
  const healthyStatus = environment === "preview" ? "PREVIEW" : "LIVE"
  return {
    id: zone.id,
    label: zone.label,
    repository: zone.repository,
    projectId: zone.projectId,
    productionUrl: zone.productionUrl,
    status: complete ? "COMPLETE" : healthy ? healthyStatus : "BLOCKED",
    environment,
    startedAt,
    routeResults,
    artwork,
    provenance: { deployment, issues: provenanceIssues },
    observedProduction: zone.observedProduction ?? null,
    issues: [...issues, ...provenanceIssues, ...artwork.issues]
  }
}

const verifyManifest = async ({ manifest, zoneId, deployment, mode = "full" }) => {
  const selected = zoneId ? manifest.zones.filter((zone) => zone.id === zoneId) : manifest.zones
  if (zoneId && selected.length === 0) throw new Error(`Unknown zone: ${zoneId}`)
  const hubIsTarget = zoneId === manifest.hub.id
  const hubResult = await checkUrl(manifest.hub.productionUrl)
  const hub = await checkZone({ ...manifest.hub, backToHub: null, hubPath: null }, null, hubIsTarget ? deployment : null, { enforceProvenance: hubIsTarget, mode })
  const zones = []
  for (const zone of selected) zones.push(await checkZone(zone, manifest.hub, zone.id === zoneId ? deployment : null, { enforceProvenance: true, mode, hubResult }))
  const all = [hub, ...zones]
  const statusCounts = Object.fromEntries([...new Set(all.map((item) => item.status))].map((status) => [status, all.filter((item) => item.status === status).length]))
  return { generatedAt: new Date().toISOString(), mode, status: all.some((item) => item.status === "BLOCKED") ? "BLOCKED" : all.some((item) => item.status === "LIVE") ? "LIVE" : "COMPLETE", statusCounts, hub, zones }
}

const main = async () => {
  const manifest = await readJson(args.get("manifest") || defaultManifest)
  const deployment = {
    deploymentId: args.get("deployment-id") || process.env.DEPLOYMENT_ID || null,
    commitSha: args.get("commit-sha") || process.env.DEPLOYMENT_COMMIT_SHA || null,
    projectId: args.get("project-id") || process.env.DEPLOYMENT_PROJECT_ID || null,
    repository: args.get("repository") || process.env.DEPLOYMENT_REPOSITORY || null,
    deploymentUrl: args.get("deployment-url") || process.env.DEPLOYMENT_URL || null,
    environment: args.get("environment") || process.env.VERIFICATION_ENVIRONMENT || "production"
  }
  const requestedZoneId = args.get("zone") || process.env.VERIFICATION_ZONE || null
  const zoneId = resolveZoneId(manifest, deployment, requestedZoneId)
  const eventMode = process.env.VERIFICATION_EVENT === "true"
  if (eventMode) {
    const eventIssues = validateDeploymentEvent(manifest, deployment, zoneId)
    if (eventIssues.length > 0) throw new Error(`Invalid deployment event: ${eventIssues.join(" ")}`)
  }
  const report = await verifyManifest({ manifest, zoneId, deployment, mode: verificationMode })
  report.event = eventMode ? { zoneId, key: `${zoneId}:${deployment.deploymentId}:${deployment.commitSha}` } : null
  const outputPath = args.get("output") || process.env.VERIFICATION_OUTPUT || defaultOutput
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(report, null, 2))
  if (report.status === "BLOCKED") process.exitCode = 1
}

export { checkArtwork, checkBaseline, checkZone, parseLinks, resolveZoneId, validateDeploymentEvent, verifyManifest }

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main()
