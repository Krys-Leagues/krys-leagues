import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

const MAX_CLOCK_SKEW_SECONDS = 300

function bridgeSecret() {
  return process.env.SCORECARD_BRIDGE_SECRET?.trim() || null
}

export function createScorecardBridgeSignature(options: {
  secret: string
  timestamp: string
  method: string
  pathname: string
  body: Uint8Array
}) {
  const digest = createHash("sha256").update(options.body).digest("hex")
  const payload = `${options.timestamp}.${options.method.toUpperCase()}.${options.pathname}.${digest}`
  return createHmac("sha256", options.secret).update(payload).digest("hex")
}

export async function verifyScorecardBridgeRequest(request: Request) {
  const secret = bridgeSecret()
  if (!secret) return { verified: false as const, response: Response.json({ error: "Scorecard intake is not configured." }, { status: 503 }) }
  const timestamp = request.headers.get("x-krys-timestamp")?.trim() || ""
  const signature = request.headers.get("x-krys-signature")?.trim().toLowerCase() || ""
  const seconds = Number(timestamp)
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature) || !Number.isSafeInteger(seconds)) {
    return { verified: false as const, response: Response.json({ error: "Scorecard bridge authentication required." }, { status: 401 }) }
  }
  if (Math.abs(Date.now() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) {
    return { verified: false as const, response: Response.json({ error: "Scorecard bridge request expired." }, { status: 401 }) }
  }
  const body = new Uint8Array(await request.arrayBuffer())
  const expected = Buffer.from(createScorecardBridgeSignature({
    secret,
    timestamp,
    method: request.method,
    pathname: new URL(request.url).pathname,
    body,
  }), "hex")
  const received = Buffer.from(signature, "hex")
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { verified: false as const, response: Response.json({ error: "Scorecard bridge authentication failed." }, { status: 401 }) }
  }
  return { verified: true as const, body }
}

export function parseVerifiedScorecardJson<T>(body: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(body)) as T
}
