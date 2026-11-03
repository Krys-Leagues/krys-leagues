export const KWT_SEASON_15_WEEK_01_SOURCE = {
  eventIdentifier: "KWTS15W01",
  courseName: "Raptor Cliffs",
  easyCourseCode: "RCE",
  hardCourseCode: "RCH",
  officialDate: "2026-10-24",
  ownerConfirmedHandicapFreezeCutoff: "2026-10-23T04:00:00Z",
  ownerConfirmedHandicapFreezeTimezone: "America/New_York",
  identitySourceStatus: "14/14 RESOLVED",
} as const

export const KWT_SEASON_15_WEEK_01_SOURCE_SHA256 = "8C9A20EFB45B6399AD4F7DBCFB3633B8C63A6F9F5C6A7A5385069B1A8A0D8D7D"

/** Approved KWT-only Raptor Cliffs snapshots used server-side for Week 01. */
export const KWT_SEASON_15_WEEK_01_RATING_REFERENCES = {
  easy: {
    snapshotId: "b470397b-b07a-5bb4-8575-b83804d7df34",
    courseId: "Raptor Cliff's_easy",
    courseRating: -22.211,
    slope: 9.053,
  },
  hard: {
    snapshotId: "0f19e813-655f-521f-bf29-1397ec14ccb1",
    courseId: "Raptor Cliff's_hard",
    courseRating: -13.895,
    slope: 12.197,
  },
} as const

/**
 * Presentation-only names from the already verified Week 01 identity ledger.
 * Canonical UUIDs stay server-side; this map is used only to avoid asking an
 * administrator to re-review identities that are already verified.
 */
export const KWT_SEASON_15_WEEK_01_IDENTITIES: Readonly<Record<string, string>> = {
  Zanetti: "ZANETTI",
  Jesunet: "JESUNET",
  Chipnputt: "CHIPNPUTT",
  NuttyGrandpa: "NUTTYGRANDPA",
  KillERBee: "KILLERBEE",
  Ultrafox_Lynne: "ULTRAFOX_LYNNE",
  Sj_76: "Sj_76",
  bigja33: "BIGJA",
  "Laurent��": "LAURENT",
  "Maxfrom-fr": "MAXFROM-FR",
  roknhorsebrat: "ROKNHORSEBRAT",
  lynniebodd: "lynniebodd",
  Alyssa38: "ALYSSA38",
  dandnt65: "Dandnt65",
}

/** Public-safe outcomes derived from the verified 18-hole cards and RCE/RCH pars. */
export const KWT_SEASON_15_WEEK_01_VERIFIED_BADGES: Readonly<Record<string, readonly ("KIWI_EASY" | "KIWI_HARD" | "COCONUT")[]>> = {
  "2e4ce1d8-afd6-44a2-9560-f85c16f23747": ["KIWI_EASY", "KIWI_HARD", "COCONUT"],
  "45150b1f-ffa0-4bdf-a9b3-e69a5d79bcaa": ["KIWI_EASY", "KIWI_HARD", "COCONUT"],
  "8832eacf-2433-4ea3-b97e-5d0d25da3099": ["KIWI_EASY"],
  "d4e37778-8a69-4878-9ec3-6b6fddb03425": ["KIWI_EASY", "KIWI_HARD", "COCONUT"],
  "9ac6ad68-7590-470d-8d35-122fcebed394": ["KIWI_EASY"],
  "9a3b0702-8240-400f-afab-00b5412192c7": ["KIWI_EASY"],
  "21be1be9-9b32-4f82-9c48-b0811e0f975e": ["KIWI_EASY"],
  "cb01e4af-b57b-4424-a00f-7697f1c5f90f": ["KIWI_EASY"],
  "55d9c7f0-ba6b-4245-91de-a90189276744": ["KIWI_EASY"],
  "9ba01526-5c8d-4118-81a0-1934c8daee37": ["KIWI_EASY"],
  "d38c0220-8a80-45a6-86e8-d495f523d5ab": ["KIWI_EASY"],
  "fbd60e4a-9d17-4556-9062-dc005a0c5723": ["KIWI_EASY"],
  "c0707ed3-323f-4e0d-b119-99dd9790f8f4": ["KIWI_EASY"],
  "b77d2644-31eb-4b82-9f76-f124a25b9a06": ["KIWI_EASY"],
  "67bf10e5-19f6-4e48-82f6-ae15732edb63": ["KIWI_EASY"],
}

export function verifiedWeek01Badges(playerId: string) {
  return KWT_SEASON_15_WEEK_01_VERIFIED_BADGES[playerId] ?? []
}

export function verifiedWeek01ScreenName(sourceName: string) {
  return KWT_SEASON_15_WEEK_01_IDENTITIES[sourceName] ?? null
}
