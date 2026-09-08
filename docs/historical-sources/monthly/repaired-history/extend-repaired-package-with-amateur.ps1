Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$outputDir = Join-Path $PSScriptRoot 'amateur-extended'
$baseDir = $PSScriptRoot
$recoveryDir = Join-Path (Split-Path -Parent $baseDir) 'completeness-recovery\amateur-recovery\public-targeted-http-v2'
$utf8 = New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function Hash-Text([string]$value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($value))).Replace('-', '').ToLowerInvariant()) }
  finally { $sha.Dispose() }
}

function Hash-File([string]$path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($path))).Replace('-', '').ToLowerInvariant()) }
  finally { $sha.Dispose() }
}

function Write-Tsv([string]$path, [object[]]$rows, [string[]]$headers) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add(($headers -join "`t"))
  foreach ($row in $rows) {
    $values = foreach ($header in $headers) {
      $property = $row.PSObject.Properties[$header]
      if ($null -eq $property) { throw "TSV row missing field $header" }
      $value = [string]$property.Value
      if ($value.Contains([char]9) -or $value.Contains([char]13) -or $value.Contains([char]10)) { throw "TSV field $header contains a tab/newline" }
      $value
    }
    $lines.Add(($values -join "`t"))
  }
  [IO.File]::WriteAllText($path, ($lines -join "`n") + "`n", $utf8)
}

function New-Key([string]$periodId, [string]$divisionId, [string]$sourcePlayerId, [string]$sourcePlayerName, [string]$course, [string]$difficulty) {
  $playerPart = if ([string]::IsNullOrWhiteSpace($sourcePlayerId)) { "name:$sourcePlayerName" } else { "id:$sourcePlayerId" }
  return "$periodId|$divisionId|$playerPart|$course|$difficulty"
}

function New-CourseParts([string]$course) {
  if ($course -match '(?i)(?:\s+-)?\s*Hard$') { return @([string]($course -replace '(?i)\s+-?\s*Hard$', ''), 'hard') }
  return @($course, 'easy')
}

function Get-PeriodParts([string]$period) {
  $match = [regex]::Match($period, '^(\d{4})\s+([A-Za-z]+)$')
  if (-not $match.Success) { throw "Invalid period: $period" }
  $month = [datetime]::ParseExact($match.Groups[2].Value, 'MMMM', [Globalization.CultureInfo]::InvariantCulture).Month
  return @($match.Groups[1].Value, [string]$month)
}

$obsPath = Join-Path $recoveryDir 'amateur-recovered-score-observations.tsv'
$unplayedPath = Join-Path $recoveryDir 'amateur-recovered-unplayed-evidence.tsv'
$inventoryPath = Join-Path $recoveryDir 'amateur-recovery-inventory.tsv'
$baseObsPath = Join-Path $baseDir 'repaired-monthly-observations.tsv'
$baseUnplayedPath = Join-Path $baseDir 'repaired-monthly-unplayed-evidence.tsv'
$baseProvPath = Join-Path $baseDir 'repaired-monthly-provenance.tsv'
$baseLedgerPath = Join-Path $baseDir 'repaired-monthly-merge-ledger.tsv'
$baseQuarantinePath = Join-Path $baseDir 'repaired-monthly-review-quarantine.tsv'

$amateurObs = @(Import-Csv -Delimiter ([char]9) -LiteralPath $obsPath)
$amateurUnplayed = @(Import-Csv -Delimiter ([char]9) -LiteralPath $unplayedPath)
$inventory = @(Import-Csv -Delimiter ([char]9) -LiteralPath $inventoryPath)
$baseObs = @(Import-Csv -Delimiter ([char]9) -LiteralPath $baseObsPath)
$baseUnplayed = @(Import-Csv -Delimiter ([char]9) -LiteralPath $baseUnplayedPath)
$baseProv = @(Import-Csv -Delimiter ([char]9) -LiteralPath $baseProvPath)
$baseLedger = @(Import-Csv -Delimiter ([char]9) -LiteralPath $baseLedgerPath)
$baseQuarantine = @(Import-Csv -Delimiter ([char]9) -LiteralPath $baseQuarantinePath)

if ($amateurObs.Count -ne 1553 -or $amateurUnplayed.Count -ne 1063 -or $inventory.Count -ne 35) { throw "Unexpected targeted counts: obs=$($amateurObs.Count), unplayed=$($amateurUnplayed.Count), cells=$($inventory.Count)" }
if ($baseObs.Count -ne 17462 -or $baseUnplayed.Count -ne 4909 -or $baseQuarantine.Count -ne 1) { throw "Unexpected base package counts" }

$inventoryByCell = @{}
foreach ($cell in $inventory) { $inventoryByCell["$($cell.period_id)|$($cell.division_id)"] = $cell }
$newRows = New-Object System.Collections.Generic.List[object]
$newProvenance = New-Object System.Collections.Generic.List[object]
$newLedger = New-Object System.Collections.Generic.List[object]
$seenKeys = @{}
$seenFingerprints = @{}
$freshRow = 0
foreach ($row in $amateurObs) {
  $freshRow++
  $parts = New-CourseParts ([string]$row.course)
  $course = [string]$parts[0]
  $difficulty = [string]$parts[1]
  $key = New-Key ([string]$row.period_id) ([string]$row.division_id) ([string]$row.source_player_id) ([string]$row.source_player_name) $course $difficulty
  if ($seenKeys.ContainsKey($key)) { throw "Duplicate targeted logical key: $key" }
  $seenKeys[$key] = $true
  $fingerprint = Hash-Text "repaired-monthly-v1|$key"
  if ($seenFingerprints.ContainsKey($fingerprint)) { throw "Duplicate repaired fingerprint: $fingerprint" }
  $seenFingerprints[$fingerprint] = $true
  $periodParts = Get-PeriodParts ([string]$row.period)
  $cell = $inventoryByCell["$($row.period_id)|$($row.division_id)"]
  $rawFile = "completeness-recovery/amateur-recovery/public-targeted-http-v2/raw/period-$($row.period_id)-division-$($row.division_id).json"
  $sourceUrl = [string]$cell.source_request_url
  $newRows.Add([pscustomobject]@{
    source_row = [string]($baseObs.Count + $freshRow); logical_observation_key = $key; merge_status = 'NEW_ONLY'; repaired_source_fingerprint = $fingerprint
    period = [string]$row.period; year = [string]$periodParts[0]; month = [string]$periodParts[1]; period_id = [string]$row.period_id; division = [string]$row.division; division_id = [string]$row.division_id
    historical_player_name = [string]$row.source_player_name; source_player_id = [string]$row.source_player_id; course_name = $course; difficulty = $difficulty
    score_text = [string]$row.score_text; score_numeric = [string]$row.score_numeric; played_state = 'PLAYED'; hole_in_ones = [string]$row.hn1; course_placement = [string]$row.placement; course_points = [string]$row.points
    overall_placement = ''; courses_played = ''; total_strokes = ''; overall_hole_in_ones = ''; overall_points = ''; source_url = $sourceUrl; old_source_row = ''; fresh_source_row = [string]$freshRow; fresh_raw_sha256 = [string]$row.raw_json_sha256; fresh_raw_file = $rawFile; provenance_sources = 'FRESH_PUBLIC_AMATEUR_TARGETED'
  })
  $newProvenance.Add([pscustomobject]@{ logical_observation_key = $key; merge_status = 'NEW_ONLY'; source_kind = 'FRESH_PUBLIC_AMATEUR_TARGETED'; source_row = [string]$freshRow; source_fingerprint = (Hash-Text "fresh-public-amateur-v1|$freshRow|$key|$($row.score_text)|$($row.raw_json_sha256)"); source_file = $rawFile; source_url = $sourceUrl; score_text = [string]$row.score_text; played_state = 'PLAYED'; raw_sha256 = [string]$row.raw_json_sha256; notes = 'Targeted public recovery after exact rendered ID discovery: Amateur 1=26, Amateur 2=27, Amateur 3=28.' })
  $newLedger.Add([pscustomobject]@{ logical_observation_key = $key; classification = 'NEW_ONLY'; import_decision = 'INCLUDE'; period = [string]$row.period; period_id = [string]$row.period_id; division = [string]$row.division; division_id = [string]$row.division_id; source_player_id = [string]$row.source_player_id; historical_player_name = [string]$row.source_player_name; course_name = $course; difficulty = $difficulty; old_score_text = ''; new_score_text = [string]$row.score_text; repaired_source_fingerprint = $fingerprint; old_source_row = ''; fresh_source_row = [string]$freshRow; fresh_raw_sha256 = [string]$row.raw_json_sha256 })
}

$newUnplayed = New-Object System.Collections.Generic.List[object]
$unplayedRow = 0
foreach ($row in $amateurUnplayed) {
  $unplayedRow++
  $parts = New-CourseParts ([string]$row.course)
  $course = [string]$parts[0]
  $difficulty = [string]$parts[1]
  $key = New-Key ([string]$row.period_id) ([string]$row.division_id) ([string]$row.source_player_id) ([string]$row.source_player_name) $course $difficulty
  if ($seenKeys.ContainsKey($key)) { throw "Targeted played/unplayed collision: $key" }
  $seenKeys[$key] = $true
  $periodParts = Get-PeriodParts ([string]$row.period)
  $cell = $inventoryByCell["$($row.period_id)|$($row.division_id)"]
  $rawFile = "completeness-recovery/amateur-recovery/public-targeted-http-v2/raw/period-$($row.period_id)-division-$($row.division_id).json"
  $newUnplayed.Add([pscustomobject]@{
    source_row = [string]($baseObs.Count + $amateurObs.Count + $unplayedRow); logical_observation_key = $key; merge_status = 'NEW_ONLY'; repaired_source_fingerprint = (Hash-Text "repaired-monthly-v1|$key")
    period = [string]$row.period; year = [string]$periodParts[0]; month = [string]$periodParts[1]; period_id = [string]$row.period_id; division = [string]$row.division; division_id = [string]$row.division_id
    historical_player_name = [string]$row.source_player_name; source_player_id = [string]$row.source_player_id; course_name = $course; difficulty = $difficulty; score_text = ''; score_numeric = ''; played_state = 'UNPLAYED'
    hole_in_ones = [string]$row.hn1; course_placement = [string]$row.placement; course_points = [string]$row.points; overall_placement = ''; courses_played = ''; total_strokes = ''; overall_hole_in_ones = ''; overall_points = ''
    source_url = [string]$cell.source_request_url; old_source_row = ''; fresh_source_row = "UNPLAYED-$unplayedRow"; fresh_raw_sha256 = [string]$row.raw_json_sha256; fresh_raw_file = $rawFile; provenance_sources = 'FRESH_PUBLIC_AMATEUR_TARGETED'
  })
  $newProvenance.Add([pscustomobject]@{ logical_observation_key = $key; merge_status = 'NEW_ONLY'; source_kind = 'FRESH_PUBLIC_AMATEUR_TARGETED'; source_row = "UNPLAYED-$unplayedRow"; source_fingerprint = ''; source_file = $rawFile; source_url = [string]$cell.source_request_url; score_text = ''; played_state = 'UNPLAYED'; raw_sha256 = [string]$row.raw_json_sha256; notes = 'Blank course slot preserved as evidence only; no historical score observation is created.' })
  $newLedger.Add([pscustomobject]@{ logical_observation_key = $key; classification = 'NEW_ONLY'; import_decision = 'EVIDENCE_ONLY_UNPLAYED'; period = [string]$row.period; period_id = [string]$row.period_id; division = [string]$row.division; division_id = [string]$row.division_id; source_player_id = [string]$row.source_player_id; historical_player_name = [string]$row.source_player_name; course_name = $course; difficulty = $difficulty; old_score_text = ''; new_score_text = ''; repaired_source_fingerprint = (Hash-Text "repaired-monthly-v1|$key"); old_source_row = ''; fresh_source_row = "UNPLAYED-$unplayedRow"; fresh_raw_sha256 = [string]$row.raw_json_sha256 })
}

$observationHeaders = @('source_row','logical_observation_key','merge_status','repaired_source_fingerprint','period','year','month','period_id','division','division_id','historical_player_name','source_player_id','course_name','difficulty','score_text','score_numeric','played_state','hole_in_ones','course_placement','course_points','overall_placement','courses_played','total_strokes','overall_hole_in_ones','overall_points','source_url','old_source_row','fresh_source_row','fresh_raw_sha256','fresh_raw_file','provenance_sources')
$provenanceHeaders = @('logical_observation_key','merge_status','source_kind','source_row','source_fingerprint','source_file','source_url','score_text','played_state','raw_sha256','notes')
$ledgerHeaders = @('logical_observation_key','classification','import_decision','period','period_id','division','division_id','source_player_id','historical_player_name','course_name','difficulty','old_score_text','new_score_text','repaired_source_fingerprint','old_source_row','fresh_source_row','fresh_raw_sha256')
$allObs = @($baseObs + $newRows.ToArray())
$allUnplayed = @($baseUnplayed + $newUnplayed.ToArray())
$allProv = @($baseProv + $newProvenance.ToArray())
$allLedger = @($baseLedger + $newLedger.ToArray())
Write-Tsv (Join-Path $outputDir 'repaired-monthly-observations.tsv') $allObs $observationHeaders
Write-Tsv (Join-Path $outputDir 'repaired-monthly-unplayed-evidence.tsv') $allUnplayed $observationHeaders
Write-Tsv (Join-Path $outputDir 'repaired-monthly-provenance.tsv') $allProv $provenanceHeaders
Write-Tsv (Join-Path $outputDir 'repaired-monthly-merge-ledger.tsv') $allLedger $ledgerHeaders
Copy-Item -LiteralPath $baseQuarantinePath -Destination (Join-Path $outputDir 'repaired-monthly-review-quarantine.tsv') -Force

$exclusions = @(
  [pscustomobject]@{ scope = 'division'; period_scope = 'all finalized source periods'; division = 'Semi Pro 4'; source_id = ''; status = 'NO_PROVEN_PARTICIPATION'; row_count = '0'; reason = 'No preserved authoritative participation evidence.' },
  [pscustomobject]@{ scope = 'period'; period_scope = '2024 January through 2024 July'; division = ''; source_id = ''; status = 'UNKNOWN_NO_OBSERVATIONS_IMPORTED'; row_count = '0'; reason = 'No affirmative historical result evidence; no rows fabricated.' },
  [pscustomobject]@{ scope = 'period'; period_scope = '2026 September and later'; division = ''; source_id = ''; status = 'CURRENT_OR_FUTURE_EXCLUDED'; row_count = '0'; reason = 'September 2026 is current/in-progress; later periods are not finalized.' },
  [pscustomobject]@{ scope = 'logical_observation'; period_scope = '2025 August'; division = 'Elite'; source_id = '22'; status = 'QUARANTINED_SOURCE_DRIFT_REVIEW'; row_count = '1'; reason = 'PETERK9FLORIDA / Atlantis remains excluded pending authoritative score resolution.' }
)
Write-Tsv (Join-Path $outputDir 'repaired-monthly-exclusions.tsv') $exclusions @('scope','period_scope','division','source_id','status','row_count','reason')

$zero = @($allObs | Where-Object { $_.played_state -eq 'PLAYED' -and [int]$_.score_numeric -eq 0 }).Count
$negative = @($allObs | Where-Object { $_.played_state -eq 'PLAYED' -and [int]$_.score_numeric -lt 0 }).Count
$positive = @($allObs | Where-Object { $_.played_state -eq 'PLAYED' -and [int]$_.score_numeric -gt 0 }).Count
$hashes = [ordered]@{}
foreach ($file in @('repaired-monthly-observations.tsv','repaired-monthly-unplayed-evidence.tsv','repaired-monthly-provenance.tsv','repaired-monthly-merge-ledger.tsv','repaired-monthly-exclusions.tsv','repaired-monthly-review-quarantine.tsv')) { $hashes[$file] = Hash-File (Join-Path $outputDir $file) }
$manifest = [ordered]@{
  package = 'repaired historical Monthlies source package with targeted Amateur recovery'; schema_version = 'repaired-monthly-v2-score-only-amateur-extended'; generated_at = (Get-Date).ToUniversalTime().ToString('o'); generated_by = 'extend-repaired-package-with-amateur.ps1'
  parent_package = 'repaired-history/repaired-monthly-manifest.json'; raw_targeted_source = 'completeness-recovery/amateur-recovery/public-targeted-http-v2'; finalized_scope = '2024 August through 2026 August; 2024 January-July UNKNOWN and excluded'
  division_ids = [ordered]@{ 'Amateur 1' = '26'; 'Amateur 2' = '27'; 'Amateur 3' = '28' }
  counts = [ordered]@{ import_ready_numeric_observations = $allObs.Count; played_scored = $allObs.Count; blank_unplayed_evidence = $allUnplayed.Count; zero_scores = $zero; negative_scores = $negative; positive_scores = $positive; malformed = 0; duplicate_logical_keys = 0; duplicate_fingerprints = 0; targeted_amateur_numeric_additions = $amateurObs.Count; targeted_amateur_unplayed_evidence = $amateurUnplayed.Count; quarantined_rows = 1; pending_amateur_rows_excluded = 0 }
  semantics = [ordered]@{ numeric_score = 'Importable historical observation, including zero'; zero = 'Played at even par'; negative = 'Played under par'; positive = 'Played over par'; blank = 'Unplayed evidence only; no score row created' }
  evidence = [ordered]@{ targeted_cells = $inventory.Count; targeted_numeric_source_file = 'amateur-recovered-score-observations.tsv'; targeted_unplayed_source_file = 'amateur-recovered-unplayed-evidence.tsv'; target_raw_responses = 105; source_id_discovery = 'September 2024 period 55 public rendered labels: 26 Amateur 1, 27 Amateur 2, 28 Amateur 3' }
  finalization = [ordered]@{ finalizedThrough = '2026 August'; currentIncompletePeriod = '2026 September'; currentPeriodReason = 'September 2026 is current/in-progress and excluded.' }
  file_sha256 = $hashes
}
[IO.File]::WriteAllText((Join-Path $outputDir 'repaired-monthly-manifest.json'), ($manifest | ConvertTo-Json -Depth 12), $utf8)
Write-Output ($manifest | ConvertTo-Json -Depth 12)
