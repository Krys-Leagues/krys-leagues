import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const root = process.cwd()
const changedOnly = process.argv.includes("--changed")
const adminOnly = process.argv.includes("--admin")

const protectedTables = [
  "players", "player_league_memberships", "player_tournament_entries", "player_identity_links", "player_aliases",
  "schedule", "handicap_rounds", "player_career_events", "all_time_", "climbers_", "course_challenge_",
  "historical_", "major_", "stroke_", "match_", "pyp_", "kwt_", "solo_", "trophy", "scorecard", "league_",
]
const protectedRpcPrefixes = /^(set_|save_|create_|update_|delete_|approve_|record_|preview_|commit_|merge_|mark_|generate_|rebuild_|configure_|release_|finalize_|close_|reopen_|resize_|add_|remove_|publish_|apply_|correct_|void_|assign_|remember_|admin_)/
const publicRpc = /^(get_public_|current_user_|is_current_user_)/
const authMarkers = /(authorizeSiteAdminMutation\s*\(|authorizeSiteAdminWithClient\s*\(|authorizedAdminClient\s*\(|requireCourseChallengeAdmin\s*\(|authorizedAdmin\s*\(|is_current_user_site_admin)/
const trustedAuthorizedReexports = new Set([
  "app/api/admin/records/all-time/apply/route.ts",
  "app/api/admin/records/all-time/preview/route.ts",
])

function walk(directory) {
  const result = []
  for (const name of readdirSync(directory)) {
    if (["node_modules", ".next", ".git"].includes(name)) continue
    const path = join(directory, name)
    const info = statSync(path)
    if (info.isDirectory()) result.push(...walk(path))
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) result.push(path)
  }
  return result
}

function changedFiles() {
  try {
    const output = execFileSync("git", ["status", "--short"], { encoding: "utf8" })
    return new Set(output.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean))
  } catch {
    return new Set()
  }
}

function addedLines() {
  const result = new Map()
  try {
    const output = execFileSync("git", ["diff", "--unified=0"], { encoding: "utf8" })
    let file = ""
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith("+++ b/")) file = line.slice(6)
      else if (file && line.startsWith("+") && !line.startsWith("+++")) result.set(file, `${result.get(file) || ""}\n${line.slice(1)}`)
    }
  } catch { /* The full-source mode remains available without a diff. */ }
  return result
}

function sourceFiles() {
  const all = [...walk(join(root, "app")), ...walk(join(root, "components")), ...walk(join(root, "lib"))]
  if (adminOnly) {
    return all.filter((path) => {
      const file = relative(root, path).split(sep).join("/")
      return file.startsWith("app/admin/") || file.startsWith("components/admin/")
    })
  }
  if (!changedOnly) return all
  const changed = changedFiles()
  return all.filter((path) => changed.has(relative(root, path).split(sep).join("/")) || changed.has(relative(root, path)))
}

function tableFindings(path, source) {
  const findings = []
  const fromPattern = /\.from\(\s*["']([^"']+)["']\s*\)/g
  for (const match of source.matchAll(fromPattern)) {
    const table = match[1]
    if (protectedTables.some((prefix) => table === prefix || table.startsWith(prefix))) {
      findings.push(`${relative(root, path)}: protected table ${table}`)
    }
  }
  return findings
}

function rpcFindings(path, source) {
  const findings = []
  const rpcPattern = /\.rpc\(\s*["']([^"']+)["']/g
  for (const match of source.matchAll(rpcPattern)) {
    const rpc = match[1]
    if (protectedRpcPrefixes.test(rpc) && !publicRpc.test(rpc)) findings.push(`${relative(root, path)}: protected RPC ${rpc}`)
  }
  return findings
}

const failures = []
const additions = addedLines()
for (const path of sourceFiles()) {
  const source = readFileSync(path, "utf8")
  if (!source.includes("use client")) continue
  const relativePath = relative(root, path).split(sep).join("/")
  const scannedSource = changedOnly && additions.has(relativePath) ? additions.get(relativePath) : source
  failures.push(...tableFindings(path, scannedSource), ...rpcFindings(path, scannedSource))
  if (/SUPABASE_(?:SERVICE_ROLE|SECRET)|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/.test(scannedSource)) failures.push(`${relativePath}: privileged Supabase environment variable in client code`)
}

const adminRoutes = walk(join(root, "app", "api", "admin")).filter((path) => /route\.ts$/.test(path))
for (const path of adminRoutes) {
  const source = readFileSync(path, "utf8")
  const relativePath = relative(root, path).split(sep).join("/")
  if (!authMarkers.test(source) && !trustedAuthorizedReexports.has(relativePath)) failures.push(`${relativePath}: no recognized site-admin authorization before protected work`)
}

const migrationChanges = [...changedFiles()].filter((file) => file.startsWith("supabase/migrations/") || file.startsWith("supabase\\migrations\\"))
for (const file of migrationChanges) {
  const source = readFileSync(join(root, file), "utf8")
  if (/\bGRANT\b[\s\S]*\b(?:anon|authenticated)\b|CREATE\s+POLICY/i.test(source)) failures.push(`${file}: broad grant/policy change requires explicit security review`)
}

const unique = [...new Set(failures)].sort()
console.log(JSON.stringify({ mode: adminOnly ? "absolute-admin" : changedOnly ? "changed-files" : "full-source", findings: unique }, null, 2))

if ((changedOnly || adminOnly) && unique.length > 0) {
  console.error(`Admin data boundary audit failed with ${unique.length} finding(s).`)
  process.exitCode = 1
}
