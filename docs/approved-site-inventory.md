# Approved website inventory

Baseline: `13809e859c7dc5436b04d6101b647e6eab0cd4f8`  
Recovery worktree: `codex/automated-recovery-20261029`  
Database target: staging-only `jiekoqgegqcbqaobisvm`

This inventory is source-backed. The route-completeness test enumerates every committed `app/**/page.tsx` route and checks the approved public surface and artwork assets. Browser smoke checks are recorded separately because Vercel Deployment Protection and the application's staging access gate are different controls.

## Public artwork and navigation

| Route | Approved appearance | Required behavior | Baseline status |
| --- | --- | --- | --- |
| `/` | Original main hub artwork with artwork hitboxes, Course Challenges extension, MGA Open artwork CTA, and admin entry | Navigate to Player Profiles, Join, League Play, KWT, Monthlies, Bracket Tournaments, Overall Leaderboards, Invitationals, Hall of Champions, Course Challenges, and MGA Open | PASS |
| `/players` | Approved Player Profiles artwork | Searchable canonical-player directory with live filtering and profile links | PASS |
| `/league-play` | Approved six-league artwork | Navigate to Stroke, Match, Doubles, Amateur to Pro, Skins, and PYP plus their standings/results/records destinations | PASS |
| `/match-play` | Approved Match Play artwork | Matches/results and Match standings links | PASS |
| `/stroke` | Approved Stroke Play artwork | Matches, standings, records, and player-profile links | PASS |
| `/doubles` | Approved Doubles artwork | Matches, standings, teams/player directory, and records links | PASS |
| `/pyp` | Approved PYP artwork | Public standings, player profiles, and records links | PASS |
| `/skins` | Approved Skins artwork | Leaderboard, player totals, and records links | PASS |
| `/amateur-pro` | Approved Amateur-to-Pro artwork | Matches, standings, progression, and records links | PASS |
| `/kwt` | Approved KWT hub artwork | Current Tournament, Upcoming Events, Past Champions, and Records destinations | PASS; current tournament remains an external Oracle destination by design |
| `/tournaments` | Approved Bracket Tournaments artwork | Four Majors, open registration, current brackets, invitationals, and history hitboxes; no fabricated live bracket | PASS |
| `/invitationals` | Approved Invitationals artwork | Champion of Champions, Krys Cup, Spicy Cup, past-winner/invite paths | PASS |
| `/majors` and `/majors/[slug]` | Approved Majors/Gardens of Babylon artwork | Real event detail, four dates, time slots, timezone display, and protected signup flow | PASS in staging Preview |
| `/monthlies` | Approved Monthly Results artwork | Completed-period selector, previous/next navigation, and results API | PASS at route/source level; data-dependent results require staging records |
| `/records` and `/leaderboards` | Approved Overall Leaderboards artwork | Public read-only records landing page, single-course and combined boards | PASS after repair: `/leaderboards` remains the alias and `/records` is now classified as a public read-only feature |
| `/champions` | Approved Hall of Champions artwork | Published history, trophies, achievements, and canonical profile links | PASS at route/source level; unpublished content remains protected |
| `/course-challenges` | Approved challenge artwork/extension | Challenge catalog and course detail routes | PASS |

## Functional route families

- KWT: `/kwt`, `/kwt/upcoming`, `/kwt/records`, `/champions?league=kwt&from=kwt`.
- Bracket tournaments: `/tournaments`, `/tournaments/current`, `/tournaments/history`, and the existing registration overlay/API paths.
- Majors/MGA: `/majors/major-2`, `/api/majors/data?resource=event|detail&slug=major-2`, with four seeded play days and 48 slots in the staging fixture.
- Player identities: `/players`, `/players/[id]`, and protected admin player operations.
- Admin: all committed `/admin/**` route families are preserved; authentication and site-admin authorization are tested separately and are not inferred from a public HTTP 200.

## Evidence and decisions

- The prior Preview browser session showed the homepage, MGA Open, Player Profiles, and KWT content, while `/leaderboards` ended at `/access-denied` after the redirect to `/records`.
- The records page uses public read APIs and contains no admin mutation UI. The correction changes only feature visibility for the public records surface; it does not change data access, RLS, scoring, or admin authorization.
- Staging prelaunch access can still require an authenticated tester/admin session for private or protected routes. No owner decision is required for the records visibility correction. Authenticated admin workflow verification remains an explicit verification limitation, not a reason to weaken the gate.

