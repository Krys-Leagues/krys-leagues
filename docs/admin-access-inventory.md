# Admin access inventory

Generated from the Production-base source tree at 6de62126a155e6c78dfdfc0f34edb81189393e58.

Status is a static boundary signal: UNSAFE means a client file directly touches a protected table/RPC; SAFE means server-side or explicitly authorized/public-safe by static evidence; NEEDS REVIEW requires workflow review.

## Admin pages (178)

| Route | Component | Tables | RPCs | API routes | Authorization evidence | Status |
|---|---|---|---|---|---|---|
| /admin/about | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/analytics | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/archive | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/audit | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/backup | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/bracket-builder | client | player_tracker | — | — | layout/inherited | UNSAFE |
| /admin/bracket-results | client | player_tracker, bracket_results, player_tracker | — | — | layout/inherited | UNSAFE |
| /admin/career | client | players, results, player_league_memberships, player_trophies | — | — | layout/inherited | UNSAFE |
| /admin/champion-of-champions | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/champion-of-champions/active-games | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/champion-of-champions/results | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/champion-of-champions/setup | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/command-center | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/course-challenges | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/course-challenges/review-desk | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/dashboard | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/database | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/developer | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/doubles | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/doubles/results | client | schedule, results, results | — | — | layout/inherited | UNSAFE |
| /admin/doubles/schedule | client | doubles_teams, seasons, seasons, schedule | — | /api/discord/season-schedule | layout/inherited | UNSAFE |
| /admin/doubles/teams | client | players, doubles_teams, doubles_teams | — | — | layout/inherited | UNSAFE |
| /admin/exports | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/handicaps | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/help | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/history | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/import | client | — | — | — | layout/inherited | NEEDS REVIEW |
| /admin/import/csv | client | — | — | — | layout/inherited | NEEDS REVIEW |
| /admin/import/monthly | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/import/pro | client | — | — | /api/admin/historical-pro | layout/inherited | NEEDS REVIEW |
| /admin/import/profile-backgrounds | client | — | admin_create_player_profile_background | — | layout/inherited | UNSAFE |
| /admin/import/pyp | client | — | — | /api/admin/historical-pyp, /api/admin/historical-pyp/identity, /api/admin/historical-pyp/apply | layout/inherited | NEEDS REVIEW |
| /admin/import/stroke-v2 | client | — | — | /api/admin/historical-stroke-v2 | layout/inherited | NEEDS REVIEW |
| /admin/imports | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/integrations | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/krys-tourney | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/krys-tourney/active-games | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/kwt | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/kwt-import | client | — | commit_historical_kwt_preview | — | layout/inherited | UNSAFE |
| /admin/kwt-import/discord-season-9 | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/kwt-import/library | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/kwt-import/website-recovery | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/kwt/active-games | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/kwt/setup | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/leaderboards | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/logs | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/maintenance | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/majors | client | major_entries, major_events | save_major_event, admin_register_major_player, set_major_entry_status | — | layout/inherited | UNSAFE |
| /admin/majors/scheduling | client | major_play_days, major_time_slots, major_standard_signup_times, major_entries, major_entry_weekend_status, major_schedule_groups, major_final_placements, major_entry_day_choices, major_schedule_group_members, major_events, major_play_days, major_time_slots, major_time_slots, major_time_slots | get_major_test_testers, configure_major_signup_release, set_major_schedule_lock_hours, release_additional_major_spots, save_major_standard_signup_time, remove_major_standard_signup_time, copy_major_thursday_times_to_standard, apply_major_standard_signup_times, create_major_time_slot, admin_set_major_day_choice, save_major_schedule_group, save_major_schedule_group, delete_major_schedule_group, set_major_weekend_status, publish_major_weekend_field, save_major_final_placement, save_major_event_information, add_major_test_tester, remove_major_test_tester, set_major_test_event_listing | — | layout/inherited | UNSAFE |
| /admin/majors/scoring | client | major_scoring_participants, major_hole_scores, major_events, major_scoring_sessions | create_major_scoring_session, update_major_scoring_session, clear_major_hole_score, save_major_hole_scores, save_major_scorecard_theme | — | layout/inherited | UNSAFE |
| /admin/majors/verification | client | major_events, major_play_days, major_entries | get_major_scorecard_verification_queue, get_major_scorecard_verification_queue, set_major_round_scoring_state, finalize_major_scoring_round | — | layout/inherited | UNSAFE |
| /admin/match | client | seasons, match_roster_versions | — | — | layout/inherited | UNSAFE |
| /admin/match/players | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/match/results | client | seasons, match_roster_versions, match_roster_versions, schedule, results | get_public_match_play, save_match_result, rebuild_match_standings, delete_match_result | /api/admin/match/discord | layout/inherited | UNSAFE |
| /admin/match/schedule | client | seasons, match_roster_versions, match_schedule_state, schedule, match_division_roster_slots, match_division_course_overrides, results | review_match_schedule, generate_match_schedule | — | layout/inherited | UNSAFE |
| /admin/match/season | client | — | create_match_season_with_roster | — | layout/inherited | UNSAFE |
| /admin/match/season/edit | client | seasons, match_roster_versions | resize_match_season_divisions, update_match_season_details | — | layout/inherited | UNSAFE |
| /admin/match/setup | client | match_schedule_state, seasons, match_roster_versions, match_division_roster_slots, match_division_course_overrides, players, players | set_match_division_roster_slots, set_match_division_course_overrides, approve_match_roster_version, generate_match_schedule | — | layout/inherited | UNSAFE |
| /admin/match/standings | client | seasons, match_roster_versions, season_standings, match_division_roster_slots, match_final_scorecards, match_final_scorecard_entries, schedule, results | generate_match_final_scorecard, approve_match_final_scorecard | — | layout/inherited | UNSAFE |
| /admin/match/transition | client | match_final_scorecards, seasons, match_final_scorecard_entries, match_final_scorecard_player_decisions, seasons, players, match_roster_versions, match_division_roster_slots | set_match_return_decision, create_match_season_with_roster, generate_match_next_season_proposal | — | layout/inherited | UNSAFE |
| /admin/media | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/notifications | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/page.tsx | client | — | — | /api/admin/course-challenges | layout/inherited | NEEDS REVIEW |
| /admin/permissions | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/player-identity | client | — | — | — | layout/inherited | NEEDS REVIEW |
| /admin/player-identity/duplicates | client | — | — | /api/admin/players/merge, /api/admin/players/merge, /api/admin/players/merge, /api/admin/players/merge | layout/inherited | NEEDS REVIEW |
| /admin/player-matching | client | players, discord_members | set_site_player_discord_identity | — | layout/inherited | UNSAFE |
| /admin/player-tracker | client | player_tracker, player_tracker, player_waitlist, player_tracker, player_tracker | — | — | layout/inherited | UNSAFE |
| /admin/players | client | — | — | /api/admin/players, /api/admin/players | layout/inherited | NEEDS REVIEW |
| /admin/players/[id] | client | — | — | /api/admin/players/${playerId}, /api/admin/players/${player.id}, /api/admin/players/${player.id} | layout/inherited | NEEDS REVIEW |
| /admin/players/merge | client | — | — | /api/admin/players, /api/admin/players/merge, /api/admin/players/merge | layout/inherited | NEEDS REVIEW |
| /admin/pro | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/pro/results | client | schedule, results, results | — | — | layout/inherited | UNSAFE |
| /admin/pro/schedule | client | players, seasons, seasons, schedule | — | /api/discord/season-schedule | layout/inherited | UNSAFE |
| /admin/pyp | client | seasons, pyp_roster_versions | — | — | layout/inherited | UNSAFE |
| /admin/pyp/active-games | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/pyp/players | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/pyp/results | client | schedule, pyp_managed_results | save_pyp_result, rebuild_pyp_standings, delete_pyp_result | — | layout/inherited | UNSAFE |
| /admin/pyp/schedule | client | seasons, pyp_roster_versions, pyp_schedule_state, schedule, pyp_managed_results | — | — | layout/inherited | UNSAFE |
| /admin/pyp/season | client | — | create_pyp_season_with_roster | — | layout/inherited | UNSAFE |
| /admin/pyp/season/edit | client | seasons, pyp_roster_versions | resize_pyp_season_divisions, update_pyp_season_details | — | layout/inherited | UNSAFE |
| /admin/pyp/setup | client | seasons, pyp_roster_versions, pyp_division_roster_slots, players, players | set_pyp_division_roster_slots, approve_pyp_roster_version | — | layout/inherited | UNSAFE |
| /admin/pyp/standings | client | seasons, pyp_roster_versions, pyp_final_scorecards, pyp_division_roster_slots, season_standings, pyp_final_scorecard_entries, pyp_final_scorecard_fixture_details | rebuild_pyp_standings, generate_pyp_final_scorecard, approve_pyp_final_scorecard | — | layout/inherited | UNSAFE |
| /admin/pyp/transition | client | pyp_final_scorecards, seasons, pyp_final_scorecard_entries, pyp_final_scorecard_player_decisions, seasons, players, pyp_roster_versions, pyp_division_roster_slots | set_pyp_return_decision, create_pyp_season_with_roster, generate_pyp_next_season_proposal | — | layout/inherited | UNSAFE |
| /admin/records | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/records/all-time | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/records/arizona-modern | client | — | — | /api/admin/records/all-time/preview, /api/admin/records/all-time/preview, /api/admin/records/all-time/apply | layout/inherited | NEEDS REVIEW |
| /admin/records/backfill | client | all_time_courses, players, all_time_late_backfill_audit, all_time_best_records | preview_all_time_late_backfill_entry, preview_all_time_late_backfill_batch, record_all_time_late_backfill_batch, preview_all_time_late_backfill_entry, record_all_time_late_backfill_entry | — | layout/inherited | UNSAFE |
| /admin/records/climbers | client | climbers_seasons, climbers_events, climbers_event_passes, climbers_year_to_date, players, all_time_courses, climbers_legacy_baseline_imports, climbers_legacy_baseline_source_rows, climbers_legacy_baselines | create_climbers_season, finalize_climbers_season | /api/admin/records/climbers/baseline/activate | layout/inherited | UNSAFE |
| /admin/records/combined | client | players, combined_course_records, combined_course_records | — | — | layout/inherited | UNSAFE |
| /admin/records/entry | client | all_time_courses, climbers_seasons, all_time_best_records, all_time_best_records | — | /api/admin/records/entry, /api/admin/records/player-search, /api/admin/records/all-time/scorecard | layout/inherited | UNSAFE |
| /admin/records/history | client | all_time_courses, players, all_time_record_observations | correct_all_time_late_backfill_batch_entry, correct_all_time_late_backfill_entry, correct_all_time_record_entry, void_all_time_late_backfill_entry, void_all_time_record_entry | — | layout/inherited | UNSAFE |
| /admin/records/single | client | all_time_courses, all_time_best_records, all_time_record_observations | — | — | layout/inherited | UNSAFE |
| /admin/reports | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/results | client | schedule, results, results, results | — | /api/discord/result-card | layout/inherited | UNSAFE |
| /admin/roles | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/schedule | client | schedule | — | — | layout/inherited | UNSAFE |
| /admin/scorecards | server/inherited | shared_scorecard_evidence | — | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /admin/season-manager | client | seasons, seasons, seasons, seasons, seasons, seasons, seasons | — | — | layout/inherited | NEEDS REVIEW |
| /admin/security | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/api | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/backup | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/beta | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/database | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/developer | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/developer-tools | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/experimental | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/features | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/integrations | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/logging | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/maintenance | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/monitoring | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/notifications | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/performance | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/permissions | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/roles | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/security | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/storage | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/system | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/testing | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/advanced/users | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/api | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/appearance | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/automation | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/branding | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/database | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/email | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/exports | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/general | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/imports | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/integrations | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/league | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/logging | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/media | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/notifications | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/performance | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/players | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/reports | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/security | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/standings | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/storage | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/system | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/settings/tournament | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/skins | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/skins/active-games | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/skins/results | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/skins/setup | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/solo | client | seasons, solo_roster_versions | — | — | layout/inherited | NEEDS REVIEW |
| /admin/solo/results | client | seasons, solo_weeks, solo_roster_versions, solo_roster_entries, solo_score_attempts | save_solo_card, delete_solo_score_attempt | — | layout/inherited | UNSAFE |
| /admin/solo/season | client | seasons | update_solo_season_dates, create_solo_season_with_roster | — | layout/inherited | UNSAFE |
| /admin/solo/setup | client | seasons, solo_roster_versions, solo_player_pool, players, solo_roster_entries | search_solo_historical_global_players, search_solo_existing_global_players, search_solo_historical_global_players, search_solo_existing_global_players, find_solo_historical_player_by_discord_id, find_solo_player_by_discord_id, add_existing_player_to_solo_historical_pool, add_existing_player_to_solo_pool, create_solo_canonical_player, find_solo_historical_player_by_discord_id, find_solo_player_by_discord_id, save_solo_roster, approve_solo_roster_version | — | layout/inherited | UNSAFE |
| /admin/solo/share | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/solo/standings | client | seasons, solo_weeks, solo_roster_versions, solo_week_snapshots, solo_roster_entries, solo_week_snapshot_entries | — | — | layout/inherited | NEEDS REVIEW |
| /admin/solo/weeks | client | seasons, solo_weeks, solo_roster_versions, solo_roster_entries, solo_live_best_attempts | update_solo_week, close_solo_week, reopen_solo_week | — | layout/inherited | UNSAFE |
| /admin/spicy | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/spicy/active-games | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/spicy/results | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/spicy/setup | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/standings | client | results | — | — | layout/inherited | NEEDS REVIEW |
| /admin/stroke | client | seasons, stroke_roster_versions | — | — | layout/inherited | UNSAFE |
| /admin/stroke/manage | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/stroke/players | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/stroke/results | client | seasons, stroke_roster_versions, schedule, results | save_stroke_result, rebuild_stroke_standings, delete_stroke_result | — | layout/inherited | UNSAFE |
| /admin/stroke/schedule | client | seasons, stroke_roster_versions, stroke_schedule_state, schedule, stroke_division_roster_slots, stroke_division_course_overrides, results | review_stroke_schedule, generate_stroke_schedule | — | layout/inherited | UNSAFE |
| /admin/stroke/season | client | — | create_stroke_season_with_roster | — | layout/inherited | UNSAFE |
| /admin/stroke/season/edit | client | seasons, stroke_roster_versions | resize_stroke_season_divisions, update_stroke_season_details | — | layout/inherited | UNSAFE |
| /admin/stroke/setup | client | stroke_schedule_state, seasons, stroke_roster_versions, stroke_division_roster_slots, stroke_division_course_overrides, players, players | set_stroke_division_roster_slots, set_stroke_division_course_overrides, approve_stroke_roster_version, generate_stroke_schedule | — | layout/inherited | UNSAFE |
| /admin/stroke/standings | client | seasons, stroke_roster_versions, season_standings, players, stroke_final_scorecards, stroke_final_scorecard_entries, schedule, results | generate_stroke_final_scorecard, approve_stroke_final_scorecard | — | layout/inherited | UNSAFE |
| /admin/stroke/transition | client | stroke_final_scorecards, seasons, stroke_final_scorecard_entries, stroke_final_scorecard_player_decisions, seasons, players, stroke_roster_versions, stroke_division_roster_slots | set_stroke_return_decision, create_stroke_season_with_roster, generate_stroke_next_season_proposal | — | layout/inherited | UNSAFE |
| /admin/system | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/testing | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/tools | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/trophies | client | player_trophies, player_trophies, player_trophies, player_trophies, player_trophies, player_trophies, player_trophies | — | /api/trophies/assets | layout/inherited | UNSAFE |
| /admin/users | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/utilities | server/inherited | — | — | — | layout/inherited | SAFE |
| /admin/waitlist | client | player_waitlist, players, player_waitlist, player_waitlist | — | — | layout/inherited | UNSAFE |

## Admin API handlers (29)

| Route | Component | Tables | RPCs | API routes | Authorization evidence | Status |
|---|---|---|---|---|---|---|
| /api/admin/course-challenges | server/inherited | course_challenge_submission_review_events, course_challenge_submissions, course_challenge_submissions, players, all_time_courses, course-challenge-proof, course_challenge_submissions, course_challenge_submission_review_events, course-challenge-proof, course_challenge_submissions, course_challenge_submissions, course_challenge_submissions, course_challenge_submissions, course_challenge_submission_review_events, course_challenge_submissions, all_time_courses, course_challenge_submission_review_events, course_challenge_submissions, course_challenge_ace_progress, course_challenge_rewards, course_challenge_prestige_progress, course_challenge_rewards, course_challenge_progress, course_challenge_rewards, course_challenge_submissions, course_challenge_submission_review_events, course_challenge_submissions, course_challenge_submission_review_events, course_challenge_ace_progress, course_challenge_rewards | current_user_canonical_player_id, return_course_challenge_submission_to_review, current_user_canonical_player_id, approve_course_challenge_submission | — | requireCourseChallengeAdmin, requireCourseChallengeAdmin, requireCourseChallengeAdmin | SAFE |
| /api/admin/course-challenges/ace-recalculation | server/inherited | course_challenge_submissions, course_challenge_ace_progress, players | — | — | requireCourseChallengeAdmin, requireCourseChallengeAdmin | SAFE |
| /api/admin/historical-pro | server/inherited | — | — | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/historical-pyp | server/inherited | historical_pyp_observations | — | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/historical-pyp/apply | server/inherited | — | commit_historical_pyp_preview | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/historical-pyp/identity | server/inherited | — | remember_verified_player_alias | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/historical-stroke-v2 | server/inherited | — | — | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/kwt-website-recovery | server/inherited | players, player_aliases, player_identity_links, historical_kwt_imports, historical_kwt_scorecards | is_current_user_site_admin | — | authorizedAdmin, authorizedAdmin | SAFE |
| /api/admin/kwt-website-recovery/apply | server/inherited | — | is_current_user_site_admin, commit_historical_kwt_preview | — | authorizedAdmin, authorizedAdmin | SAFE |
| /api/admin/match/discord | server/inherited | — | get_public_match_play | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/monthly-website-recovery | server/inherited | — | — | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/monthly-website-recovery/apply | server/inherited | — | commit_historical_monthly_preview | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/monthly-website-recovery/identity | server/inherited | — | remember_verified_player_alias | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/monthly-website-recovery/repaired-preview | server/inherited | — | — | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/monthly-website-recovery/validate | server/inherited | — | — | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/players | server/inherited | players, player_league_memberships, player_tournament_entries, player_identity_links, schedule, handicap_rounds, player_career_events, players, players, players, players, players, player_league_memberships, player_league_memberships, player_tournament_entries, players, player_tournament_entries | set_site_player_profile_recognition, set_site_player_discord_identity | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/players/[id] | server/inherited | players, player_league_memberships, player_trophies, results | get_public_player_canonical_identity, get_public_player_avatar, get_public_player_avatar, set_site_player_avatar_path, get_public_player_avatar, set_site_player_avatar_path | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/players/merge | server/inherited | — | get_site_player_duplicate_candidates, preview_site_player_identity_merge, mark_site_players_not_match, merge_site_player_identities_with_avatar | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/records/all-time/apply | server/inherited | — | — | — | layout/inherited | SAFE |
| /api/admin/records/all-time/preview | server/inherited | — | — | — | layout/inherited | SAFE |
| /api/admin/records/all-time/scorecard | server/inherited | all_time_record_observations, all_time_scorecard_attachments, all_time_scorecard_attachments | — | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/records/arizona-modern/apply | server/inherited | — | apply_all_time_record_import, remember_verified_player_alias | — | authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/records/arizona-modern/preview | server/inherited | all_time_best_records | — | — | authorizedAdminClient, authorizedAdminClient, authorizedAdminClient | SAFE |
| /api/admin/records/climbers/baseline/activate | server/inherited | climbers_legacy_baseline_imports, climbers_legacy_baseline_source_rows, climbers_legacy_baselines, climbers_legacy_baseline_imports, climbers_legacy_baselines, climbers_year_to_date | apply_climbers_legacy_baseline | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/records/entry | server/inherited | — | — | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/records/player-search | server/inherited | — | — | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/scorecards | server/inherited | shared_scorecard_evidence | — | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/stroke/manage | server/inherited | — | — | — | authorizeSiteAdminMutation, authorizeSiteAdminMutation, authorizeSiteAdminMutation | SAFE |
| /api/admin/stroke/post-schedule | server/inherited | seasons, stroke_roster_versions, stroke_schedule_state, schedule, players | is_current_user_site_admin, mark_stroke_schedule_posted | — | layout/inherited | SAFE |

## Admin components

- components/admin/CourseChallengePendingAlert.tsx
- components/admin/ManagedLeaguePlayersPage.tsx
- components/admin/ManagedSeasonDangerZone.tsx
- components/admin/course-challenges/CourseChallengeReviewQueue.tsx
- components/admin/records/AdminRecordsUI.tsx
- components/admin/records/CompactScorecardGrid.tsx
- components/admin/records/ScorecardEvidence.tsx
- components/admin/scorecards/AdminScorecardsClient.tsx
- components/admin/scorecards/EighteenHoleEditor.tsx
- components/admin/scorecards/ManageStrokeSeasonClient.tsx
- components/admin/scorecards/ScorecardEvidenceViewer.tsx
- components/admin/scorecards/SharedScorecardReviewer.tsx

## Admin libraries/helpers

- lib/adminAccess/core.test.ts
- lib/adminAccess/core.ts
- lib/all-time/arizona/catalog.ts
- lib/all-time/arizona/csv.ts
- lib/all-time/arizona/identity.ts
- lib/all-time/arizona/legacy.ts
- lib/all-time/arizona/review.ts
- lib/all-time/arizona/scoring.ts
- lib/all-time/arizona/types.ts
- lib/all-time/arizona/xlsm.ts
- lib/all-time/authoritative-date-time.ts
- lib/all-time/climbers-baseline-activation.test.ts
- lib/all-time/climbers-baseline-activation.ts
- lib/all-time/climbers-baseline-review.test.ts
- lib/all-time/climbers-baseline-review.ts
- lib/all-time/climbers-period-display.test.ts
- lib/all-time/climbers-period-display.ts
- lib/all-time/climbers-ytd-display.ts
- lib/all-time/dense-rank.ts
- lib/all-time/fast-entry-workflow.test.ts
- lib/all-time/fast-entry-workflow.ts
- lib/all-time/late-backfill-batch-sql.test.ts
- lib/all-time/late-backfill-batch.test.ts
- lib/all-time/late-backfill-batch.ts
- lib/all-time/late-backfill-sql.test.ts
- lib/all-time/late-backfill.test.ts
- lib/all-time/late-backfill.ts
- lib/all-time/legacy-period-entry-sql.test.ts
- lib/all-time/normal-records-sql.test.ts
- lib/all-time/normal-records.test.ts
- lib/all-time/normal-records.ts
- lib/all-time/pb-precheck.ts
- lib/all-time/period-display.ts
- lib/all-time/player-picker.ts
- lib/all-time/public-records.ts
- lib/all-time/score-input.ts
- lib/all-time/scorecard-server.ts
- lib/all-time/verified-period-replay-sql.test.ts
- lib/all-time/verified-period-sql.test.ts
- lib/auth/siteAdminAuthorizationCore.ts
- lib/auth/siteAdminMutation.test.ts
- lib/auth/siteAdminMutation.ts
- lib/authReturnTo.ts
- lib/courseChallenges/ace.test.ts
- lib/courseChallenges/ace.ts
- lib/courseChallenges/aceNoGameModeMigration.test.ts
- lib/courseChallenges/aceRecalculation.test.ts
- lib/courseChallenges/aceRecalculation.ts
- lib/courseChallenges/admin-review.test.ts
- lib/courseChallenges/all-time-integration.test.ts
- lib/courseChallenges/assets.ts
- lib/courseChallenges/catalog.ts
- lib/courseChallenges/celebrations.ts
- lib/courseChallenges/community.test.ts
- lib/courseChallenges/duplicateUsage.test.ts
- lib/courseChallenges/duplicateUsage.ts
- lib/courseChallenges/evaluation.test.ts
- lib/courseChallenges/evaluation.ts
- lib/courseChallenges/gameMode.test.ts
- lib/courseChallenges/gameMode.ts
- lib/courseChallenges/profile.ts
- lib/courseChallenges/public-access.test.ts
- lib/courseChallenges/release.test.ts
- lib/courseChallenges/release.ts
- lib/courseChallenges/rewards.ts
- lib/courseChallenges/security.test.ts
- lib/courseChallenges/selfApproval.test.ts
- lib/courseChallenges/server.ts
- lib/courseChallenges/types.ts
- lib/courseChallenges/ux.test.ts
- lib/identity/adminGlobalPlayerClient.ts
- lib/identity/adminGlobalPlayerCore.ts
- lib/identity/adminGlobalPlayerLookup.ts
- lib/identity/adminPlayerMergeServer.ts
- lib/identity/globalPlayerDirectory.ts
- lib/identity/index.ts
- lib/identity/normalizeIdentity.ts
- lib/identity/resolveIdentity.ts
- lib/identity/scoreIdentityMatch.ts
- lib/identity/types.ts
- lib/scorecards/adapters/catalog.ts
- lib/scorecards/adapters/contracts.ts
- lib/scorecards/adapters/stroke.ts
- lib/scorecards/adminServer.ts
- lib/scorecards/bridge.ts
- lib/scorecards/core.test.ts
- lib/scorecards/core.ts
- lib/scorecards/playerHistory.test.ts
- lib/scorecards/playerHistory.ts
- lib/scorecards/productionReconciliation.test.ts
- lib/scorecards/security.test.ts
- lib/scorecards/server.ts
- lib/scorecards/sharedScorecardMigration.test.ts
- lib/scorecards/strokeBoardServer.ts
- lib/scorecards/strokePilot.test.ts
- lib/scorecards/strokePilot.ts
- lib/scorecards/strokePilotE2E.test.ts

## Audit limitation

This inventory is source-level evidence, not a live database ACL/RLS query. The read-only permission-contract command is npm run audit:database-permissions; it emits the operator-approved inspection SQL but does not execute it.
