import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { extractDeployment, validateDeployment, verifyVercelSignature } from "./index.ts";

const secret = "synthetic-vercel-secret";
const event = {
  id: "evt_synthetic_1",
  type: "deployment.succeeded",
  payload: {
    target: "production",
    projectId: "prj_hQj33zk1KDRfOhWR6yfJbady6eRR",
    deployment: {
      id: "dpl_synthetic123",
      url: "mga-championship-independent.vercel.app",
      meta: { githubCommitSha: "0123456789abcdef0123456789abcdef01234567" },
    },
  },
};
const raw = JSON.stringify(event);
const signature = createHmac("sha1", secret).update(raw).digest("hex");

assert.equal(verifyVercelSignature(raw, signature, secret), true);
assert.equal(verifyVercelSignature(raw, "00".repeat(20), secret), false);
const parsed = validateDeployment(event);
assert.equal(parsed.zone.id, "mga-championship");
assert.equal(parsed.repository, "Krys-Leagues/mga-championship-independent");
assert.equal(parsed.idempotencyKey, "mga-championship:dpl_synthetic123:0123456789abcdef0123456789abcdef01234567");
assert.throws(() => validateDeployment({ ...event, payload: { ...event.payload, target: "preview" } }), /not_production/);
assert.throws(() => validateDeployment({ ...event, payload: { ...event.payload, projectId: "prj_unknown" } }), /unknown_project/);
assert.throws(() => validateDeployment({ ...event, payload: { ...event.payload, deployment: { ...event.payload.deployment, meta: { githubCommitSha: "bad" } } } }), /missing_commit_sha/);
console.log("relay synthetic tests: 6 passed");
