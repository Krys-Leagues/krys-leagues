# Independent Production Verification

This is a read-only release-safety layer for the Krys Leagues Main Hub and its independent applications. It does not deploy, promote, roll back, change DNS, change authentication, or write to any database.

## Source of truth

[`manifest.json`](./manifest.json) records each independent repository, Vercel project, Production URL, critical routes, public read checks, approved baseline, and Main Hub/back-link expectations. Every zone keeps its own Git history, Vercel project, artwork, and deployment history. A missing baseline is intentionally a blocker; it must not be filled with a guess.

## Status meanings

- `COMPLETE`: live routes, required markers, read-only checks, Main Hub link, Back-to-Hub link, artwork checksums, and exact deployment/commit baseline all pass.
- `LIVE`: the Production site responds and its configured checks pass, but its approved source/deployment baseline is missing or not yet proven.
- `PREVIEW`: reserved for a separately supplied Preview result; Preview never substitutes for Production.
- `BLOCKED`: a route, destination, read-only check, artwork checksum, or provenance check failed.
- `NOT_YET_LIVE`: reserved for a zone without a verified Production URL.

Each report also carries `availability`: `PUBLIC`, `NOT_YET_PUBLIC`, `INACCESSIBLE`, or `BROKEN`. A 401/403 or a 404 on a zone whose Vercel custom-domain evidence is absent is reported as access/provenance uncertainty, not as a confirmed application defect. A failing route on an observed public domain is reported as `BROKEN` with the exact route and response.

The workflow produces `production-verification-status.json` as the central status dashboard artifact and adds a compact table to the GitHub Actions summary.

`provider-audit.json` is the read-only 2026-11-02 inventory snapshot. It records Vercel project/deployment evidence separately from Owner-approved baselines. A Vercel project or deployment observed by the connector is not treated as an approved release, and a GitHub 404 is kept as `UNVERIFIED` because it may represent private access or a naming mismatch.

## Automatic trigger

The workflow accepts:

1. `deployment_status` events when the Vercel Git integration reports a successful Production deployment.
2. `repository_dispatch` with event type `vercel-production-deployment` and a payload containing `zone_id`, `deployment_url`, `deployment_id`, and `commit_sha`.
3. Manual `workflow_dispatch` for controlled verification.

The repository-dispatch path requires an Owner-configured Vercel-to-GitHub event bridge or GitHub App with least-privilege permission to dispatch this one event. The payload must include `zone_id`, `deployment_url`, `deployment_id`, `commit_sha`, `project_id`, and `repository`. The bridge must send only deployment metadata; it must not send secrets, database credentials, cookies, or player data. Until that bridge is configured and tested, automatic verification is not active; the workflow remains safely manual/event-ready.

The workflow is event-safe: it validates repository-dispatch metadata against the manifest, emits a unique `zone_id:deployment_id:commit_sha` key, coalesces repeated events with GitHub Actions concurrency, runs a fast route check first, then a broader read-only audit, and never deploys or rolls back. The `deployment_status` path remains available for Vercel/GitHub integrations that emit authenticated GitHub deployment events.

Owner activation checklist for the repository-dispatch bridge:

1. Use an Owner-controlled GitHub App or least-privilege token that can dispatch only `vercel-production-deployment` to this repository; keep it outside the repository and never place it in the manifest.
2. Configure the Vercel-to-GitHub relay/webhook for each participating project to send only `zone_id`, `deployment_url`, `deployment_id`, `project_id`, `repository`, and `commit_sha`.
3. Store the relay credential in the relay's secret store, test one non-Production event, and confirm the Actions summary and artifact before enabling Production events.
4. Set `approvedBaseline` values only after the Owner reviews the exact Production deployment and commit. `observedProduction` values in the manifest are evidence, not approval.

## Baseline and release checklist

Before marking a zone `COMPLETE`, record and review:

1. Independent GitHub repository and Vercel project ID.
2. Exact Production URL.
3. Exact approved Production deployment ID.
4. Exact source commit SHA.
5. Approved artwork checksums and live asset paths where applicable.
6. Critical routes and read-only data checks.
7. Main Hub destination and working Back-to-Hub link.
8. Focused verification result and artifact.

No verification step automatically deploys a repair or rolls back a release. Any correction remains a separate Owner-approved release in the affected independent project.
