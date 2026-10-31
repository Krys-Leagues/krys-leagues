$ErrorActionPreference = 'Stop'

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$origin = 'https://dqvo64m7q9ujvqa-wmgt23ai.adb.us-ashburn-1.oraclecloudapps.com'
$base = $origin + '/ords/r/wmgt/monthly/home'
$root = Join-Path (Get-Location) 'docs\historical-sources\monthly\completeness-recovery'
$outDir = Join-Path $root 'raw\reproduction'
$utf8 = New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$targets = @(
  [pscustomobject]@{ Label = '2026 April'; PeriodId = 381; Division = 'Semi Pro 2'; DivisionValue = 114 },
  [pscustomobject]@{ Label = '2026 May'; PeriodId = 401; Division = 'Semi Pro 2'; DivisionValue = 114 },
  [pscustomobject]@{ Label = '2026 May'; PeriodId = 401; Division = 'Semi Pro 3'; DivisionValue = 115 },
  [pscustomobject]@{ Label = '2026 June'; PeriodId = 421; Division = 'Semi Pro 2'; DivisionValue = 114 },
  [pscustomobject]@{ Label = '2024 September'; PeriodId = 55; Division = 'Pro 3'; DivisionValue = 25 }
)

function Get-Sha256([string] $Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Send-Cdp([string] $Method, [hashtable] $Params = @{}) {
  $script:CdpSequence++
  $wanted = $script:CdpSequence
  $message = @{ id = $wanted; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 30
  $bytes = [Text.Encoding]::UTF8.GetBytes($message)
  $null = $script:CdpSocket.SendAsync(
    [ArraySegment[byte]]::new($bytes),
    [Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()
  do {
    $buffer = New-Object byte[] 1048576
    $stream = New-Object IO.MemoryStream
    do {
      $received = $script:CdpSocket.ReceiveAsync(
        [ArraySegment[byte]]::new($buffer),
        [Threading.CancellationToken]::None
      ).GetAwaiter().GetResult()
      $stream.Write($buffer, 0, $received.Count)
    } while (-not $received.EndOfMessage)
    $response = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
  } while ($response.id -ne $wanted)
  return $response
}

function Eval-Page([string] $Expression) {
  $response = Send-Cdp 'Runtime.evaluate' @{ expression = $Expression; returnByValue = $true }
  if ($response.result.exceptionDetails) {
    throw ('Page evaluation failed: ' + ($response.result.exceptionDetails | ConvertTo-Json -Compress -Depth 10))
  }
  return $response.result.result.value
}

function Wait-Page {
  Start-Sleep -Milliseconds 2200
}

function Send-Cdp-NoWait([string] $Method, [hashtable] $Params = @{}) {
  $script:CdpSequence++
  $message = @{ id = $script:CdpSequence; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 30
  $bytes = [Text.Encoding]::UTF8.GetBytes($message)
  $null = $script:CdpSocket.SendAsync(
    [ArraySegment[byte]]::new($bytes),
    [Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).GetAwaiter().GetResult()
}

$extractExpression = @'
JSON.stringify((()=>{
  const clean = x => (x ?? '').replace(/\s+/g, ' ').trim();
  const rows = table => table ? [...table.querySelectorAll('tbody tr')].map((tr, i) => {
    const td = [...tr.querySelectorAll('td')].map(x => clean(x.textContent));
    const player = tr.querySelector('[data-id]');
    return {
      row: i + 1,
      placement: td[0] || null,
      player: td[1] || null,
      playerId: player?.getAttribute('data-id') || null,
      score: td[2] || null,
      hn1: td[3] || null,
      points: td[4] || null,
      played: (td[2] || '') !== ''
    };
  }) : [];
  const leaders = rows(document.querySelector('#report_table_leagueLeaders'));
  const courses = [...document.querySelectorAll('.scoreRegion table.t-Report-report')].map((table, i) => {
    const heading = (table.closest('.scoreRegion') || table.parentElement)?.querySelector('h1,h2,h3,h4');
    return { index: i + 1, heading: clean(heading?.textContent), tableId: table.id, rows: rows(table) };
  });
  return {
    capturedAt: new Date().toISOString(),
    url: location.href,
    leaders,
    courses,
    divisionHeading: clean(document.querySelector('#leagueLeaders_heading')?.textContent),
    sourceDivisionId: document.querySelector('#P1_LEAGUE_ID')?.value || null
  };
})())
'@

$inventory = New-Object System.Collections.Generic.List[string]
$inventory.Add((@('repetition','period','period_id','division','division_source_value','leader_rows','course_tables','player_counts_per_course','observations','scored','missing','dom_sha256','structured_json_sha256','row_data_sha256','html_file','text_file','json_file','screenshot_file','exact_player_names') -join [char]9))
$results = New-Object System.Collections.Generic.List[object]

$captureNumber = 0
foreach ($target in $targets) {
  for ($repetition = 1; $repetition -le 3; $repetition++) {
    $captureNumber++
    $port = 9260 + $captureNumber
    $profile = Join-Path $env:TEMP ('krys-monthlies-repro-' + [guid]::NewGuid().ToString('N'))
    $process = $null
    $script:CdpSocket = $null
    try {
      Write-Host ("START " + $captureNumber + " target=" + $target.Label + " division=" + $target.DivisionValue + " repetition=" + $repetition)
      $process = Start-Process -FilePath $edge -ArgumentList @('--headless','--disable-gpu','--disable-extensions','--disable-sync','--disable-background-networking','--no-first-run','--no-default-browser-check',"--remote-debugging-port=$port","--user-data-dir=$profile",'about:blank') -WindowStyle Hidden -PassThru
      $json = $null
      for ($i = 0; $i -lt 40 -and -not $json; $i++) {
        Start-Sleep -Milliseconds 300
        try { $json = Invoke-WebRequest -Uri ("http://127.0.0.1:" + $port + '/json') -UseBasicParsing -TimeoutSec 2 | Select-Object -ExpandProperty Content } catch { }
      }
      if (-not $json) { throw 'CDP did not start' }
      $tabs = ConvertFrom-Json $json
      $tab = $tabs | Where-Object { $_.type -eq 'page' -and $_.url -eq 'about:blank' } | Select-Object -First 1
      if (-not $tab) { $tab = $tabs | Where-Object { $_.type -eq 'page' } | Select-Object -First 1 }
      if (-not $tab -or -not $tab.webSocketDebuggerUrl) { throw 'CDP page tab was not found' }
      $webSocketUrl = [string]($tab | Select-Object -ExpandProperty webSocketDebuggerUrl)
      $script:CdpSocket = New-Object System.Net.WebSockets.ClientWebSocket
      $script:CdpSocket.Options.Proxy = $null
      $connected = $false
      for ($connectAttempt = 1; $connectAttempt -le 10 -and -not $connected; $connectAttempt++) {
        try {
          $script:CdpSocket.ConnectAsync([Uri]$webSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
          $connected = $true
        } catch {
          if ($connectAttempt -eq 10) { throw }
          $script:CdpSocket.Dispose()
          Start-Sleep -Milliseconds 250
          $script:CdpSocket = New-Object System.Net.WebSockets.ClientWebSocket
          $script:CdpSocket.Options.Proxy = $null
        }
      }
      $script:CdpSequence = 0
      [void](Send-Cdp 'Page.enable')
      [void](Send-Cdp 'Runtime.enable')

      Send-Cdp-NoWait 'Page.navigate' @{ url = $base }
      Wait-Page
      $steps = 0
      $found = $false
      for ($j = 0; $j -lt 45; $j++) {
        $body = Eval-Page 'document.body.innerText'
        if ($body -and $body.Contains($target.Label)) { $found = $true; break }
        $previous = Eval-Page 'document.querySelector("a[title=Previous]")?.href || ""'
        if (-not $previous) { break }
        Send-Cdp-NoWait 'Page.navigate' @{ url = $previous }
        Wait-Page
        $steps++
      }
      if (-not $found) { throw ('Period not found: ' + $target.Label) }
      Write-Host ("PERIOD READY " + $target.Label + " steps=" + $steps)

      $session = Eval-Page 'apex.env.APP_SESSION'
      $requestUrl = "$origin/ords/f?p=500:1:$session:::1:P1_LEAGUE_ID:$($target.DivisionValue)"
      Send-Cdp-NoWait 'Page.navigate' @{ url = $requestUrl }
      Wait-Page
      Start-Sleep -Milliseconds 800

      $html = Eval-Page 'document.documentElement.outerHTML'
      $text = Eval-Page 'document.body.innerText'
      $extracted = Eval-Page $extractExpression
      $slug = "repro-$repetition-period-$($target.PeriodId)-division-$($target.DivisionValue)"
      $htmlPath = Join-Path $outDir ($slug + '.html')
      $textPath = Join-Path $outDir ($slug + '.txt')
      $jsonPath = Join-Path $outDir ($slug + '.json')
      $pngPath = Join-Path $outDir ($slug + '.png')
      [IO.File]::WriteAllText($htmlPath, $html, $utf8)
      [IO.File]::WriteAllText($textPath, $text, $utf8)
      [IO.File]::WriteAllText($jsonPath, $extracted, $utf8)
      $screenshot = (Send-Cdp 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $true; fromSurface = $true }).result.data
      [IO.File]::WriteAllBytes($pngPath, [Convert]::FromBase64String($screenshot))

      $object = ConvertFrom-Json $extracted
      $allCourseRows = @($object.courses | ForEach-Object { $_.rows })
      $scored = @($allCourseRows | Where-Object { $_.played }).Count
      $missing = @($allCourseRows | Where-Object { -not $_.played }).Count
      $players = @($allCourseRows | ForEach-Object { $_.player } | Select-Object -Unique)
      $courseCounts = @($object.courses | ForEach-Object { "$(($_.heading)):$($_.rows.Count)" }) -join ';'
      $normalized = [ordered]@{
        period = $target.Label
        periodId = $target.PeriodId
        division = $target.Division
        sourceDivisionId = [string]$target.DivisionValue
        leaders = $object.leaders
        courses = $object.courses
      }
      $normalizedJson = $normalized | ConvertTo-Json -Compress -Depth 40
      $rowDataHash = ([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash([Text.Encoding]::UTF8.GetBytes($normalizedJson)))).Replace('-', '')
      $result = [pscustomobject]@{
        repetition = $repetition
        period = $target.Label
        periodId = $target.PeriodId
        division = $target.Division
        divisionValue = [string]$target.DivisionValue
        navigationSteps = $steps
        requestUrl = $requestUrl
        leaderRows = @($object.leaders).Count
        courseTables = @($object.courses).Count
        playerCountsPerCourse = $courseCounts
        observations = $allCourseRows.Count
        scored = $scored
        missing = $missing
        exactPlayerNames = $players
        domSha256 = Get-Sha256 $htmlPath
        structuredJsonSha256 = Get-Sha256 $jsonPath
        rowDataSha256 = $rowDataHash
        htmlFile = $htmlPath.Substring($root.Length + 1)
        textFile = $textPath.Substring($root.Length + 1)
        jsonFile = $jsonPath.Substring($root.Length + 1)
        screenshotFile = $pngPath.Substring($root.Length + 1)
      }
      $results.Add($result)
      $inventory.Add((@($repetition,$target.Label,$target.PeriodId,$target.Division,$target.DivisionValue,$result.leaderRows,$result.courseTables,$result.playerCountsPerCourse,$result.observations,$result.scored,$result.missing,$result.domSha256,$result.structuredJsonSha256,$result.rowDataSha256,$result.htmlFile,$result.textFile,$result.jsonFile,$result.screenshotFile,(($players | ConvertTo-Json -Compress) -replace "`t",' ')) -join [char]9))
      Write-Host ("CAPTURED " + $result.jsonFile)
    }
    finally {
      if ($script:CdpSocket) { $script:CdpSocket.Dispose() }
      if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
      $listenerPids = @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
      foreach ($listenerPid in $listenerPids) {
        if ($listenerPid -and $listenerPid -ne $PID) { Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue }
      }
    }
  }
}

[IO.File]::WriteAllLines((Join-Path $root 'reproduction-inventory.tsv'), $inventory, $utf8)
[IO.File]::WriteAllText((Join-Path $root 'reproduction-summary.json'), ($results | ConvertTo-Json -Depth 40), $utf8)
