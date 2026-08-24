# KrysLeagueBot player lifecycle contract

Bot runtime work belongs in `C:\Users\kryst\KrysLeagueBot`, not this website repository. The bot must call the same protected canonical backend operations used by website administration.

## Identity and onboarding

- Resolve only by Discord user ID to canonical `public.players.id`; never resolve a lifecycle mutation from a typed name.
- Discord join must not create a player automatically.
- The welcome message sends the member to the canonical website `/join` flow.
- Website login resolves the Discord provider ID before onboarding. A matched player returns to the existing UUID. No match enters explicit linking/registration. Conflicts require admin review.
- Archived matches must not create duplicates or silently reactivate. Reactivation is a separate authorized, audited status transition.
- Competition enrollment is separate from account/profile linking.

## Departure and status

- A member-remove event creates a private departure review notification; it does not archive automatically.
- Archive confirmation rechecks current guild membership and cancels if the member has returned.
- Authorized admins use the canonical `set_site_player_status` transition for Active, Inactive, or Archived. Memorial remains a separate attribute.
- The operation retains canonical UUID, Discord link, aliases, and history and follows deferred Records/Climbers finalization rules.
- Every transition records player UUID, old/new status, Discord ID, detection time, confirming admin/time, and reason/source.

## Bot work still required

- Implement member-remove detection and the private Archive / Inactive / Ignore controls.
- Implement `/check-departed-players` reconciliation without mass archival.
- Implement website `/join` welcome messaging on member join without auto-creation.
- Call the protected website/backend contract with bot service authentication; do not duplicate player-status state inside the bot.
