# Monthly source endpoint discovery

Capture timestamp: 2026-09-05T11:53:13.9981548-04:00

## Page and period mechanism

- Application: APEX app `500`, page `1`, workspace path `/ords/r/wmgt/monthly/home`.
- The valid browser-rendered period navigation is a GET to the same page with
  `g_currently_month_id=<period_id>&clear=1&cs=<APEX checksum>`.
- The Previous/Next links are the authoritative reproducible period navigation
  values. The seven 2024 period IDs observed were 47 through 53.
- The current browser session exposed app session `215532754269020` in the APEX
  page context. Session values are captured only as request metadata and were
  not used for any write operation.

## Division mechanism

- Page item: `P1_LEAGUE_ID` (`select#P1_LEAGUE_ID`).
- Visible list-of-values in the normal page currently contains: Master `21`,
  Elite `22`, Pro 1 `23`, Pro 2 `24`, Pro 3 `25`, Semi Pro 1 `113`, Beginner
  `81`, Welcome `62`.
- The selector has `data-action="a-submit?request=P1_LEAGUE_ID"`.
- Visible tab links call `apex.page.submit({set: {'P1_LEAGUE_ID': <value>}})`.
- The form action is
  `POST /ords/wwv_flow.accept?p_context=monthly/home/215532754269020`.
- No production data write was requested or issued. The direct accepted APEX
  reproduction URL used for the retired values was a GET in the form:
  `/ords/f?p=500:1:215532754269020:::1:P1_LEAGUE_ID:<value>` after setting the
  period with its valid checked navigation URL.

## Retired values found

The accepted APEX item values `114` and `115` are not in the visible selector,
but the application rendered them as the historical divisions `Semi Pro 2`
and `Semi Pro 3`, respectively. Both returned leader rows and eight course
tables in every one of the six authorized cells.

The browser inspection exposed APEX region identifiers for the rendered data:
`leagueLeaders` / `report_table_leagueLeaders` for standings and eight classic
report regions whose report table IDs repeat by course position, including
`report_table_R28068552205398028`, `report_table_R56453759181867007`,
`report_table_R28324659146245908`, `report_table_R56709866122714887`,
`report_table_R28325503198245917`, `report_table_R56710710174714896`,
`report_table_R28326426873245926`, and `report_table_R56711633849714905`.

The page source also contained a select-list AJAX identifier and classic-report
AJAX identifiers. The observable page behavior for period/division changes was
the full APEX submit/navigation described above; the in-app browser did not
provide request-body/network export, so an exact POST payload and raw HTTP body
were not independently preserved.

## 2024 diagnostic result

For period IDs 47–53, all eight visible selector values were present. Each
period rendered the normal completed page shell, `Overall Leaders - 2024 <month>`,
the selected division heading, and no leader rows or course/result tables.
There was no APEX error, loading failure, or “no data” message. July 2024 also
rendered the course-name navigation shell (`2024 July Courses`) with zero
result rows. This proves the current source response is empty for those views,
but does not prove those historical periods were originally empty; their
historical result coverage remains UNKNOWN.

## Raw export limitation

The in-app browser’s content export is unavailable for this page. The raw
directory therefore contains a truthful limitation note rather than fabricated
HTML/JSON. The structured count/name index is preserved separately, and source
repair must remain gated until raw response bodies or an equivalent authoritative
export are preserved.
