import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "..")

test("Main Hub uses the exact approved Egyptian MGA Open artwork", () => {
  const page = readFileSync(resolve(root, "app/page.tsx"), "utf8")
  const navigationCss = readFileSync(resolve(root, "components/navigation/artwork-navigation.css"), "utf8")
  const artwork = readFileSync(resolve(root, "public/approved-pages/the mga open.jpg"))

  assert.match(page, /THE MGA OPEN — COMING SOON/u)
  assert.match(page, /disabled/u)
  assert.match(page, /artwork-navigation__masters-copy--image/u)
  assert.match(page, /artwork-navigation__masters-link--image/u)
  assert.equal(
    (page.match(/THE MGA OPEN — COMING SOON/g) ?? []).length,
    1,
    "the Main Hub keeps one MGA Coming Soon action",
  )
  assert.match(navigationCss, /url\("\/approved-pages\/the mga open\.jpg"\)/u)
  assert.doesNotMatch(navigationCss, /url\("\/approved-pages\/the masters\.jpg"\)/u)
  assert.match(navigationCss, /\.artwork-navigation__masters-link--image\s*\{[\s\S]*?background-image: url\("\/approved-pages\/the mga open\.jpg"\)[\s\S]*?background-blend-mode: normal/u)
  assert.equal(
    createHash("sha256").update(artwork).digest("hex").toUpperCase(),
    "35E66D4F0A386CBFA0689B980BD3AA0B8D3204C0619A40FD16060A47013296FD",
  )
})
