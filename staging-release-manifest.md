# Forward Staging Integration Manifest

## Provenance

- Approved public recovery baseline: `d8aed4d0` (`Remove launch-only surfaces from public live site`)
- Forward MGA/Masters source line: `4c42c9c0` (`Restore approved MGA Open homepage state`)
- Forward candidate checkpoint included: `273bcde8b358c53051db7fd74ebf7c30ea51dd64`
- Integrated source snapshot commit: `459e3a5c8d577be9198cc1b205fdaae15736d7dd`
- Release artifact commit: recorded from the final clean HEAD used for deployment.
- Integration directory: `C:\Users\kryst\krys-leagues\_forward-integration-20261029`

## Included scope

- Approved public recovery route and artwork surface from `d8aed4d0`.
- MGA Open Gardens of Babylon design, four-day schedule, 48 time slots, VIP eligibility, timezone handling, and 12-hour move-out locks.
- Masters preview/finalization code and existing approved placement protections.
- Homepage MGA Open artwork entry linking to `/majors/major-2`.
- Route/artwork completeness tests that fail when approved public routes or critical assets are absent.

## Safety

- Staging Supabase only: `jiekoqgegqcbqaobisvm`.
- Production Supabase and Production domains: untouched.
- No database writes or migrations executed by this integration.
- Shared staging alias: not moved by this integration.
- No official scores, achievements, registrations, trophies, or Masters placement records changed.

## Verification gates

- Recovery source/asset tests: PASS (5/5).
- MGA/Masters focused tests: PASS (22/22).
- TypeScript: PASS (`npx tsc --noEmit --pretty false`).
- Targeted ESLint: PASS using the verified project ESLint configuration.
- Authenticated staging navigation: pending access to a staging-authenticated test session.
- Private Preview deployment: first artifact was rejected before build by Vercel team commit attribution; release retry uses the verified repository author identity.

## Release rule

Do not move `krys-leagues-staging-krys-leagues-projects.vercel.app` until the private Preview from this exact commit passes remote build and authenticated route/workflow checks. This candidate is not a Production release.
