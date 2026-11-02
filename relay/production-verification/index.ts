import { createHmac, createSign, timingSafeEqual } from "node:crypto";

declare const Bun: {
  env: Record<string, string | undefined>;
  serve(options: { port: number; fetch: (request: Request) => Response | Promise<Response> }): unknown;
};

type RelayEvent = {
  id?: string;
  type?: string;
  payload?: Record<string, unknown>;
};

type Zone = {
  id: string;
  repository: string;
  projectId: string;
  productionUrl: string;
};

const REPOSITORY = "Krys-Leagues/krys-leagues";
const WORKFLOW_EVENT = "vercel-production-deployment";
const MAX_BODY_BYTES = 256 * 1024;
const DEDUPE_TTL_MS = 15 * 60 * 1000;

// This is a deliberately small allowlist copied from the authoritative verifier
// manifest. It is not a second source of baselines; it only prevents an event for
// an unknown Vercel project from reaching GitHub Actions.
const ZONES: Zone[] = [
  { id: "main-hub", repository: "Krys-Leagues/krys-leagues", projectId: "prj_kJFpXPoszhcRTUNjdQgpsA1ppFoH", productionUrl: "https://krysleagues.com" },
  { id: "five-four-three-two-one", repository: "Krys-Leagues/five-four-three-two-one-signups", projectId: "prj_iSw7Bi26JruosXuY28VJwaWNcc7v", productionUrl: "https://54321.krysleagues.com" },
  { id: "mga-championship", repository: "Krys-Leagues/mga-championship-independent", projectId: "prj_hQj33zk1KDRfOhWR6yfJbady6eRR", productionUrl: "https://mga-championship-independent.vercel.app" },
  { id: "player-profiles", repository: "Krys-Leagues/krys-leagues-player-profiles", projectId: "prj_JWE3orOsWg5I8ZGov1dESkjt8xAf", productionUrl: "https://krys-leagues-player-profiles.vercel.app" },
  { id: "kwt", repository: "Krys-Leagues/krys-kwt-league-hub", projectId: "prj_iOEKnC8k16Wm8Ac5JdoKilu3gh2Y", productionUrl: "https://krys-kwt-league-hub.vercel.app" },
  { id: "four-majors", repository: "Krys-Leagues/four-majors-hub", projectId: "prj_Mbu52ClVAbRdjyYunPaI7WnlHrJk", productionUrl: "https://four-majors-hub.vercel.app" },
  { id: "bracket-tournaments", repository: "Krys-Leagues/krys-leagues-bracket-tournaments", projectId: "prj_eLoOuRKhVR0GonyGauvgLhSvFj8o", productionUrl: "https://krys-leagues-bracket-tournaments.vercel.app" },
  { id: "all-time-records", repository: "Krys-Leagues/krys-leagues-all-time-records", projectId: "prj_KUO7e7ihZCzUVRKUqOUphOOBpFEk", productionUrl: "https://krys-leagues-all-time-records.vercel.app" },
  { id: "monthlies", repository: "Krys-Leagues/krys-leagues-monthlies", projectId: "prj_3GYtgP6XVfKobDG2LqgGEsbysozr", productionUrl: "https://krys-leagues-monthlies.vercel.app" },
  { id: "pro-league", repository: "Krys-Leagues/krys-leagues-pro-league", projectId: "prj_U4EISRqsBAAWQJz83D2awnYrxqto", productionUrl: "https://krys-leagues-pro-league.vercel.app" },
  { id: "pyp", repository: "Krys-Leagues/krys-pyp-standalone", projectId: "prj_lJAnkLbm2zxrpc7OuXuuBJx0SmLk", productionUrl: "https://krys-pyp-standalone.vercel.app" },
  { id: "doubles-league", repository: "Krys-Leagues/krys-doubles-league-standalone", projectId: "prj_JntgxiSDhHv5L0TLclB2zKpx5boi", productionUrl: "https://krys-doubles-league-standalone.vercel.app" },
  { id: "course-challenges", repository: "Krys-Leagues/krys-course-challenges-recovery", projectId: "prj_94La98c2pD9ryhUjocAGSmHtg6e7", productionUrl: "https://krys-course-challenges-recovery.vercel.app" },
];

const seen = new Map<string, number>();

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function equalHex(actual: string | null, expected: string) {
  if (!actual || !/^[a-f0-9]+$/i.test(actual) || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual.toLowerCase(), "utf8"), Buffer.from(expected.toLowerCase(), "utf8"));
}

export function verifyVercelSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  return equalHex(signature, createHmac("sha1", secret).update(rawBody, "utf8").digest("hex"));
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

function asString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
}

function normalizeUrl(value: string | null) {
  if (!value) return null;
  const withScheme = value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function extractDeployment(event: RelayEvent) {
  const eventPayload = asRecord(event.payload) ?? {};
  const deployment = asRecord(eventPayload.deployment) ?? eventPayload;
  const meta = asRecord(deployment.meta) ?? {};
  const gitSource = asRecord(deployment.gitSource) ?? {};
  const project = asRecord(eventPayload.project) ?? asRecord(deployment.project) ?? {};
  const type = asString(event.type) ?? "";
  const target = asString(eventPayload.target, deployment.target, meta.target);
  const projectId = asString(eventPayload.projectId, project.id, deployment.projectId);
  const deploymentId = asString(deployment.id, eventPayload.deploymentId);
  const deploymentUrl = asString(deployment.url, eventPayload.url);
  const commitSha = asString(
    eventPayload.commitSha,
    deployment.sha,
    deployment.commitSha,
    meta.githubCommitSha,
    meta.gitCommitSha,
    gitSource.sha,
  );
  const repository = asString(
    eventPayload.repository,
    meta.githubCommitRepo,
    meta.githubRepository,
    gitSource.repo,
  );
  return { type, target, projectId, deploymentId, deploymentUrl, commitSha, repository, eventId: asString(event.id) };
}

export function validateDeployment(event: RelayEvent) {
  const extracted = extractDeployment(event);
  if (!['deployment.succeeded', 'deployment-ready'].includes(extracted.type)) throw new Error("unsupported_event");
  if (extracted.target !== "production") throw new Error("not_production");
  const zone = ZONES.find((item) => item.projectId === extracted.projectId);
  if (!zone) throw new Error("unknown_project");
  if (!extracted.deploymentId || !/^dpl_[A-Za-z0-9]+$/.test(extracted.deploymentId)) throw new Error("invalid_deployment_id");
  if (!extracted.commitSha || !/^[a-f0-9]{40}$/i.test(extracted.commitSha)) throw new Error("missing_commit_sha");
  const deploymentUrl = normalizeUrl(extracted.deploymentUrl);
  if (!deploymentUrl || (!deploymentUrl.hostname.endsWith(".vercel.app") && deploymentUrl.hostname !== new URL(zone.productionUrl).hostname)) {
    throw new Error("invalid_deployment_url");
  }
  if (extracted.repository && extracted.repository.toLowerCase() !== zone.repository.toLowerCase()) throw new Error("repository_mismatch");
  const idempotencyKey = `${zone.id}:${extracted.deploymentId}:${extracted.commitSha.toLowerCase()}`;
  return { zone, ...extracted, deploymentUrl: deploymentUrl.toString(), repository: zone.repository, idempotencyKey };
}

function pruneSeen(now = Date.now()) {
  for (const [key, expiresAt] of seen) if (expiresAt <= now) seen.delete(key);
}

function markSeen(key: string, now = Date.now()) {
  pruneSeen(now);
  if (seen.has(key)) return false;
  seen.set(key, now + DEDUPE_TTL_MS);
  return true;
}

async function dispatchToGitHub(input: ReturnType<typeof validateDeployment>) {
  const token = await getGitHubToken();
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "krys-leagues-production-verification-relay",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: WORKFLOW_EVENT,
      client_payload: {
        zone_id: input.zone.id,
        deployment_url: input.deploymentUrl,
        deployment_id: input.deploymentId,
        project_id: input.projectId,
        repository: input.repository,
        commit_sha: input.commitSha,
        idempotency_key: input.idempotencyKey,
      },
    }),
  });
  if (!response.ok) throw new Error(`github_dispatch_http_${response.status}`);
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return bytes.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createGitHubAppJwt() {
  const appId = Bun.env.GITHUB_APP_ID;
  const privateKeyB64 = Bun.env.GITHUB_APP_PRIVATE_KEY_B64;
  if (!appId || !privateKeyB64) throw new Error("github_app_not_configured");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const key = Buffer.from(privateKeyB64, "base64").toString("utf8");
  return `${unsigned}.${base64Url(signer.sign(key))}`;
}

async function getGitHubToken() {
  const installationId = Bun.env.GITHUB_INSTALLATION_ID;
  if (installationId && Bun.env.GITHUB_APP_ID && Bun.env.GITHUB_APP_PRIVATE_KEY_B64) {
    const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${createGitHubAppJwt()}`,
        "user-agent": "krys-leagues-production-verification-relay",
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`github_installation_token_http_${response.status}`);
    const body = await response.json() as { token?: string };
    if (!body.token) throw new Error("github_installation_token_missing");
    return body.token;
  }
  const directToken = Bun.env.GITHUB_DISPATCH_TOKEN;
  if (directToken) return directToken;
  throw new Error("github_dispatch_not_configured");
}

export async function handleRequest(request: Request) {
  if (request.method === "GET" && new URL(request.url).pathname === "/health") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Bun.env.VERCEL_WEBHOOK_SECRET;
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  if (!verifyVercelSignature(rawBody, request.headers.get("x-vercel-signature"), secret ?? "")) return json({ error: "invalid_signature" }, 401);
  let event: RelayEvent;
  try { event = JSON.parse(rawBody); } catch { return json({ error: "invalid_json" }, 400); }
  let input: ReturnType<typeof validateDeployment>;
  try { input = validateDeployment(event); } catch { return json({ error: "event_rejected" }, 422); }
  if (!markSeen(input.idempotencyKey)) return json({ accepted: true, duplicate: true });
  try {
    await dispatchToGitHub(input);
    return json({ accepted: true, duplicate: false });
  } catch {
    // Allow Vercel to retry if the downstream credential or API is unavailable.
    seen.delete(input.idempotencyKey);
    return json({ error: "dispatch_unavailable" }, 503);
  }
}

if (typeof Bun !== "undefined") Bun.serve({ port: Number(Bun.env.PORT ?? 3000), fetch: handleRequest });
