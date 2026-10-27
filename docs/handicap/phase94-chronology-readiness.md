# Phase 94 chronology readiness

## Evidence result

The additional historical KWT handoffs outside the Phase 93 124-event set were reviewed read-only:

- `docs/historical-sources/kwt/season-09-discord-evidence.txt`
- `docs/historical-sources/kwt/season-09-review-1755f455744b.json`
- `docs/historical-sources/kwt/kwt-seasons-10-and-11-authoritative-handoff.txt`
- `docs/historical-sources/kwt/season-11-elite-3rd-bigja.png`

They support competition-period facts, source aliases, placements, and canonical identity evidence. They do not contain authoritative play timestamps or verified within-week order. Screenshot/file metadata and Discord repost timing are not used as chronology.

The separate All-Time observation timestamps and major-scorecard timestamps were not treated as KWT round timestamps because no authoritative source linkage proves that they describe the same KWT rounds. No new exact KWT chronology was recovered.

## Current readiness

The 13,550 corrected KWT records remain `PERIOD_ONLY`; no existing player can be promoted to exact latest-10/best-5 publication from this evidence alone. Weekly records remain course-rating-only. Production publication gates and historical records are unchanged.

## Future intake contract

`lib/handicap/futureKwtChronology.ts` accepts a future KWT round only when it has:

- a canonical `public.players.id` UUID;
- the original player name;
- a stable source ID and fingerprint;
- a source evidence reference; and
- a source-proven timestamp with an explicit timezone.

It rejects Weekly evidence, missing identity/evidence, timezone-less timestamps, and duplicate source identity. It never substitutes an import timestamp, file timestamp, Discord repost time, season/week label, or numeric round ID.
