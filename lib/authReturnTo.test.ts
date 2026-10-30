import assert from "node:assert/strict"
import test from "node:test"
import { safeInternalReturnTo } from "./authReturnTo.ts"

test("auth return paths stay internal and preserve the intended MGA route", () => {
  assert.equal(safeInternalReturnTo("/majors/major-2"), "/majors/major-2")
  assert.equal(safeInternalReturnTo("/admin/majors/scheduling?event=major-2"), "/admin/majors/scheduling?event=major-2")
})

test("auth return paths reject open redirects and callback recursion", () => {
  assert.equal(safeInternalReturnTo("https://krysleagues.com/admin"), null)
  assert.equal(safeInternalReturnTo("//evil.example/admin"), null)
  assert.equal(safeInternalReturnTo("/auth/callback?next=%2Fadmin"), null)
  assert.equal(safeInternalReturnTo("/%2F%2Fevil.example"), null)
})
