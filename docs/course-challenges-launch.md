# Course Challenges launch lane

This lane contains the Course Challenges UI, scorecard submission flow, evaluator,
admin review contract, and reward progression without running SQL or deploying.
The optional persistence schema is in `course_challenges_foundation.sql` for Krys
review and a later controlled migration.

The app reads authoritative hole pars from `all_time_courses` and does not create
a second Course Challenges par catalog.

## Tourist Trap

Tourist Trap Levels 1–5 use the approved requirements. Each level requires one
approved Easy card and one approved Hard card from that same 18-hole card.
Tourist Trap has a separate Ace Challenge that unlocks after Level 3.

The confirmed shared stroke-out rule is:

`entered_hole_score >= authoritative_hole_par + 4`

The exact Tourist Trap Ace artwork is present at
`public/course-challenges/tourist-trap/tourist-trap-ace-challenge.png`.

## Cherry Blossom

Cherry Blossom Level 1 is configured from the approved content pass:

- Easy: complete, -10 or better, no stroke-outs, and 2 eagles or better.
- Hard: complete, 6 holes at par or better, Hole 2 bogey or better, and Hole 10
  par or better.

The Hole 2 and Hole 10 PB tips are optional native details elements and remain
collapsed by default.

Cherry Blossom Levels 2–5 remain `pending_review`; their requirements are not
shown while locked and were not invented.

Cherry Blossom Level 1 reward artwork is unresolved. No approved Cherry Blossom
Level 1 reward filename/path was present or supplied, so the logical reward key
remains configured without an artwork reference.

## Release configuration

`lib/courseChallenges/release.ts` reads:

- `COURSE_CHALLENGES_TESTING_START_DATE`
- `COURSE_CHALLENGES_PUBLIC_LAUNCH_DATE`

The implementation expects date-only `YYYY-MM-DD` values, not ISO timestamps, and
performs no timezone conversion. Course Challenges does not maintain a tester ID,
email, display-name, screen-name, Discord-username, or auth-UUID allowlist.

Tester status comes from the existing `get_current_site_access` RPC through
`public.players.id` and its canonical `approved_tester` result. The existing site
prelaunch gate remains the access boundary.