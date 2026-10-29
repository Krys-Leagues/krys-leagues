param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')] [string]$JobName,
  [Parameter(Mandatory = $false)] [string]$BaseCommit = '2252ff7ec162476189f4f31b48c03add0e024ba6',
  [Parameter(Mandatory = $false)] [string]$DestinationRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) '_feature-worktrees')
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$branch = "codex/job-$JobName"
$destination = Join-Path $DestinationRoot $JobName
if (Test-Path -LiteralPath $destination) { throw "Refusing to reuse existing worktree path: $destination" }
$resolvedCommit = (& git -C $repoRoot rev-parse --verify "$BaseCommit^{commit}").Trim()
if ($LASTEXITCODE -ne 0) { throw "Base commit is not available locally: $BaseCommit" }
& git -C $repoRoot show-ref --verify --quiet "refs/heads/$branch"
if ($LASTEXITCODE -eq 0) { throw "Refusing to reuse existing branch: $branch" }
New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
& git -C $repoRoot worktree add -b $branch $destination $resolvedCommit
if ($LASTEXITCODE -ne 0) { throw "Git worktree creation failed; no deployment was attempted." }
Write-Output "ISOLATED_WORKTREE_READY"
Write-Output "Job: $JobName"
Write-Output "Branch: $branch"
Write-Output "Commit: $resolvedCommit"
Write-Output "Path: $destination"
Write-Output "Next: commit changes, run verify-release-safety.mjs, then create a private Preview only."
