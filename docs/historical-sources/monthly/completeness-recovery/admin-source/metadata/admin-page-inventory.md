# Authenticated Monthlies admin page inventory

Capture date: 2026-09-07 (America/New_York)

The authenticated headed session displayed account `KRYSTAL.AHERN83@GMAIL.COM`. This identity is recorded only as an observed UI account label; no credentials or session token are preserved.

## Pages discovered

All pages were reached by read-only navigation from the application menu.

| Page | Path (session query omitted) | Read-only evidence |
|---|---|---|
| Kry's Monthly | `/ords/r/wmgt/monthly/home` | Current period navigation, public leaders, course result tables, current-courses report, submission queue |
| Montly Admin | `/ords/r/wmgt/monthly/montly-admin` | Period report plus Courses, Leagues, and Players interactive grids |
| All Players | `/ords/r/wmgt/monthly/all-players` | Player report with exact displayed screen names, rank markers, country, timezone, and player-detail/merge links |
| Search | `/ords/r/wmgt/monthly/search` | Search item `P2_SEARCH`; no query was submitted |
| Administration | `/ords/r/wmgt/monthly/administration` | Application administration page; only generic configuration/activity/access-control links were exposed |

## Monthlies admin regions

The `Montly Admin` page displayed:

- period report `R19763479863368549_report`;
- Courses interactive grid `R27920066730650719`, grid view `R27920066730650719_ig_grid_vc`;
- Leagues interactive grid `R28011591147538931`, grid view `R28011591147538931_ig_grid_vc`;
- Players interactive grid `playersIG`, grid view `playersIG_ig_grid_vc`.

The Courses grid fields were `Course`, `Created On`, `Created By`, `Updated On`, and `Updated By`. The Leagues grid fields were `Order`, `League Name`, `Active?`, `Relegation ?`, `Relegation At`, and `Webhook URL`; the webhook value was intentionally not copied. The Players grid fields were `League` and `Player`.

## Period inventory

The period report contained 34 rows, paginated 15 + 15 + 4. The oldest displayed row was 2024 January and the newest was 2026 October. The exact observed ordering was:

`2026 October`, `2026 September` (`In Progress`), `2026 August`, `2026 July`, `2026 June`, `2026 May`, `2026 April`, `2026 March`, `2026 February`, `2026 January`, `2025 December`, `2025 November`, `2025 October`, `2025 September`, `2025 August`, `2025 July`, `2025 June`, `2025 May`, `2025 April`, `2025 March`, `2025 February`, `2025 January`, `2024 December`, `2024 November`, `2024 October`, `2024 September`, `2024 August`, `2024 July`, `2024 June`, `2024 May`, `2024 April`, `2024 March`, `2024 February`, `2024 January`.

The public period IDs supplied by the recovery brief (47–58, 81–301, and 321–441) are preserved in the existing public evidence. The admin period report did not expose a period-ID column in the observed accessibility tree, so no new admin period-ID mapping is claimed here.

No period radio was selected or changed during this admin audit. The page remained on its existing current-period state; therefore the historical Courses/Players child grids were not altered or used to claim historical row counts.

## Division inventory

The Leagues grid displayed 14 exact labels and an `Order` value. Because the grid did not display a source-ID column, these are reported as admin order values, not silently relabeled as source IDs.

| Admin order | Exact label | Active? |
|---:|---|---|
| 1 | Master | Yes |
| 10 | Elite | Yes |
| 20 | Pro 1 | Yes |
| 30 | Pro 2 | Yes |
| 40 | Pro 3 | Yes |
| 42 | Semi Pro 1 | Yes |
| 43 | Semi Pro 2 | No |
| 44 | Semi Pro 3 | No |
| 45 | Semi Pro 4 | No |
| 50 | Amateur 1 | No |
| 60 | Amateur 2 | No |
| 70 | Amateur 3 | No |
| 80 | Beginner | Yes |
| 90 | Welcome | Yes |

The existing public/source evidence separately records source values 21 Master, 22 Elite, 23 Pro 1, 24 Pro 2, 25 Pro 3, 113 Semi Pro 1, 81 Beginner, 62 Welcome, and retired public values 114 Semi Pro 2 and 115 Semi Pro 3. The current admin grid confirms inactive labels for Semi Pro 2 and Semi Pro 3 and additionally exposes inactive Semi Pro 4 and Amateur 1–3, but does not provide their public selector values in the observed grid.

## Current-period child-grid observation

Without selecting another period, the existing page state showed 8 Courses rows for 2026 September: BHE, BHH, LLE, LLH, MOE, MOH, WWE, and WWH. The initially loaded Players child grid showed 10 Master players. These are current-period administrative UI observations, not a historical export.
