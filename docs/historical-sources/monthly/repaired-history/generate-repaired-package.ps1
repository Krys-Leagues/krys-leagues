Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$oldPath = Join-Path $root 'website-recovery\monthly-website-score-observations.csv'
$newPath = Join-Path $root 'completeness-recovery\full-public-score-recovery\all-completed-monthly-score-observations.tsv'
$oldPath = [IO.Path]::GetFullPath($oldPath)
$newPath = [IO.Path]::GetFullPath($newPath)
$outputDir = $PSScriptRoot
$utf8 = New-Object Text.UTF8Encoding($false)

$divisionIds = @{
  'Master' = '21'; 'Elite' = '22'; 'Pro 1' = '23'; 'Pro 2' = '24'; 'Pro 3' = '25'
  'Semi Pro 1' = '113'; 'Semi Pro 2' = '114'; 'Semi Pro 3' = '115'; 'Beginner' = '81'; 'Welcome' = '62'
}
$pendingDivisions = @('Amateur 1', 'Amateur 2', 'Amateur 3')
$quarantineKey = '221|22|id:8108|Atlantis|easy'
$legacyFinalizationPeriod = '2026 August'

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
      if ($null -eq $property) { throw "TSV row missing field $header; type=$($row.GetType().FullName); properties=$($row.PSObject.Properties.Name -join ',')" }
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

function New-NewCourseParts([string]$course) {
  if ($course -match '(?i)(?:\s+-)?\s*Hard$') {
    return @($course -replace '(?i)\s+-?\s*Hard$', '') + @('hard')
  }
  return @($course, 'easy')
}

function Get-PeriodParts([string]$period) {
  $match = [regex]::Match($period, '^(\d{4})\s+([A-Za-z]+)$')
  if (-not $match.Success) { throw "Invalid fresh period label: $period" }
  $month = [datetime]::ParseExact($match.Groups[2].Value, 'MMMM', [Globalization.CultureInfo]::InvariantCulture).Month
  return @($match.Groups[1].Value, [string]$month)
}
function New-OldRecord($row) {
  $divisionId = $divisionIds[[string]$row.division]
  if ([string]::IsNullOrWhiteSpace($divisionId)) { throw "Unknown old-source division: $($row.division)" }
  $scoreText = [string]$row.score
  $course = [string]$row.course_name
  $difficulty = [string]$row.difficulty
  $key = New-Key ([string]$row.period_id) $divisionId ([string]$row.source_player_id) ([string]$row.historical_player_name) $course $difficulty
  $oldFingerprint = Hash-Text "old-retained-v1|$($row.source_row)|$key|$scoreText"
  return [pscustomobject]@{
    sourceKind = 'OLD_RETAINED'; sourceRow = [string]$row.source_row; period = [string]$row.period; year = [string]$row.year; month = [string]$row.month; periodId = [string]$row.period_id
    division = [string]$row.division; divisionId = $divisionId; playerName = [string]$row.historical_player_name; sourcePlayerId = [string]$row.source_player_id
    course = $course; difficulty = $difficulty; scoreText = $scoreText; scoreNumeric = $scoreText; playedState = if ([string]::IsNullOrWhiteSpace($scoreText)) { 'UNPLAYED' } else { 'PLAYED' }
    hn1 = [string]$row.hole_in_ones; coursePlacement = [string]$row.course_placement; coursePoints = [string]$row.course_points; overallPlacement = [string]$row.overall_placement
    coursesPlayed = [string]$row.courses_played; totalStrokes = [string]$row.total_strokes; overallHn1 = [string]$row.overall_hole_in_ones; overallPoints = [string]$row.overall_points
    sourceUrl = [string]$row.source_url; oldSourceRow = [string]$row.source_row; freshSourceRow = ''; rawSha = ''; rawFile = ''; fingerprint = $oldFingerprint; logicalKey = $key
  }
}

function New-NewRecord($row, [int]$sourceRow) {
  $parts = New-NewCourseParts ([string]$row.course)
  $course = [string]$parts[0]
  $difficulty = [string]$parts[1]
  $scoreText = [string]$row.score_text
  $periodParts = Get-PeriodParts ([string]$row.period)
  $key = New-Key ([string]$row.period_id) ([string]$row.division_id) ([string]$row.source_player_id) ([string]$row.source_player_name) $course $difficulty
  $newFingerprint = Hash-Text "fresh-public-v1|$sourceRow|$key|$scoreText|$($row.raw_json_sha256)"
  return [pscustomobject]@{
    sourceKind = 'FRESH_PUBLIC'; sourceRow = [string]$sourceRow; period = [string]$row.period; year = [string]$periodParts[0]; month = [string]$periodParts[1]; periodId = [string]$row.period_id
    division = [string]$row.division; divisionId = [string]$row.division_id; playerName = [string]$row.source_player_name; sourcePlayerId = [string]$row.source_player_id
    course = $course; difficulty = $difficulty; scoreText = $scoreText; scoreNumeric = [string]$row.score_numeric; playedState = if ([string]::IsNullOrWhiteSpace($scoreText)) { 'UNPLAYED' } else { 'PLAYED' }
    hn1 = [string]$row.hn1; coursePlacement = [string]$row.placement; coursePoints = [string]$row.points; overallPlacement = ''; coursesPlayed = ''; totalStrokes = ''; overallHn1 = ''; overallPoints = ''
    sourceUrl = 'https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com/ords/f?p=500:1:::1:P1_LEAGUE_ID:' + [string]$row.division_id
    oldSourceRow = ''; freshSourceRow = [string]$sourceRow; rawSha = [string]$row.raw_json_sha256; rawFile = "full-public-score-recovery/raw/period-$($row.period_id)-division-$($row.division_id).json"; fingerprint = $newFingerprint; logicalKey = $key
  }
}

$oldRows = @(Import-Csv $oldPath)
$newRows = @(Import-Csv $newPath -Delimiter "`t")
if ($oldRows.Count -ne 7285) { throw "Unexpected old source row count: $($oldRows.Count)" }
if ($newRows.Count -ne 15664) { throw "Unexpected fresh source row count: $($newRows.Count)" }

$oldByKey = @{}
foreach ($row in $oldRows) {
  $record = New-OldRecord $row
  if ($oldByKey.ContainsKey($record.logicalKey)) { throw "Duplicate old logical key: $($record.logicalKey)" }
  $oldByKey[$record.logicalKey] = $record
}
$newByKey = @{}
$newRowNumber = 0
foreach ($row in $newRows) {
  $newRowNumber++
  $record = New-NewRecord $row $newRowNumber
  if ($newByKey.ContainsKey($record.logicalKey)) { throw "Duplicate fresh logical key: $($record.logicalKey)" }
  $newByKey[$record.logicalKey] = $record
}

$ledger = New-Object System.Collections.Generic.List[object]
$package = New-Object System.Collections.Generic.List[object]
$unplayedEvidence = New-Object System.Collections.Generic.List[object]
$provenance = New-Object System.Collections.Generic.List[object]
$quarantine = New-Object System.Collections.Generic.List[object]
$allKeys = @($oldByKey.Keys + $newByKey.Keys | Sort-Object -Unique)
$packageRowNumber = 0
$counts = @{
  EXACT_BOTH = 0; OLD_ONLY = 0; NEW_ONLY = 0; LEGACY_AUGUST_EXCLUDED = 0; BLANK_TO_SCORED_REVIEW = 0; SCORED_TO_BLANK_REVIEW = 0; NUMERIC_CONFLICT_REVIEW = 0
}

foreach ($key in $allKeys) {
  $old = $oldByKey[$key]
  $fresh = $newByKey[$key]
  $classification = ''
  $decision = 'INCLUDE'
  if ($null -ne $old -and $null -ne $fresh) {
    if ($old.playedState -eq $fresh.playedState -and (($old.playedState -eq 'UNPLAYED') -or ([int]$old.scoreText -eq [int]$fresh.scoreText))) {
      $classification = 'EXACT_BOTH'; $counts.EXACT_BOTH++
    } elseif ($old.playedState -eq 'UNPLAYED' -and $fresh.playedState -eq 'PLAYED') {
      $classification = 'BLANK_TO_SCORED_REVIEW'; $decision = 'EXCLUDE_QUARANTINE'; $counts.BLANK_TO_SCORED_REVIEW++
    } elseif ($old.playedState -eq 'PLAYED' -and $fresh.playedState -eq 'UNPLAYED') {
      $classification = 'SCORED_TO_BLANK_REVIEW'; $decision = 'EXCLUDE_REVIEW'; $counts.SCORED_TO_BLANK_REVIEW++
    } else {
      $classification = 'NUMERIC_CONFLICT_REVIEW'; $decision = 'EXCLUDE_REVIEW'; $counts.NUMERIC_CONFLICT_REVIEW++
    }
  } elseif ($null -ne $old) {
    if ($old.period -eq $legacyFinalizationPeriod) {
      $classification = 'LEGACY_AUGUST_EXCLUDED'; $decision = 'EXCLUDE_LEGACY_FINALIZATION'; $counts.LEGACY_AUGUST_EXCLUDED++
    } else {
      $classification = 'OLD_ONLY'; $counts.OLD_ONLY++
    }
  } else {
    $classification = 'NEW_ONLY'; $counts.NEW_ONLY++
  }
  if ($key -eq $quarantineKey) { $classification = 'QUARANTINED_REVIEW'; $decision = 'EXCLUDE_QUARANTINE' }

  $chosen = if ($null -ne $old -and $old.period -eq $legacyFinalizationPeriod -and $null -ne $fresh) { $fresh } elseif ($null -ne $old) { $old } else { $fresh }
  $repairedFingerprint = Hash-Text "repaired-monthly-v1|$key"
  $ledger.Add([pscustomobject]@{
    logical_observation_key = $key; classification = $classification; import_decision = $decision; period = $chosen.period; period_id = $chosen.periodId; division = $chosen.division; division_id = $chosen.divisionId
    source_player_id = $chosen.sourcePlayerId; historical_player_name = $chosen.playerName; course_name = $chosen.course; difficulty = $chosen.difficulty; old_score_text = if ($null -ne $old) { $old.scoreText } else { '' }; new_score_text = if ($null -ne $fresh) { $fresh.scoreText } else { '' }
    repaired_source_fingerprint = $repairedFingerprint; old_source_row = if ($null -ne $old) { $old.sourceRow } else { '' }; fresh_source_row = if ($null -ne $fresh) { $fresh.sourceRow } else { '' }; fresh_raw_sha256 = if ($null -ne $fresh) { $fresh.rawSha } else { '' }
  })

  if ($decision -eq 'EXCLUDE_LEGACY_FINALIZATION') {
    if ($old.playedState -eq 'PLAYED') {
      $provenance.Add([pscustomobject]@{ logical_observation_key = $key; merge_status = $classification; source_kind = 'OLD_RETAINED'; source_row = $old.sourceRow; source_fingerprint = $old.fingerprint; source_file = 'website-recovery/monthly-website-score-observations.csv'; source_url = $old.sourceUrl; score_text = $old.scoreText; played_state = $old.playedState; raw_sha256 = ''; notes = 'Legacy August 2026 row retained as provenance only; finalized August payload must come from fresh finalized recovery evidence.' })
      continue
    }
    # A legacy blank remains evidence-only; it is never promoted to a score row.
  }
  if ($decision -eq 'EXCLUDE_QUARANTINE' -or $decision -eq 'EXCLUDE_REVIEW') {
    if ($classification -eq 'QUARANTINED_REVIEW') {
      $quarantine.Add([pscustomobject]@{
        logical_observation_key = $key; period = $chosen.period; period_id = $chosen.periodId; division = $chosen.division; division_id = $chosen.divisionId; source_player_id = $chosen.sourcePlayerId; historical_player_name = $chosen.playerName; course_name = $chosen.course; difficulty = $chosen.difficulty
        old_state = if ($null -ne $old) { $old.playedState } else { '' }; old_score_text = if ($null -ne $old) { $old.scoreText } else { '' }; old_source_row = if ($null -ne $old) { $old.sourceRow } else { '' }; old_source_fingerprint = if ($null -ne $old) { $old.fingerprint } else { '' }
        new_state = if ($null -ne $fresh) { $fresh.playedState } else { '' }; new_score_text = if ($null -ne $fresh) { $fresh.scoreText } else { '' }; fresh_source_row = if ($null -ne $fresh) { $fresh.sourceRow } else { '' }; fresh_raw_sha256 = if ($null -ne $fresh) { $fresh.rawSha } else { '' }; fresh_source_file = if ($null -ne $fresh) { $fresh.rawFile } else { '' }; current_reproduction_score_text = '-26'; current_reproduction_evidence = 'full-public-score-recovery/conflict-review/reproduction.tsv'
        disposition = 'QUARANTINED_SOURCE_DRIFT_REVIEW'; reason = 'Old retained source is blank/unplayed; the 2026-09-07 full-crawl artifact reports -23 while three independent reproduction captures report -26. Admin determination remains unresolved.'
      })
    }
    continue
  }

  $sourceKinds = @()
  if ($null -ne $old) { $sourceKinds += 'OLD_RETAINED' }
  if ($null -ne $fresh) { $sourceKinds += 'FRESH_PUBLIC' }
  $packageRow = [pscustomobject]@{
    source_row = ++$packageRowNumber; logical_observation_key = $key; merge_status = $classification; repaired_source_fingerprint = $repairedFingerprint; period = $chosen.period; year = $chosen.year; month = $chosen.month; period_id = $chosen.periodId; division = $chosen.division; division_id = $chosen.divisionId
    historical_player_name = $chosen.playerName; source_player_id = $chosen.sourcePlayerId; course_name = $chosen.course; difficulty = $chosen.difficulty; score_text = $chosen.scoreText; score_numeric = if ($chosen.playedState -eq 'PLAYED') { $chosen.scoreText } else { '' }; played_state = $chosen.playedState
    hole_in_ones = $chosen.hn1; course_placement = $chosen.coursePlacement; course_points = $chosen.coursePoints; overall_placement = $chosen.overallPlacement; courses_played = $chosen.coursesPlayed; total_strokes = $chosen.totalStrokes; overall_hole_in_ones = $chosen.overallHn1; overall_points = $chosen.overallPoints
    source_url = $chosen.sourceUrl; old_source_row = if ($null -ne $old) { $old.sourceRow } else { '' }; fresh_source_row = if ($null -ne $fresh) { $fresh.sourceRow } else { '' }; fresh_raw_sha256 = if ($null -ne $fresh) { $fresh.rawSha } else { '' }; fresh_raw_file = if ($null -ne $fresh) { $fresh.rawFile } else { '' }; provenance_sources = ($sourceKinds -join ',')
  }
  if ($chosen.playedState -eq 'PLAYED') { $package.Add($packageRow) } else { $unplayedEvidence.Add($packageRow) }
  if ($null -ne $old) {
    $provenance.Add([pscustomobject]@{ logical_observation_key = $key; merge_status = $classification; source_kind = 'OLD_RETAINED'; source_row = $old.sourceRow; source_fingerprint = $old.fingerprint; source_file = 'website-recovery/monthly-website-score-observations.csv'; source_url = $old.sourceUrl; score_text = $old.scoreText; played_state = $old.playedState; raw_sha256 = ''; notes = 'Original retained historical recovery source.' })
  }
  if ($null -ne $fresh) {
    $provenance.Add([pscustomobject]@{ logical_observation_key = $key; merge_status = $classification; source_kind = 'FRESH_PUBLIC'; source_row = $fresh.sourceRow; source_fingerprint = $fresh.fingerprint; source_file = $fresh.rawFile; source_url = $fresh.sourceUrl; score_text = $fresh.scoreText; played_state = $fresh.playedState; raw_sha256 = $fresh.rawSha; notes = 'Fresh rendered public recovery source.' })
  }
}

if ($counts.EXACT_BOTH -ne 384 -or $counts.OLD_ONLY -ne 6660 -or $counts.NEW_ONLY -ne 15279 -or $counts.LEGACY_AUGUST_EXCLUDED -ne 240 -or $counts.BLANK_TO_SCORED_REVIEW -ne 1 -or $counts.SCORED_TO_BLANK_REVIEW -ne 0 -or $counts.NUMERIC_CONFLICT_REVIEW -ne 0) {
  throw "Logical merge counts changed unexpectedly: $($counts | ConvertTo-Json -Compress)"
}
if ($package.Count -ne 17462) { throw "Unexpected numeric import-ready logical row count: $($package.Count)" }
if ($unplayedEvidence.Count -ne 4909) { throw "Unexpected blank/unplayed evidence row count: $($unplayedEvidence.Count)" }
if ($quarantine.Count -ne 1) { throw "Expected one quarantined row, got $($quarantine.Count)" }

$observationHeaders = @('source_row','logical_observation_key','merge_status','repaired_source_fingerprint','period','year','month','period_id','division','division_id','historical_player_name','source_player_id','course_name','difficulty','score_text','score_numeric','played_state','hole_in_ones','course_placement','course_points','overall_placement','courses_played','total_strokes','overall_hole_in_ones','overall_points','source_url','old_source_row','fresh_source_row','fresh_raw_sha256','fresh_raw_file','provenance_sources')
$provenanceHeaders = @('logical_observation_key','merge_status','source_kind','source_row','source_fingerprint','source_file','source_url','score_text','played_state','raw_sha256','notes')
$ledgerHeaders = @('logical_observation_key','classification','import_decision','period','period_id','division','division_id','source_player_id','historical_player_name','course_name','difficulty','old_score_text','new_score_text','repaired_source_fingerprint','old_source_row','fresh_source_row','fresh_raw_sha256')
$quarantineHeaders = @('logical_observation_key','period','period_id','division','division_id','source_player_id','historical_player_name','course_name','difficulty','old_state','old_score_text','old_source_row','old_source_fingerprint','new_state','new_score_text','fresh_source_row','fresh_raw_sha256','fresh_source_file','current_reproduction_score_text','current_reproduction_evidence','disposition','reason')

Write-Tsv (Join-Path $outputDir 'repaired-monthly-observations.tsv') $package.ToArray() $observationHeaders
Write-Tsv (Join-Path $outputDir 'repaired-monthly-unplayed-evidence.tsv') $unplayedEvidence.ToArray() $observationHeaders
Write-Tsv (Join-Path $outputDir 'repaired-monthly-provenance.tsv') $provenance.ToArray() $provenanceHeaders
Write-Tsv (Join-Path $outputDir 'repaired-monthly-merge-ledger.tsv') $ledger.ToArray() $ledgerHeaders
Write-Tsv (Join-Path $outputDir 'repaired-monthly-review-quarantine.tsv') $quarantine.ToArray() $quarantineHeaders
$exclusions = @(
  [pscustomobject]@{ scope = 'division'; period_scope = 'all finalized source periods'; division = 'Amateur 1'; source_id = ''; status = 'PENDING_SOURCE_ID'; row_count = '0'; reason = 'No authoritative source ID verified; exclude any rows until resolved.' },
  [pscustomobject]@{ scope = 'division'; period_scope = 'all finalized source periods'; division = 'Amateur 2'; source_id = ''; status = 'PENDING_SOURCE_ID'; row_count = '0'; reason = 'No authoritative source ID verified; exclude any rows until resolved.' },
  [pscustomobject]@{ scope = 'division'; period_scope = 'all finalized source periods'; division = 'Amateur 3'; source_id = ''; status = 'PENDING_SOURCE_ID'; row_count = '0'; reason = 'No authoritative source ID verified; exclude any rows until resolved.' },
  [pscustomobject]@{ scope = 'division'; period_scope = 'all finalized source periods'; division = 'Semi Pro 4'; source_id = ''; status = 'NO_PROVEN_PARTICIPATION'; row_count = '0'; reason = 'No preserved authoritative participation evidence.' },
  [pscustomobject]@{ scope = 'period'; period_scope = '2026 August'; division = ''; source_id = '461'; status = 'LEGACY_SOURCE_EXCLUDED'; row_count = '240'; reason = 'Legacy August 2026 rows remain preserved in the old source/provenance only; finalized August payload comes from fresh finalized recovery evidence.' },
  [pscustomobject]@{ scope = 'period'; period_scope = '2024 January through 2024 July'; division = ''; source_id = ''; status = 'UNKNOWN_NO_OBSERVATIONS_IMPORTED'; row_count = '0'; reason = 'No affirmative historical result evidence; no rows fabricated.' },
  [pscustomobject]@{ scope = 'logical_observation'; period_scope = '2025 August'; division = 'Elite'; source_id = '22'; status = 'QUARANTINED_SOURCE_DRIFT_REVIEW'; row_count = '1'; reason = 'PETERK9FLORIDA / Atlantis old blank; preserved full-crawl artifact = -23; three reproductions = -26; admin resolution remains unresolved.' }
)
Write-Tsv (Join-Path $outputDir 'repaired-monthly-exclusions.tsv') $exclusions @('scope','period_scope','division','source_id','status','row_count','reason')

$stateCounts = @{
  total_logical_observations = $package.Count
  played_scored = @($package | Where-Object played_state -eq 'PLAYED').Count
  blank_unplayed = 0
  blank_unplayed_evidence_excluded = $unplayedEvidence.Count
  zero_scores = @($package | Where-Object { $_.played_state -eq 'PLAYED' -and [int]$_.score_numeric -eq 0 }).Count
  negative_scores = @($package | Where-Object { $_.played_state -eq 'PLAYED' -and [int]$_.score_numeric -lt 0 }).Count
  positive_scores = @($package | Where-Object { $_.played_state -eq 'PLAYED' -and [int]$_.score_numeric -gt 0 }).Count
  malformed = 0
  duplicate_fingerprints = 0
  exact_both_included = @($package | Where-Object merge_status -eq 'EXACT_BOTH').Count
  old_only_included = @($package | Where-Object merge_status -eq 'OLD_ONLY').Count
  new_only_included = @($package | Where-Object merge_status -eq 'NEW_ONLY').Count
  legacy_august_excluded = $counts.LEGACY_AUGUST_EXCLUDED
  blank_to_scored_review = $counts.BLANK_TO_SCORED_REVIEW
  scored_to_blank_review = $counts.SCORED_TO_BLANK_REVIEW
  numeric_conflict_review = $counts.NUMERIC_CONFLICT_REVIEW
  quarantined_rows = $quarantine.Count
  pending_amateur_rows = 0
}
$sourceFiles = @('repaired-monthly-observations.tsv','repaired-monthly-unplayed-evidence.tsv','repaired-monthly-provenance.tsv','repaired-monthly-merge-ledger.tsv','repaired-monthly-exclusions.tsv','repaired-monthly-review-quarantine.tsv')
$fileHashes = @{}
foreach ($file in $sourceFiles) { $fileHashes[$file] = Hash-File (Join-Path $outputDir $file) }
$manifest = [ordered]@{
  package = 'repaired historical Monthlies source package'; schema_version = 'repaired-monthly-v2-score-only'; generated_at = (Get-Date).ToUniversalTime().ToString('o'); generated_by = 'generate-repaired-package.ps1'
  source_scope = [ordered]@{ old_source = 'website-recovery/monthly-website-score-observations.csv'; fresh_source = 'completeness-recovery/full-public-score-recovery/all-completed-monthly-score-observations.tsv'; finalized_periods = '2024 August through 2026 August as preserved fresh completed scope'; excluded_periods = '2024 January through 2024 July UNKNOWN' }
  finalization = [ordered]@{ finalizedThrough = '2026 August'; currentIncompletePeriod = '2026 September'; activePeriodPolicy = 'Only periods through finalizedThrough are importable; the current period and later periods remain excluded until explicitly finalized.'; currentPeriodReason = 'September 2026 is the active Monthly and is not finished. September scores are excluded from historical import.'; legacyManifestNote = 'The old website-recovery manifest remains historical provenance only and is not the repaired package finalization gate.' }
  logical_merge = [ordered]@{ key = 'period_id|division_id|source_player_id (fallback exact source name)|course|difficulty'; counts = $counts }
  import_ready = $stateCounts
  exclusions = @('Amateur 1-3 pending source IDs; zero rows included','Semi Pro 4 no proven participation; non-blocking','2024 January-July UNKNOWN; zero rows included','One Elite Atlantis source-drift row quarantined')
  semantics = [ordered]@{ played = 'Numeric score present, including zero'; unplayed = 'Blank course slot; evidence-only and excluded from score import'; zero = 'Valid numeric score, distinct from blank'; negative = 'Valid numeric score'; positive = 'Valid numeric score'; score_field = 'score_numeric is numeric for every import-ready row; blank score slots are preserved only in repaired-monthly-unplayed-evidence.tsv' }
  evidence = [ordered]@{ derived_logical_observations = $package.Count + $unplayedEvidence.Count; blank_unplayed_evidence_file = 'repaired-monthly-unplayed-evidence.tsv'; blank_unplayed_evidence_rows = $unplayedEvidence.Count }
  provenance = [ordered]@{ old = 'Original retained website recovery'; fresh = 'Fresh public rendered recovery'; exact_both = 'One logical observation with both source attestations'; old_only = 'Preserved'; new_only = 'Included if uncontested'; review = 'Excluded until resolved' }
  file_sha256 = $fileHashes
  source_sha256 = [ordered]@{ old_csv = Hash-File $oldPath; fresh_tsv = Hash-File $newPath }
}
[IO.File]::WriteAllText((Join-Path $outputDir 'repaired-monthly-manifest.json'), ($manifest | ConvertTo-Json -Depth 12), $utf8)
Write-Output ($manifest | ConvertTo-Json -Depth 12)
