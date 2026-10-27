export type HandicapAdminCourseCoverage = Readonly<{
  code: string
  baseMap: string
  difficulty: "easy" | "hard"
  sampleSize: number
  distinctPlayers: number
  eliteSampleSize: number
  evidenceStatus: "LOCAL_PROJECTION" | "NEW_VERIFIED_EVIDENCE" | "NO_VERIFIED_EVIDENCE"
  ratingStatus: "PROVISIONAL_REVIEW" | "UNRATED"
  confidence: "PROVISIONAL_REVIEW" | "INSUFFICIENT_SAMPLE" | "NO_EVIDENCE"
}>

type CourseBase = Readonly<{ code: string; baseMap: string }>
type ProjectionEvidence = Readonly<{
  sampleSize: number
  distinctPlayers: number
  eliteSampleSize: number
}>

// This is copied from the authoritative all_time_complete_course_catalog.sql
// catalog as a display contract. It is not a second rating source.
export const OFFICIAL_HANDICAP_COURSE_BASES: readonly CourseBase[] = [
  { code: "TT", baseMap: "Tourist Trap" },
  { code: "CB", baseMap: "Cherry Blossom" },
  { code: "SS", baseMap: "Seagull Stacks" },
  { code: "AM", baseMap: "Arizona Modern" },
  { code: "OG", baseMap: "Original Gothic" },
  { code: "TS", baseMap: "Tethys Station" },
  { code: "BB", baseMap: "Bogey's Bonanza" },
  { code: "QV", baseMap: "Quixote Valley" },
  { code: "GB", baseMap: "Gardens of Babylon" },
  { code: "SL", baseMap: "Shangri-La" },
  { code: "SW", baseMap: "Sweetopia" },
  { code: "ED", baseMap: "El Dorado" },
  { code: "LB", baseMap: "Labyrinth" },
  { code: "20", baseMap: "20,000 Leagues Under The Sea" },
  { code: "MY", baseMap: "Myst" },
  { code: "AT", baseMap: "Atlantis" },
  { code: "UT", baseMap: "Upside Town" },
  { code: "ZZ", baseMap: "Temple at Zerzura" },
  { code: "JC", baseMap: "Journey to the Center of the Earth" },
  { code: "LL", baseMap: "Laser Lair" },
  { code: "AL", baseMap: "Alfheim" },
  { code: "WW", baseMap: "Widow’s Walkabout" },
  { code: "MW", baseMap: "Meow Wolf" },
  { code: "AW", baseMap: "Around The World" },
  { code: "IL", baseMap: "Ice Lair" },
  { code: "VN", baseMap: "Venice" },
  { code: "WG", baseMap: "Wallace & Gromit" },
  { code: "MG", baseMap: "Mars Gardens" },
  { code: "8B", baseMap: "8-Bit Lair" },
  { code: "HH", baseMap: "Holiday Hideaway" },
  { code: "EL", baseMap: "Viva Las Elvis" },
  { code: "MO", baseMap: "Mount Olympus" },
  { code: "RC", baseMap: "Raptor Cliff's" },
  { code: "CL", baseMap: "Crystal Lair" },
  { code: "TO", baseMap: "Tokyo" },
  { code: "FF", baseMap: "Forgotten Fairyland" },
  { code: "WO", baseMap: "Alice's Adventures in Wonderland" },
  { code: "TC", baseMap: "Tiki à Coco" },
  { code: "HW", baseMap: "Hollywood" },
  { code: "BH", baseMap: "Blokhaven" },
  { code: "GL", baseMap: "Gloop Lair" },
]

// Phase 40's code-backed KWT projection. Values are sample diagnostics only;
// simulated ratings and slopes are intentionally not exposed as approved data.
const LOCAL_PROJECTION_EVIDENCE: Readonly<Record<string, ProjectionEvidence>> = {
  "20E": { sampleSize: 186, distinctPlayers: 105, eliteSampleSize: 23 }, "20H": { sampleSize: 186, distinctPlayers: 105, eliteSampleSize: 23 },
  "8BE": { sampleSize: 172, distinctPlayers: 100, eliteSampleSize: 21 }, "8BH": { sampleSize: 172, distinctPlayers: 100, eliteSampleSize: 21 },
  "ALE": { sampleSize: 235, distinctPlayers: 123, eliteSampleSize: 29 }, "ALH": { sampleSize: 235, distinctPlayers: 123, eliteSampleSize: 29 },
  "AME": { sampleSize: 187, distinctPlayers: 105, eliteSampleSize: 23 }, "AMH": { sampleSize: 187, distinctPlayers: 105, eliteSampleSize: 23 },
  "ATE": { sampleSize: 236, distinctPlayers: 117, eliteSampleSize: 29 }, "ATH": { sampleSize: 236, distinctPlayers: 117, eliteSampleSize: 29 },
  "AWE": { sampleSize: 184, distinctPlayers: 109, eliteSampleSize: 23 }, "AWH": { sampleSize: 184, distinctPlayers: 109, eliteSampleSize: 23 },
  "BBE": { sampleSize: 236, distinctPlayers: 118, eliteSampleSize: 29 }, "BBH": { sampleSize: 236, distinctPlayers: 118, eliteSampleSize: 29 },
  "CBE": { sampleSize: 235, distinctPlayers: 113, eliteSampleSize: 29 }, "CBH": { sampleSize: 235, distinctPlayers: 113, eliteSampleSize: 29 },
  "CLE": { sampleSize: 109, distinctPlayers: 73, eliteSampleSize: 14 }, "CLH": { sampleSize: 109, distinctPlayers: 73, eliteSampleSize: 14 },
  "EDE": { sampleSize: 246, distinctPlayers: 118, eliteSampleSize: 30 }, "EDH": { sampleSize: 246, distinctPlayers: 118, eliteSampleSize: 30 },
  "ELE": { sampleSize: 162, distinctPlayers: 90, eliteSampleSize: 20 }, "ELH": { sampleSize: 162, distinctPlayers: 90, eliteSampleSize: 20 },
  "FFE": { sampleSize: 66, distinctPlayers: 66, eliteSampleSize: 8 }, "FFH": { sampleSize: 66, distinctPlayers: 66, eliteSampleSize: 8 },
  "GBE": { sampleSize: 237, distinctPlayers: 116, eliteSampleSize: 29 }, "GBH": { sampleSize: 237, distinctPlayers: 116, eliteSampleSize: 29 },
  "HHE": { sampleSize: 162, distinctPlayers: 93, eliteSampleSize: 20 }, "HHH": { sampleSize: 162, distinctPlayers: 93, eliteSampleSize: 20 },
  "HWE": { sampleSize: 50, distinctPlayers: 50, eliteSampleSize: 6 }, "HWH": { sampleSize: 50, distinctPlayers: 50, eliteSampleSize: 6 },
  "ILE": { sampleSize: 252, distinctPlayers: 111, eliteSampleSize: 31 }, "ILH": { sampleSize: 252, distinctPlayers: 111, eliteSampleSize: 31 },
  "JCE": { sampleSize: 214, distinctPlayers: 111, eliteSampleSize: 26 }, "JCH": { sampleSize: 214, distinctPlayers: 111, eliteSampleSize: 26 },
  "LBE": { sampleSize: 283, distinctPlayers: 119, eliteSampleSize: 34 }, "LBH": { sampleSize: 283, distinctPlayers: 119, eliteSampleSize: 34 },
  "LLE": { sampleSize: 256, distinctPlayers: 120, eliteSampleSize: 31 }, "LLH": { sampleSize: 256, distinctPlayers: 120, eliteSampleSize: 31 },
  "MGE": { sampleSize: 168, distinctPlayers: 102, eliteSampleSize: 21 }, "MGH": { sampleSize: 168, distinctPlayers: 102, eliteSampleSize: 21 },
  "MOE": { sampleSize: 121, distinctPlayers: 82, eliteSampleSize: 15 }, "MOH": { sampleSize: 121, distinctPlayers: 82, eliteSampleSize: 15 },
  "MWE": { sampleSize: 161, distinctPlayers: 92, eliteSampleSize: 20 }, "MWH": { sampleSize: 161, distinctPlayers: 92, eliteSampleSize: 20 },
  "MYE": { sampleSize: 247, distinctPlayers: 112, eliteSampleSize: 30 }, "MYH": { sampleSize: 247, distinctPlayers: 112, eliteSampleSize: 30 },
  "OGE": { sampleSize: 190, distinctPlayers: 115, eliteSampleSize: 23 }, "OGH": { sampleSize: 190, distinctPlayers: 115, eliteSampleSize: 23 },
  "QVE": { sampleSize: 222, distinctPlayers: 113, eliteSampleSize: 27 }, "QVH": { sampleSize: 222, distinctPlayers: 113, eliteSampleSize: 27 },
  "RCE": { sampleSize: 163, distinctPlayers: 84, eliteSampleSize: 20 }, "RCH": { sampleSize: 163, distinctPlayers: 84, eliteSampleSize: 20 },
  "SLE": { sampleSize: 129, distinctPlayers: 94, eliteSampleSize: 16 }, "SLH": { sampleSize: 129, distinctPlayers: 94, eliteSampleSize: 16 },
  "SSE": { sampleSize: 242, distinctPlayers: 122, eliteSampleSize: 30 }, "SSH": { sampleSize: 242, distinctPlayers: 122, eliteSampleSize: 30 },
  "SWE": { sampleSize: 188, distinctPlayers: 105, eliteSampleSize: 23 }, "SWH": { sampleSize: 188, distinctPlayers: 105, eliteSampleSize: 23 },
  "TCE": { sampleSize: 54, distinctPlayers: 54, eliteSampleSize: 7 }, "TCH": { sampleSize: 54, distinctPlayers: 54, eliteSampleSize: 7 },
  "TOE": { sampleSize: 113, distinctPlayers: 77, eliteSampleSize: 14 }, "TOH": { sampleSize: 113, distinctPlayers: 77, eliteSampleSize: 14 },
  "TSE": { sampleSize: 174, distinctPlayers: 98, eliteSampleSize: 21 }, "TSH": { sampleSize: 174, distinctPlayers: 98, eliteSampleSize: 21 },
  "TTE": { sampleSize: 241, distinctPlayers: 116, eliteSampleSize: 29 }, "TTH": { sampleSize: 241, distinctPlayers: 116, eliteSampleSize: 29 },
  "UTE": { sampleSize: 155, distinctPlayers: 84, eliteSampleSize: 19 }, "UTH": { sampleSize: 155, distinctPlayers: 84, eliteSampleSize: 19 },
  "VNE": { sampleSize: 226, distinctPlayers: 106, eliteSampleSize: 28 }, "VNH": { sampleSize: 226, distinctPlayers: 106, eliteSampleSize: 28 },
  "WGE": { sampleSize: 228, distinctPlayers: 105, eliteSampleSize: 28 }, "WGH": { sampleSize: 228, distinctPlayers: 105, eliteSampleSize: 28 },
  "WOE": { sampleSize: 53, distinctPlayers: 53, eliteSampleSize: 7 }, "WOH": { sampleSize: 53, distinctPlayers: 53, eliteSampleSize: 7 },
  "WWE": { sampleSize: 169, distinctPlayers: 94, eliteSampleSize: 21 }, "WWH": { sampleSize: 169, distinctPlayers: 94, eliteSampleSize: 21 },
  "ZZE": { sampleSize: 225, distinctPlayers: 109, eliteSampleSize: 27 }, "ZZH": { sampleSize: 225, distinctPlayers: 109, eliteSampleSize: 27 },
}

// Phase 51 read-only evidence reconciliation. These are complete, resolved,
// non-voided All-Time observation cards, but they do not meet the Phase 38
// provisional gate of 20 rounds and 20 distinct canonical players.
const NEW_VERIFIED_EVIDENCE: Readonly<Record<string, ProjectionEvidence>> = {
  BHE: { sampleSize: 2, distinctPlayers: 2, eliteSampleSize: 0 },
  BHH: { sampleSize: 3, distinctPlayers: 3, eliteSampleSize: 0 },
  GLE: { sampleSize: 7, distinctPlayers: 7, eliteSampleSize: 0 },
  GLH: { sampleSize: 3, distinctPlayers: 3, eliteSampleSize: 0 },
}

export const HANDICAP_ADMIN_COURSE_COVERAGE: readonly HandicapAdminCourseCoverage[] = Object.freeze(
  OFFICIAL_HANDICAP_COURSE_BASES.flatMap((course) => (["easy", "hard"] as const).map((difficulty) => {
    const code = `${course.code}${difficulty === "easy" ? "E" : "H"}`
    const evidence = LOCAL_PROJECTION_EVIDENCE[code]
    const newerEvidence = NEW_VERIFIED_EVIDENCE[code]
    return Object.freeze({
      code,
      baseMap: course.baseMap,
      difficulty,
      sampleSize: evidence?.sampleSize ?? newerEvidence?.sampleSize ?? 0,
      distinctPlayers: evidence?.distinctPlayers ?? newerEvidence?.distinctPlayers ?? 0,
      eliteSampleSize: evidence?.eliteSampleSize ?? newerEvidence?.eliteSampleSize ?? 0,
      evidenceStatus: evidence ? "LOCAL_PROJECTION" : newerEvidence ? "NEW_VERIFIED_EVIDENCE" : "NO_VERIFIED_EVIDENCE",
      ratingStatus: evidence ? "PROVISIONAL_REVIEW" : "UNRATED",
      confidence: evidence ? "PROVISIONAL_REVIEW" : newerEvidence ? "INSUFFICIENT_SAMPLE" : "NO_EVIDENCE",
    })
  })),
)

export const HANDICAP_REVIEW_DATA_STATUS = Object.freeze({
  productionSnapshotTables: "NOT_INSTALLED",
  productionReviewLedger: "NOT_INSTALLED",
  localProjectionSource: "docs/handicap/phase40-course-coverage.md",
  localProjectionIsApproved: false,
  newVerifiedEvidenceCodes: Object.freeze(["BHE", "BHH", "GLE", "GLH"]),
  unratedCodes: Object.freeze(["BHE", "BHH", "GLE", "GLH"]),
})
