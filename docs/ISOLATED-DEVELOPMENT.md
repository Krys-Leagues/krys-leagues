# Isolated development and staging release workflow

This workflow protects the verified Krys Leagues baseline from feature-job overwrites.

## Central baseline

- Baseline commit: `2252ff7ec162476189f4f31b48c03add0e024ba6`
- Baseline lineage: `f47aea7` → `ec53f65` → `92ebae9` → `a326bab` → `621d592` → `2252ff7`
- Staging Supabase: `jiekoqgegqcbqaobisvm`
- Production Supabase: `jfbndcwdsvsjgnzwvexp`
- Production domains: `krysleagues.com`, `www.krysleagues.com`

The MGA Open worldwide timezone work in `2252ff7` is part of this baseline. Existing worktrees and dirty work in the original checkout are intentionally not copied into new jobs.

## Start an isolated feature job

From the repository root, run:

```powershell
.\scripts\create-isolated-feature-worktree.ps1 -JobName "player-profiles"
```

The command creates a new `codex/job-player-profiles` branch and a separate worktree. It refuses to reuse an existing path or branch. It never deploys and never changes a database.

Each job must commit its own changes. Do not deploy its worktree directly to the shared staging alias.

## Per-feature known-good registry

`release/approved-feature-registry.json` is the version-controlled contract for the approved public and admin feature families. It records routes, source files, original artwork SHA-256 values, visible behavior, interactions, preservation rules, security requirements, checkpoint commits, screenshots, evidence gaps, and owner approval state.

Every entry starts as `PENDING OWNER REVIEW`. The verifier never infers approval from Production presence, a staging Preview, HTTP 200, a successful build, or an older commit. The current MGA Open implementation is explicitly marked staging-authoritative, but remains pending until its exact owner approval evidence is recorded in the registry.

Run the registry gate with:

```powershell
node scripts/verify-feature-registry.mjs --candidate <FULL_COMMIT_SHA> --changed-from 2252ff7ec162476189f4f31b48c03add0e024ba6
```

The gate fails closed when a required route/source file disappears, an artwork hash changes, a candidate is not descended from its feature checkpoint, required markers are missing, or unreviewed paths are changed. It also rejects `APPROVED` entries without explicit dated owner evidence.

After the owner approves one exact Preview, record only that feature version. This preserves the previous checkpoint in `feature.history`:

```powershell
node scripts/record-feature-approval.mjs `
  --feature <FEATURE_ID> `
  --commit <FULL_COMMIT_SHA> `
  --deployment-id <VERCEL_DEPLOYMENT_ID> `
  --preview-url https://<deployment>.vercel.app `
  --approval-date YYYY-MM-DD `
  --evidence docs/approval.md,tests/evidence.json `
  --desktop-screenshots evidence/desktop.png `
  --mobile-screenshots evidence/mobile.png `
  --owner-approved
```

The approval command captures fresh artwork hashes and screenshot references, refuses missing owner approval, non-Preview URLs, short SHAs, missing evidence, unknown features, and candidates that fail the registry gate. It does not deploy, change aliases, modify databases, or approve other features.

## Validate a candidate

From the job worktree:

```powershell
node scripts/verify-release-safety.mjs --baseline 2252ff7ec162476189f4f31b48c03add0e024ba6 --commit <FULL_COMMIT_SHA>
npm run test:isolation
npx tsc --noEmit
npm run lint
npm run build
```

The guard rejects dirty trees, missing approved routes/assets, lost source markers, migration drift, and candidates that are not descendants of the approved baseline.

## Private Preview only

After validation, use the Vercel team Preview command from the committed job worktree:

```powershell
vercel deploy --yes --scope krys-leagues-projects
```

Do not add `--prod`, do not promote, and do not assign a shared alias. Create a deployment-specific protected share link through the authorized Vercel access tool when browser verification is needed. Never put share tokens or credentials in source, reports, or logs.

Record a Preview evidence JSON file and validate it:

```powershell
node scripts/validate-staging-preview-report.mjs release/preview-report.json
```

The evidence must include a READY `*.vercel.app` deployment, full source and parent SHAs, browser smoke PASS, `databaseWrites: false`, `productionTouched: false`, and `sharedStagingAliasChanged: false`.

## Integration order

1. Verify the job commit and Preview evidence.
2. Compare the candidate against the latest approved central baseline.
3. Integrate forward into a new central integration branch.
4. Re-run route/artwork/source checks and the build on the integrated tree.
5. Deploy the integrated tree to a new private Preview.
6. Keep the shared staging alias unchanged until explicit owner approval.

Never merge an isolated job by copying whole source files from an older branch. Resolve conflicts deliberately and preserve the newer side of unrelated work.

## Protected operations

The following always require explicit owner approval and are not automated by this workflow:

- Production deployment, promotion, rollback, or domain change.
- Production database writes or migrations.
- Destructive or access-control migrations.
- Shared staging alias changes.
- Credential, OAuth, RLS, or authorization changes.
- Publication of real scores, trophies, or championship articles.

Staging-only feature development and private Preview deployment are permitted, but Supabase migrations must still be reviewed for target project and safety before execution.
