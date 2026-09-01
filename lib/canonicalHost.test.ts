import assert from "node:assert/strict"
import test from "node:test"
import {
  CANONICAL_PUBLIC_HOST,
  canonicalRedirectUrl,
  shouldRedirectToCanonicalHost,
} from "./canonicalHost.ts"

test("the exact Production Vercel hostname redirects to the canonical domain", () => {
  assert.equal(
    canonicalRedirectUrl("https://krys-leagues.vercel.app/admin/records?tab=history"),
    "https://krysleagues.com/admin/records?tab=history",
  )
})

test("www redirects while the canonical hostname stays put", () => {
  assert.equal(canonicalRedirectUrl("https://www.krysleagues.com/players"), "https://krysleagues.com/players")
  assert.equal(canonicalRedirectUrl("https://krysleagues.com/players"), null)
})

test("preview Vercel hosts and localhost are not redirected", () => {
  assert.equal(canonicalRedirectUrl("https://krys-leagues-preview.vercel.app/players"), null)
  assert.equal(canonicalRedirectUrl("http://localhost:3000/players"), null)
})

test("legacy OAuth callbacks remain on their originating host", () => {
  assert.equal(shouldRedirectToCanonicalHost("krys-leagues.vercel.app", "/auth/callback"), false)
  assert.equal(canonicalRedirectUrl("https://www.krysleagues.com/auth/callback?code=abc&state=xyz"), null)
})

test("the canonical host constant is the official public address", () => {
  assert.equal(CANONICAL_PUBLIC_HOST, "krysleagues.com")
})
