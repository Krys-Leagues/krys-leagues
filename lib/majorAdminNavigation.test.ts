import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const hub = read("app/admin/majors/page.tsx")

test("the Majors admin opens one event workspace with a deliberate All Majors exit", () => {
  assert.match(hub, /selectMajorAdminEvent\(loaded, requestedId\)/)
  assert.match(hub, /\/admin\/majors\?view=all/)
  assert.match(hub, /majorAdminWorkspaceHref\(event\.id\)/)
  assert.match(hub, /Admin Workspace/)
})

test("the workspace links existing tools with the selected event context", () => {
  for (const route of ["scheduling", "scoring", "verification", "waitlist", "stream-scorecard", "simple-stream-scorecard", "manual-stream-scorecard"]) {
    assert.match(hub, new RegExp(`majorAdminToolHref\\(\"/admin/majors/${route}\", draft\\.id\\)`))
  }
  assert.match(hub, /\/majors\/\$\{draft\.slug\}\/results/)
})

test("deep admin tools return to the selected Major workspace", () => {
  for (const path of [
    "app/admin/majors/scheduling/page.tsx",
    "app/admin/majors/scoring/page.tsx",
    "app/admin/majors/verification/page.tsx",
    "app/admin/majors/waitlist/page.tsx",
    "app/admin/majors/stream-scorecard/page.tsx",
    "app/admin/majors/simple-stream-scorecard/page.tsx",
    "app/admin/majors/manual-stream-scorecard/page.tsx",
  ]) {
    assert.match(read(path), /MajorAdminWorkspaceLink/)
  }
})

test("event-capable tools initialize from the explicit event query without breaking direct URLs", () => {
  assert.match(read("app/admin/majors/scheduling/page.tsx"), /const routeContext = majorAdminRouteContext\(window\.location\.search\)[\s\S]*const contextEventId = routeContext\.eventId/)
  assert.match(read("app/admin/majors/scoring/page.tsx"), /majorAdminRouteContext\(window\.location\.search\)\.eventId/)
  assert.match(read("app/admin/majors/verification/page.tsx"), /majorAdminRouteContext\(window\.location\.search\)\.eventId/)
  assert.match(read("components/admin/majors/MajorAdminWorkspaceLink.tsx"), /if \(eventId\) setHref\(majorAdminWorkspaceHref\(eventId\)\)/)
})

test("bare Majors entry opens the active play day while explicit navigation remains authoritative", () => {
  const scheduling = read("app/admin/majors/scheduling/page.tsx")
  assert.match(hub, /!preferredId && !routeContext\.eventId && !routeContext\.showAll/)
  assert.match(hub, /selectActiveMajorPlayDay/)
  assert.match(hub, /router\.replace\(majorAdminSchedulingDayHref/)
  assert.match(scheduling, /routeContext\.playDayId/)
  assert.match(scheduling, /requestedDay = loadedDays\.find/)
  assert.match(scheduling, /window\.history\.replaceState/)
  assert.match(scheduling, /params\.set\("playDay", selectedDay\.id\)/)
  assert.match(scheduling, /params\.delete\("playDay"\)/)
})

test("workspace navigation remains responsive without changing tournament data", () => {
  assert.match(hub, /repeat\(auto-fit,minmax\(220px,1fr\)\)/)
  assert.doesNotMatch(hub, /update public\.|insert into public\.|delete from public\./i)
})
