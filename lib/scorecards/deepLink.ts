import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { SCORECARD_ADAPTER_KEYS, type ScorecardAdapterKey } from "./core"

const DIRECT_LINK_VERSION = 1
const ENABLED_ADAPTERS = new Set<ScorecardAdapterKey>(["pyp", "stroke", "match"])

type DirectLinkPayload = {
  v: 1
  adapterKey: "pyp" | "stroke" | "match"
  sourceKey: string
  componentKey: string
}

function secret() {
  return process.env.SCORECARD_BRIDGE_SECRET?.trim() || null
}

function base64Url(value: Uint8Array | string) {
  return Buffer.from(value).toString("base64url")
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function sign(encodedPayload: string, signingSecret: string) {
  return createHmac("sha256", signingSecret).update(encodedPayload).digest("base64url")
}

function validComponent(adapterKey: DirectLinkPayload["adapterKey"], componentKey: string) {
  return adapterKey === "pyp" ? componentKey === "course1" || componentKey === "course2" : componentKey === "primary"
}

export function createScorecardDeepLink(options: {
  adapterKey: "pyp" | "stroke" | "match"
  sourceKey: string
  componentKey?: string
  origin?: string
}) {
  const signingSecret = secret()
  const sourceKey = options.sourceKey.trim()
  const componentKey = options.adapterKey === "pyp" ? options.componentKey || "course1" : "primary"
  if (!signingSecret || !ENABLED_ADAPTERS.has(options.adapterKey) || !sourceKey || sourceKey.length > 200 || !validComponent(options.adapterKey, componentKey)) return null
  const payload: DirectLinkPayload = { v: DIRECT_LINK_VERSION, adapterKey: options.adapterKey, sourceKey, componentKey }
  const encodedPayload = base64Url(JSON.stringify(payload))
  const token = `${encodedPayload}.${sign(encodedPayload, signingSecret)}`
  const origin = (options.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://krysleagues.com").replace(/\/$/, "")
  return `${origin}/scorecards?fixture=${encodeURIComponent(token)}`
}

export function parseScorecardDeepLinkToken(token: string | null | undefined) {
  const signingSecret = secret()
  if (!signingSecret || !token || token.length > 1024) return null
  const [encodedPayload, receivedSignature, extra] = token.split(".")
  if (!encodedPayload || !receivedSignature || extra || !/^[A-Za-z0-9_-]+$/.test(encodedPayload) || !/^[A-Za-z0-9_-]{43}$/.test(receivedSignature)) return null
  const expectedSignature = Buffer.from(sign(encodedPayload, signingSecret))
  const actualSignature = Buffer.from(receivedSignature)
  if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) return null
  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<DirectLinkPayload>
    if (payload.v !== DIRECT_LINK_VERSION || typeof payload.adapterKey !== "string" || !ENABLED_ADAPTERS.has(payload.adapterKey as ScorecardAdapterKey) || !SCORECARD_ADAPTER_KEYS.includes(payload.adapterKey as ScorecardAdapterKey)) return null
    if (typeof payload.sourceKey !== "string" || !payload.sourceKey || payload.sourceKey.length > 200 || typeof payload.componentKey !== "string" || !validComponent(payload.adapterKey as DirectLinkPayload["adapterKey"], payload.componentKey)) return null
    return { adapterKey: payload.adapterKey as DirectLinkPayload["adapterKey"], sourceKey: payload.sourceKey, componentKey: payload.componentKey }
  } catch {
    return null
  }
}
