# Rapid Public Route Smoke Manifest

Generated from the live-based recovery worktree by `scripts/public-route-smoke.mjs`.
This is static source/asset evidence; it does not access Production or execute data operations.

| Route | Approved asset | Expected primary links/markers | Legacy marker absent |
| --- | --- | --- | --- |
| / | /main-hub-approved.jpg | /players; /join; /league-play; /kwt; /monthlies; /tournaments; /records; /invitationals; /champions | YES |
| /players | /approved-pages/player-profiles-approved.jpg | loadCanonicalPublicPlayers; filteredPlayers; Search players by screen name; /players/ | YES |
| /records | /approved-pages/overall-leaderboards-approved.jpg | redirect("/records"); /records/single; /records/combined | YES |
| /kwt | /approved-pages/kwt-hub-approved.png | kwt-hub-approved.png; Current Tournament; /kwt/upcoming; /champions?league=kwt&from=kwt; /kwt/records | YES |
| /tournaments | /approved-pages/bracket-tournaments-approved.png | bracket-tournaments-approved.png; /majors?from=tournaments; /tournaments/current; /tournaments/current#live-preview; /invitationals; /tournaments/history | YES |
| /champions | /approved-pages/hall-of-champions-approved.jpg | hall-of-champions-approved.jpg; resolveHallScope; from === "tournaments"; Browse Trophy Categories | YES |
| /join | /approved-pages/join-leagues-approved.jpg | join-leagues-approved.jpg; /register?league=match; /register?league=stroke; /register?league=pyp; /register?league=doubles; /register?league=pro; /register?league=cups | YES |
| /monthlies | /approved-pages/monthly-results-approved.png | monthly-results-approved.png; Year; Month; Division; Monthly result filters | YES |
| /match-play | /approved-pages/match-play-approved.jpg | match-play-approved.jpg; /league-play; /matches; /match-standings | YES |
| /pyp | /approved-pages/pyp-approved.jpg | pyp-approved.jpg; /pyp-standings; /players; /records | YES |
| /skins | /approved-pages/skins-approved.jpg | skins-approved.jpg; /skins-standings; /players; /records | YES |
| /amateur-pro | /approved-pages/amateur-to-pro-approved.jpg | amateur-to-pro-approved.jpg; /matches; /amateur-pro-standings; /players; /records | YES |
| /doubles | /approved-pages/doubles-approved.jpg | doubles-approved.jpg; /doubles-standings; /matches; /players; /records | YES |
| /stroke | /approved-pages/stroke-play-approved.jpg | stroke-play-approved.jpg; /standings; /matches; /players; /records | YES |
| /league-play | /approved-pages/league-play-approved.png | league-play-approved.png; /stroke; /match-play; /doubles; /amateur-pro; /skins; /pyp | YES |
