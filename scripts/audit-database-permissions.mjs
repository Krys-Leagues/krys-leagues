import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

// This command is intentionally read-only. Without --live it audits repository
// permission contracts and emits the SQL used by an operator-approved live
// inspection; it never connects to or mutates Supabase by default.
const live = process.argv.includes("--live")
const protectedPrefixes = ["players", "player_", "schedule", "handicap_", "all_time_", "climbers_", "course_challenge_", "historical_", "major_", "stroke_", "match_", "pyp_", "kwt_", "trophy", "scorecard"]
const migrations = []
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.sql$/.test(name)) migrations.push(path)
  }
}
walk(join(process.cwd(), "supabase", "migrations"))

const changedFiles = (() => {
  try {
    const output = execFileSync("git", ["status", "--short"], { encoding: "utf8" })
    return new Set(output.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim().replaceAll("\\", "/")))
  } catch { return new Set() }
})()
const broadPermissionChanges = migrations.filter((path) => changedFiles.has(path.replaceAll("\\", "/").replace(`${process.cwd().replaceAll("\\", "/")}/`, ""))).flatMap((path) => {
  const source = readFileSync(path, "utf8")
  return /\bGRANT\b[\s\S]*\b(?:anon|authenticated)\b|CREATE\s+POLICY/i.test(source) ? [path] : []
})

console.log(JSON.stringify({
  mode: live ? "live-read-only-requested" : "repository-contract",
  protectedObjectPrefixes: protectedPrefixes,
  broadPermissionChanges,
  liveQuery: `
SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind,
       c.relrowsecurity AS rls_enabled,
       COALESCE(array_agg(CASE WHEN has_table_privilege(g.rolname, c.oid, 'SELECT') THEN g.rolname END) FILTER (WHERE g.rolname IS NOT NULL), '{}') AS select_roles
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_roles g ON g.rolname IN ('anon', 'authenticated', 'service_role')
WHERE n.nspname = 'public'
  AND (c.relname LIKE ANY (ARRAY['players%', 'player_%', 'all_time_%', 'climbers_%', 'course_challenge_%', 'historical_%', 'major_%', 'stroke_%', 'match_%', 'pyp_%', 'kwt_%', 'scorecard%']))
GROUP BY n.nspname, c.relname, c.relkind, c.relrowsecurity
ORDER BY c.relname;

SELECT n.nspname AS schema_name, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE ANY (ARRAY['%admin%', 'preview_%', 'record_%', 'merge_%', 'set_%'])
ORDER BY p.proname;
`.trim(),
  note: live ? "Live mode only emits the read-only inspection contract; it does not execute SQL." : "No Production connection or SQL execution was attempted.",
}, null, 2))

if (broadPermissionChanges.length > 0) process.exitCode = 1
