$ErrorActionPreference = 'Stop'

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$origin = 'https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com'
$base = $origin + '/ords/r/wmgt/monthly/home'
$root = Join-Path (Get-Location) 'docs\historical-sources\monthly\completeness-recovery\full-public-score-recovery'
$rawDir = Join-Path $root 'raw'
$utf8 = New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force -Path $root, $rawDir | Out-Null

$divisions = @(
  [pscustomobject]@{ Label = 'Master'; Value = 21 },
  [pscustomobject]@{ Label = 'Elite'; Value = 22 },
  [pscustomobject]@{ Label = 'Pro 1'; Value = 23 },
  [pscustomobject]@{ Label = 'Pro 2'; Value = 24 },
  [pscustomobject]@{ Label = 'Pro 3'; Value = 25 },
  [pscustomobject]@{ Label = 'Semi Pro 1'; Value = 113 },
  [pscustomobject]@{ Label = 'Beginner'; Value = 81 },
  [pscustomobject]@{ Label = 'Welcome'; Value = 62 },
  [pscustomobject]@{ Label = 'Semi Pro 2'; Value = 114 },
  [pscustomobject]@{ Label = 'Semi Pro 3'; Value = 115 }
)

$periodIds = @{}
foreach ($year in 2024, 2025, 2026) {
  $start = if ($year -eq 2024) { 47 } elseif ($year -eq 2025) { 81 } else { 321 }
  $step = if ($year -eq 2024) { 1 } else { 20 }
  $months = if ($year -eq 2026) { 1..10 } else { 1..12 }
  foreach ($month in $months) {
    $monthName = ([Globalization.CultureInfo]::InvariantCulture.DateTimeFormat.GetMonthName($month))
    $periodIds["$year $monthName"] = $start + (($month - 1) * $step)
  }
}

function Get-Sha256([string] $Path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash }
function Clean([object] $Value) { if ($null -eq $Value) { '' } else { ([string]$Value).Replace("`t", ' ').Replace("`r", ' ').Replace("`n", ' ').Trim() } }
function Redact-Session([string] $Url) { if ($null -eq $Url) { return '' }; [regex]::Replace($Url, '([?&](?:session|cs|dialogCs)=)[^&]*', '$1REDACTED') }
function Send-Cdp([string] $Method, [hashtable] $Params = @{}) {
  $script:CdpSequence++
  $wanted = $script:CdpSequence
  $message = @{ id = $wanted; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 40
  $bytes = [Text.Encoding]::UTF8.GetBytes($message)
  $null = $script:CdpSocket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  do {
    $buffer = New-Object byte[] 1048576
    $stream = New-Object IO.MemoryStream
    do {
      $received = $script:CdpSocket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $stream.Write($buffer, 0, $received.Count)
    } while (-not $received.EndOfMessage)
    $response = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
  } while ($response.id -ne $wanted)
  $response
}
function Eval-Page([string] $Expression) {
  $response = Send-Cdp 'Runtime.evaluate' @{ expression = $Expression; returnByValue = $true }
  if ($response.result.exceptionDetails) { throw ('Page evaluation failed: ' + ($response.result.exceptionDetails | ConvertTo-Json -Compress -Depth 10)) }
  $response.result.result.value
}
function Send-NoWait([string] $Method, [hashtable] $Params = @{}) {
  $script:CdpSequence++
  $message = @{ id = $script:CdpSequence; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 40
  $bytes = [Text.Encoding]::UTF8.GetBytes($message)
  $null = $script:CdpSocket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}
function Navigate-Raw([string] $Url) { Send-NoWait 'Page.navigate' @{ url = $Url }; Start-Sleep -Milliseconds 2300 }
function Wait-For-Period([string] $ExpectedPeriod = '') {
  for ($wait = 0; $wait -lt 30; $wait++) {
    try {
      $title = [string](Eval-Page "(document.querySelector('.monthlyHero__title')?.textContent||'').replace(/\\s+/g,' ').trim()")
      if ($title -and ((-not $ExpectedPeriod) -or $title -eq $ExpectedPeriod)) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  return $false
}
function Navigate([string] $Url) {
  Navigate-Raw $Url
  [void](Wait-For-Period)
}

$extractExpression = @'
JSON.stringify((()=>{
  const clean = x => (x ?? '').replace(/\s+/g, ' ').trim();
  const rows = table => table ? [...table.querySelectorAll('tbody tr')].map((tr, i) => {
    const td = [...tr.querySelectorAll('td')].map(x => clean(x.textContent));
    const player = tr.querySelector('[data-id]');
    return { row: i + 1, placement: td[0] || null, player: td[1] || null,
      playerId: player?.getAttribute('data-id') || null, score: td[2] || null,
      hn1: td[3] || null, points: td[4] || null, played: (td[2] || '') !== '' };
  }) : [];
  const leaders = rows(document.querySelector('#report_table_leagueLeaders'));
  const courses = [...document.querySelectorAll('.scoreRegion table.t-Report-report')].map((table, i) => {
    const region = table.closest('.scoreRegion') || table.parentElement;
    const heading = region?.querySelector('h1,h2,h3,h4');
    return { index: i + 1, heading: clean(heading?.textContent), tableId: table.id, rows: rows(table) };
  });
  const hero = document.querySelector('.monthlyHero');
  return { capturedAt: new Date().toISOString(), url: location.href,
    period: clean(document.querySelector('#P1_PREPARED_MONTHLY')?.value || document.querySelector('.monthlyHero__title')?.textContent),
    statusClass: hero?.className || null, statusText: clean(hero?.textContent), leaders, courses,
    divisionHeading: clean(document.querySelector('#leagueLeaders_heading')?.textContent),
    sourceDivisionId: document.querySelector('#P1_LEAGUE_ID')?.value || null };
})())
'@

$inventoryPath = Join-Path $root 'coverage-inventory.tsv'
$coveragePath = Join-Path $root 'coverage-matrix.tsv'
$observationsPath = Join-Path $root 'all-completed-monthly-score-observations.tsv'
$checkpointPath = Join-Path $root 'extraction-checkpoint.json'
$periodPath = Join-Path $root 'period-inventory.tsv'
$inventoryHeader = "period`tperiod_id`tstatus`tdivision`tdivision_id`tleader_rows`tcourse_tables`tplayer_counts_per_course`tobservations`tscored`tunplayed`tdom_sha256`tstructured_json_sha256`traw_html`traw_text`traw_json`texact_player_names"
$coverageHeader = "period`tperiod_id`tstatus`tdivision`tdivision_id`tleader_rows`tcourse_tables`tplayer_counts_per_course`tobservations`tscored`tunplayed`tclassification`traw_json"
$observationHeader = "period`tperiod_id`tdivision`tdivision_id`tsource_player_id`tsource_player_name`tcourse`tscore_text`tscore_numeric`tplayed_state`tplacement`thn1`tpoints`traw_json_sha256"
$periodHeader = "period`tperiod_id`tstatus`tstatus_class`tstatus_text`tperiod_url`tprevious_url`tnext_url`tnavigation_html_sha256`tnavigation_text_sha256`tnavigation_json_sha256"
if (-not (Test-Path $inventoryPath)) { [IO.File]::WriteAllText($inventoryPath, "$inventoryHeader`n", $utf8) }
if (-not (Test-Path $coveragePath)) { [IO.File]::WriteAllText($coveragePath, "$coverageHeader`n", $utf8) }
if (-not (Test-Path $observationsPath)) { [IO.File]::WriteAllText($observationsPath, "$observationHeader`n", $utf8) }
if (-not (Test-Path $periodPath)) { [IO.File]::WriteAllText($periodPath, "$periodHeader`n", $utf8) }

$checkpoint = if (Test-Path $checkpointPath) { Get-Content -Raw $checkpointPath | ConvertFrom-Json } else {
  [pscustomobject]@{ captureDate = (Get-Date).ToString('o'); status = 'RUNNING'; completed = @(); periods = 0; counts = [pscustomobject]@{ periods = 0; combinations = 0; populated = 0; empty = 0; observations = 0; scored = 0; unplayed = 0; negative = 0; malformed = 0 } }
}
$done = @{}
foreach ($key in @($checkpoint.completed)) { $done[[string]$key] = $true }

$process = $null
$script:CdpSocket = $null
try {
  $port = 9288
  $profile = Join-Path $env:TEMP ('krys-monthlies-full-public-' + [guid]::NewGuid().ToString('N'))
  $process = Start-Process -FilePath $edge -ArgumentList @('--headless=new','--no-sandbox','--disable-gpu','--disable-extensions','--disable-sync','--disable-background-networking','--no-first-run','--no-default-browser-check',"--remote-debugging-port=$port",("--user-data-dir=" + $profile),'about:blank') -WindowStyle Hidden -PassThru
  $json = $null
  for ($i = 0; $i -lt 50 -and -not $json; $i++) { Start-Sleep -Milliseconds 300; try { $json = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $port + '/json') -UseBasicParsing -TimeoutSec 2 | Select-Object -ExpandProperty Content } catch { } }
  if (-not $json) { throw 'CDP did not start' }
  $tabs = ConvertFrom-Json $json
  $tab = $tabs | Where-Object { $_.type -eq 'page' -and $_.url -eq 'about:blank' } | Select-Object -First 1
  if (-not $tab) { $tab = $tabs | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 }
  if (-not $tab.webSocketDebuggerUrl) { throw 'CDP page tab was not found' }
  $script:CdpSocket = New-Object System.Net.WebSockets.ClientWebSocket
  $script:CdpSocket.Options.Proxy = $null
  $script:CdpSocket.ConnectAsync([Uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  $script:CdpSequence = 0
  [void](Send-Cdp 'Page.enable'); [void](Send-Cdp 'Runtime.enable')

  $periodById = @{}
  foreach ($entry in $periodIds.GetEnumerator()) { $periodById[[int]$entry.Value] = [string]$entry.Key }
  $periods = New-Object System.Collections.Generic.List[object]
  Navigate-Raw $base
  if (-not (Wait-For-Period)) { throw 'Initial Monthly page did not render a period hero' }
  for ($step = 0; $step -lt 80; $step++) {
    $infoExpression = "JSON.stringify((()=>{const h=document.querySelector('.monthlyHero');return {url:location.href,title:(document.querySelector('.monthlyHero__title')?.textContent||'').replace(/\\s+/g,' ').trim(),statusClass:h?.className||'',statusText:(h?.textContent||'').replace(/\\s+/g,' ').trim(),previous:document.querySelector('a[title=Previous]')?.href||'',next:document.querySelector('a[title=Next]')?.href||''}})())"
    $info = ConvertFrom-Json (Eval-Page $infoExpression)
    $period = [string]$info.title
    if (-not $periodIds.ContainsKey($period)) { throw "Unmapped public period label: $period" }
    $periodId = [int]$periodIds[$period]
    $status = if ([string]$info.statusClass -match 'statusDONE' -or [string]$info.statusText -match '(?i)completed') { 'COMPLETED' } elseif ([string]$info.statusText -match '(?i)in progress') { 'IN_PROGRESS' } else { 'OTHER' }
    $periods.Add([pscustomobject]@{ period = $period; periodId = $periodId; status = $status; statusClass = [string]$info.statusClass; statusText = [string]$info.statusText; url = [string]$info.url; previous = [string]$info.previous; next = [string]$info.next })
    if (-not $info.previous) { break }
    $previousId = $null
    if ([string]$info.previous -match 'g_currently_month_id=(\d+)') { $previousId = [int]$Matches[1] }
    $expectedPrevious = if ($null -ne $previousId -and $periodById.ContainsKey($previousId)) { $periodById[$previousId] } else { '' }
    Navigate-Raw ([string]$info.previous)
    if (-not (Wait-For-Period $expectedPrevious)) { throw "Previous Monthly page did not render: $expectedPrevious" }
  }
  [IO.File]::WriteAllLines($periodPath, @($periodHeader) + @($periods | ForEach-Object { "$(Clean $_.period)`t$($_.periodId)`t$($_.status)`t$(Clean $_.statusClass)`t$(Clean $_.statusText)`t$(Redact-Session $_.url)`t$(Redact-Session $_.previous)`t$(Redact-Session $_.next)`tNOT_CAPTURED`tNOT_CAPTURED`tNOT_CAPTURED" }), $utf8)

  foreach ($p in $periods | Where-Object { $_.status -eq 'COMPLETED' } | Sort-Object periodId -Descending) {
    foreach ($d in $divisions) {
      $key = "$($p.periodId)+$($d.Value)"
      if ($done.ContainsKey($key)) { continue }
      Write-Host "CAPTURE $($p.period) / $($d.Label) ($($d.Value))"
      Navigate-Raw $p.url
      if (-not (Wait-For-Period $p.period)) { throw "Stored period route did not render: $($p.period)" }
      $session = Eval-Page 'apex.env.APP_SESSION'
      $requestUrl = "$origin/ords/f?p=500:1:$session:::1:P1_LEAGUE_ID:$($d.Value)"
      Navigate $requestUrl
      Start-Sleep -Milliseconds 900
      $html = Eval-Page 'document.documentElement.outerHTML'
      $text = Eval-Page 'document.body.innerText'
      $structured = Eval-Page $extractExpression
      $jsonObject = ConvertFrom-Json $structured
      $slug = "period-$($p.periodId)-division-$($d.Value)"
      $htmlPath = Join-Path $rawDir ($slug + '.html'); $textPath = Join-Path $rawDir ($slug + '.txt'); $jsonPath = Join-Path $rawDir ($slug + '.json')
      [IO.File]::WriteAllText($htmlPath, $html, $utf8); [IO.File]::WriteAllText($textPath, $text, $utf8); [IO.File]::WriteAllText($jsonPath, $structured, $utf8)
      $rawHash = Get-Sha256 $jsonPath
      $rows = @($jsonObject.courses | ForEach-Object { $course = $_; @($course.rows | ForEach-Object { [pscustomobject]@{ course = [string]$course.heading; row = $_ } }) })
      $scored = @($rows | Where-Object { $_.row.played }).Count; $unplayed = @($rows | Where-Object { -not $_.row.played }).Count
      $players = @($rows | ForEach-Object { $_.row.player } | Where-Object { $_ } | Select-Object -Unique)
      $courseCounts = @($jsonObject.courses | ForEach-Object { "$(Clean $_.heading):$(@($_.rows).Count)" }) -join ';'
      $classification = if ($rows.Count -gt 0) { 'COMPLETE_DATA_RECOVERED' } elseif (@($jsonObject.leaders).Count -gt 0) { 'LEADER_ONLY_REVIEW' } else { 'UNKNOWN_NO_ROWS' }
      $inventoryLine = ((@($p.period, $p.periodId, $p.status, $d.Label, $d.Value, @($jsonObject.leaders).Count, @($jsonObject.courses).Count, $courseCounts, $rows.Count, $scored, $unplayed, (Get-Sha256 $htmlPath), $rawHash, "raw/$slug.html", "raw/$slug.txt", "raw/$slug.json", (($players | ConvertTo-Json -Compress) -replace "`t", ' ')) | ForEach-Object { Clean $_ }) -join "`t")
      Add-Content -LiteralPath $inventoryPath -Value $inventoryLine -Encoding utf8
      $coverageLine = ((@($p.period, $p.periodId, $p.status, $d.Label, $d.Value, @($jsonObject.leaders).Count, @($jsonObject.courses).Count, $courseCounts, $rows.Count, $scored, $unplayed, $classification, "raw/$slug.json") | ForEach-Object { Clean $_ }) -join "`t")
      Add-Content -LiteralPath $coveragePath -Value $coverageLine -Encoding utf8
      foreach ($r in $rows) {
        $numeric = $null; if ([string]$r.row.score -match '^-?\d+(?:\.\d+)?$') { $numeric = [string]$r.row.score }
        $line = ((@($p.period, $p.periodId, $d.Label, $d.Value, $r.row.playerId, $r.row.player, $r.course, $r.row.score, $numeric, [bool]$r.row.played, $r.row.placement, $r.row.hn1, $r.row.points, $rawHash) | ForEach-Object { Clean $_ }) -join "`t")
        Add-Content -LiteralPath $observationsPath -Value $line -Encoding utf8
      }
      $done[$key] = $true
      $checkpoint.completed = @($done.Keys | Sort-Object)
      $checkpoint.status = 'RUNNING'
      $checkpoint.counts.combinations = $checkpoint.completed.Count
      $checkpoint.counts.observations = ([int]$checkpoint.counts.observations + $rows.Count)
      $checkpoint.counts.scored = ([int]$checkpoint.counts.scored + $scored)
      $checkpoint.counts.unplayed = ([int]$checkpoint.counts.unplayed + $unplayed)
      $checkpoint.counts.negative = ([int]$checkpoint.counts.negative + @($rows | Where-Object { [string]$_.row.score -match '^-' }).Count)
      $checkpoint.counts.populated = ([int]$checkpoint.counts.populated + [int]($rows.Count -gt 0))
      $checkpoint.counts.empty = ([int]$checkpoint.counts.empty + [int]($rows.Count -eq 0))
      [IO.File]::WriteAllText($checkpointPath, ($checkpoint | ConvertTo-Json -Depth 20), $utf8)
    }
  }
  $checkpoint.status = 'COMPLETE'
  $checkpoint.periods = @($periods | Where-Object { $_.status -eq 'COMPLETED' }).Count
  [IO.File]::WriteAllText($checkpointPath, ($checkpoint | ConvertTo-Json -Depth 20), $utf8)
}
finally {
  if ($script:CdpSocket) { $script:CdpSocket.Dispose() }
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  $listeners = @(Get-NetTCPConnection -LocalPort 9288 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  foreach ($listener in $listeners) { if ($listener -and $listener -ne $PID) { Stop-Process -Id $listener -Force -ErrorAction SilentlyContinue } }
}

