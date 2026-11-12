# Universal Live Scoring Studio Preview

This release candidate is served at `/scoring-studio`; the Admin demonstration is at `/admin/scoring-studio` and uses the existing site-admin gate. The MGA page links to the player preview.

The preview is interactive but deliberately uses synthetic players, scores, room records, and demo par values. It stores edits in browser `localStorage` under a tournament-specific key. It does not read or write Production tournament records, identities, registrations, rooms, scorecards, or scores.

## Preview coverage

- Four MGA rounds are presented as one combined-score championship. Recorded rounds add their relative-to-par values, missing rounds remain `Not Played`, negative scores are supported, ties share rank, and incomplete or unverified totals remain provisional.
- Players can attach a scorecard image, submit an 18-hole total, and see pending/verified state. Duplicate submissions are disabled in the preview.
- The Admin page is under the existing site-admin layout. It demonstrates hole-by-hole entry, correction history, submission review, and approval.
- The Universal Room Builder operates on `RoomRecord` objects. It creates room drafts, supports exact names, course, difficulty, Eastern start time, adjustable capacity (four is only the default), Global Player add/transfer/remove, individual publication, unpublishing, and an audit list. The player popup and My Tournament schedule are derived from the same published room record and its assigned Global Player IDs.
- A published room update advances its assignment version. Dismissed notices stay dismissed for that unchanged version; updates create a new notice. Drafts and unpublished room records are excluded from player views. Room edits do not receive or change score data.
- The Preview can be opened in compact or large leaderboard mode. Room times show Eastern and the selected player's configured local time.

## Production activation boundary

No Production SQL, data mutation, or Production deployment was performed. No database migration was applied or assigned a version. Live scoring and the Universal Room Builder still need a Production-approved Supabase migration and authenticated RPC/data adapter before they can replace the synthetic Preview store. That migration must reuse Global Players, existing event registrations, and authoritative MGA room records; it must enforce player ownership, site-admin authorization, event isolation, evidence retention, score audit history, and private-draft room filtering. The existing MGA room assignments and published records remain untouched.

The Gardens of Babylon per-round par must also be verified against its approved scorecard before these demo par values can be used for official totals.

This is not a Known-Good release. That record, rollback candidate, and protected recovery baseline are gated on a Production release, Production verification, and the owner's explicit confirmation that the complete system works correctly.
