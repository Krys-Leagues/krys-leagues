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
  "2e4ce1d8-afd6-44a2-9560-f85c16f23747": ["COCONUT"],
  "d38c0220-8a80-45a6-86e8-d495f523d5ab": ["KIWI_EASY"],
  "fbd60e4a-9d17-4556-9062-dc005a0c5723": ["KIWI_EASY"],
}

export function verifiedWeek01Badges(playerId: string) {
  return KWT_SEASON_15_WEEK_01_VERIFIED_BADGES[playerId] ?? []
}

export function verifiedWeek01ScreenName(sourceName: string) {
  return KWT_SEASON_15_WEEK_01_IDENTITIES[sourceName] ?? null
}
