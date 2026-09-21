import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
function walk(directory) {
  const result = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) result.push(...walk(path))
    else if (/\.(tsx?|jsx?|js)$/.test(name)) result.push(path)
  }
  return result
}
function content(path) { return readFileSync(path, "utf8") }
function values(source, pattern) { return [...source.matchAll(pattern)].map((match) => match[1]).filter(Boolean) }
function routeFor(path, prefix) {
  const base = prefix === "admin" ? join(root, "app", "admin") : join(root, "app", "api", "admin")
  const folder = relative(base, path).replaceAll("\\", "/").replace(/\/page\.(tsx?|jsx?)$/, "").replace(/\/route\.ts$/, "")
  return `${prefix === "admin" ? "/admin" : "/api/admin"}/${folder}`.replace(/\/+/g, "/").replace(/\/$/, "")
}
function row(path, prefix) {
  const source = content(path)
  const client = /['"]use client['"]/.test(source)
  const tables = values(source, /\.from\(\s*["']([^"']+)["']\s*\)/g)
  const rpcs = values(source, /\.rpc\(\s*["']([^"']+)["']/g)
  const api = values(source, /["'`]((?:\/api\/admin|\/api\/)[^"'`\s?]+)/g)
  const auth = values(source, /(authorizeSiteAdminMutation|authorizeSiteAdminWithClient|authorizedAdminClient|requireCourseChallengeAdmin|authorizedAdmin)/g)
  const protectedClient = client && (tables.some((table) => /^(players|player_|schedule|handicap_|all_time_|climbers_|course_challenge_|historical_|major_|stroke_|match_|pyp_|kwt_|trophy|scorecard|league_)/.test(table)) || rpcs.some((rpc) => /^(set_|save_|create_|update_|delete_|approve_|record_|preview_|commit_|merge_|mark_|generate_|rebuild_|configure_|release_|finalize_|close_|reopen_|admin_)/.test(rpc)))
  return { path: relative(root, path).replaceAll("\\", "/"), route: routeFor(path, prefix), client, tables, rpcs, api, auth, status: protectedClient ? "UNSAFE" : auth.length || !client ? "SAFE" : "NEEDS REVIEW" }
}
function markdownRows(rows) {
  return rows.map((item) => `| ${item.route} | ${item.client ? "client" : "server/inherited"} | ${item.tables.join(", ") || "—"} | ${item.rpcs.join(", ") || "—"} | ${item.api.join(", ") || "—"} | ${item.auth.join(", ") || "layout/inherited"} | ${item.status} |`).join("\n")
}

const pages = walk(join(root, "app", "admin")).filter((path) => /[\\/]page\.(tsx?|jsx?)$/.test(path)).map((path) => row(path, "admin")).sort((a, b) => a.route.localeCompare(b.route))
const apiRoutes = walk(join(root, "app", "api", "admin")).filter((path) => /[\\/]route\.ts$/.test(path)).map((path) => row(path, "api")).sort((a, b) => a.route.localeCompare(b.route))
const adminComponents = walk(join(root, "components", "admin")).map((path) => relative(root, path).replaceAll("\\", "/")).sort()
const adminLibs = walk(join(root, "lib")).filter((path) => /admin|identity|courseChallenges|all-time|scorecard|auth/.test(path)).map((path) => relative(root, path).replaceAll("\\", "/")).sort()
const out = [
  "# Admin access inventory", "",
  `Generated from the Production-base source tree at ${process.env.PRODUCTION_BASE_SHA || "6de62126a155e6c78dfdfc0f34edb81189393e58"}.`, "",
  "Status is a static boundary signal: UNSAFE means a client file directly touches a protected table/RPC; SAFE means server-side or explicitly authorized/public-safe by static evidence; NEEDS REVIEW requires workflow review.", "",
  `## Admin pages (${pages.length})`, "",
  "| Route | Component | Tables | RPCs | API routes | Authorization evidence | Status |", "|---|---|---|---|---|---|---|", markdownRows(pages), "",
  `## Admin API handlers (${apiRoutes.length})`, "",
  "| Route | Component | Tables | RPCs | API routes | Authorization evidence | Status |", "|---|---|---|---|---|---|---|", markdownRows(apiRoutes), "",
  "## Admin components", "", adminComponents.map((file) => "- " + file).join("\n"), "",
  "## Admin libraries/helpers", "", adminLibs.map((file) => "- " + file).join("\n"), "",
  "## Audit limitation", "", "This inventory is source-level evidence, not a live database ACL/RLS query. The read-only permission-contract command is npm run audit:database-permissions; it emits the operator-approved inspection SQL but does not execute it.", "",
].join("\n")
writeFileSync(join(root, "docs", "admin-access-inventory.md"), out)
console.log(`Wrote docs/admin-access-inventory.md (${pages.length} pages, ${apiRoutes.length} API handlers).`)
