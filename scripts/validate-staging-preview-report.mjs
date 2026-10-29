import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const reportPath = process.argv[2]
if (!reportPath) { console.error("Usage: node scripts/validate-staging-preview-report.mjs <report.json>"); process.exit(2) }
const report = JSON.parse(readFileSync(resolve(process.cwd(), reportPath), "utf8"))
const errors = []
for (const field of ["jobId", "sourceCommit", "parentCommit", "deploymentId", "previewUrl", "deploymentStatus", "browserSmoke"]) if (!report[field]) errors.push(`Missing ${field}.`)
if (report.deploymentStatus !== "READY") errors.push(`Preview deployment is not READY: ${report.deploymentStatus || "unknown"}.`)
if (typeof report.previewUrl !== "string" || !/^https:\/\/[^/]+\.vercel\.app(?:\/|$)/i.test(report.previewUrl)) errors.push("previewUrl must be an HTTPS *.vercel.app URL.")
if (typeof report.previewUrl === "string" && /(krysleagues\.com|www\.krysleagues\.com)/i.test(report.previewUrl)) errors.push("Production domain was supplied as a Preview URL.")
if (!/^[0-9a-f]{40}$/i.test(report.sourceCommit || "")) errors.push("sourceCommit must be a full Git SHA.")
if (!/^[0-9a-f]{40}$/i.test(report.parentCommit || "")) errors.push("parentCommit must be a full Git SHA.")
if (report.browserSmoke !== "PASS") errors.push("Browser smoke verification is not marked PASS.")
if (report.databaseWrites !== false) errors.push("databaseWrites must be false for this staging safety workflow.")
if (report.productionTouched !== false) errors.push("productionTouched must be false.")
if (report.sharedStagingAliasChanged !== false) errors.push("sharedStagingAliasChanged must be false.")
if (errors.length) { console.error("BLOCKED: staging Preview evidence is incomplete."); for (const error of errors) console.error(`- ${error}`); process.exit(1) }
console.log(`READY: verified private staging Preview for ${report.jobId} at ${report.previewUrl}`)
