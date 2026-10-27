import fs from "node:fs"
import path from "node:path"

type Difficulty = "EASY" | "HARD"
type Evidence = {
  source: string
  event_id: string
  season_week: string
  division: string
  player_exact: string
  source_player_id: string
  course_code: string
  canonical_course: string
  difficulty: Difficulty
  score: number
  completed_round: string
  source_screenshot: string
  source_row: number
  verification_status: string
  exception_reason: string
  personal_handicap_eligible: string
}

const root = process.cwd()
const input = path.join(root, "weekly_course_evidence.csv")
const imageRoot = "phase52-input/weekly_screenshots"
const rchEvent = "S19W10_LBE_RCH"
const rchImage = (file: string) => `${imageRoot}/${rchEvent}/${file}`

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === "," && !quoted) {
      cells.push(cell)
      cell = ""
    } else cell += char
  }
  cells.push(cell)
  return cells
}

function csv(value: unknown): string {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function readExisting(): Evidence[] {
  const lines = fs.readFileSync(input, "utf8").trim().split(/\r?\n/)
  const header = lines.shift()!.split(",")
  return lines.filter(Boolean).map((line) => {
    const cells = parseCsvLine(line)
    const row = Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""])) as Record<string, string>
    return {
      source: row.source,
      event_id: row.event_id,
      season_week: row.season_week,
      division: row.division,
      player_exact: row.player_exact,
      source_player_id: row.source_player_id,
      course_code: row.course_code,
      canonical_course: row.canonical_course,
      difficulty: row.difficulty as Difficulty,
      score: Number(row.score),
      completed_round: row.completed_round,
      source_screenshot: row.source_screenshot,
      source_row: Number(row.source_row),
      verification_status: row.verification_status,
      exception_reason: row.exception_reason,
      personal_handicap_eligible: row.personal_handicap_eligible,
    }
  })
}

type Pair = [string, number, number]

// Only rows visually verified against the original S19W10 screenshots are admitted.
// The source-row number is the displayed row position within its division block.
const amateur: Pair[] = [
  ["Fake4Real", -19, -6], ["BigSlimJ", -19, -5], ["Necrolitic", -21, 0], ["joshbenesh", -20, 0],
  ["NuttyGrandpa", -14, -6], ["ZoeDarlin", -13, -4], ["SlugJug33", -14, -2], ["AKFlyerFan", -14, 0],
  ["indianchief", -15, 1], ["kinghenryclub", -18, 4], ["Old-T", -13, -1], ["Bubbaframe", -11, -2],
  ["StoneyMan69", -8, -2], ["KnockoutG", -12, 5], ["strawbag", -7, 1],
]
const semiPro: Pair[] = [
  ["Kyda", -18, -15], ["TrickyDicky", -22, -11], ["steven_T", -19, -12], ["Neo Impossible", -19, -11],
  ["Chipnputt", -24, -5], ["The Mortski", -20, -8], ["Mully", -23, -2], ["The Real JB", -18, -7],
  ["Browner", -19, -4], ["Emil", -20, -3], ["Firefly", -15, -8], ["autodidactic", -14, -7],
  ["DISClingerADK", -18, -2], ["LB1", -15, -3], ["breezy", -11, -5], ["deebee", -13, 0],
  ["call_me_snow", -15, 5], ["hhaus", -17, 7],
]
const pro: Pair[] = [
  ["Oculus_Prime", -23, -14], ["Jay", -20, -14], ["Traynor", -23, -11], ["HeartBreakKid", -24, -9],
  ["Trikster32", -23, -10], ["Freitag", -21, -9], ["Jesunet", -18, -12], ["The_WB", -22, -8],
  ["JC", -17, -12], ["Larry", -23, -6], ["lefty", -20, -9], ["omielgato", -20, -7],
  ["Mau", -20, -4], ["pluff", -21, -2], ["Princess_Bankshot", -18, -5], ["Gus", -19, -3],
  ["NERD_GP", -19, -3], ["Karma Changer", -17, -4], ["LaurentE", -19, -1], ["AmberWave", -15, 1],
]
const elite: Pair[] = [
  ["Zanetti", -26, -18], ["Matt916", -27, -15], ["mini_G", -21, -20], ["INDY", -23, -17],
  ["Derby_Daz", -23, -16], ["Duardy", -25, -14], ["Fugohallarin", -24, -14], ["his.Dudeness", -24, -13],
  ["IceCreamTaco", -20, -16], ["leanin2it", -19, -17], ["OpusMcGraw", -24, -11], ["Dude_Lebowski", -19, -15],
  ["El Jorge", -23, -10], ["Gobson", -20, -13], ["bigja33", -22, -10], ["gomarino13", -23, -9],
  ["Puttnafed", -24, -7], ["gOnz0nater", -17, -13], ["moba", -25, -5], ["FelixTortilla", -24, -5],
  ["Goldenbrett", -16, -13], ["Harry Highpants", -20, -9], ["UroPa", -23, -6], ["Sticky", -23, -3],
  ["wayne1538", -12, -11], ["NATE", -20, 2],
]

// Phase 54: rows read directly from the remaining S21W05 screenshots. Rows whose
// screen name was not exact enough to preserve are intentionally omitted and
// remain in the exception ledger rather than being guessed.
const s21Amateur: Pair[] = [
  ["Dickfor247", -21, -11], ["SlugJug33", -20, -9], ["Tee_Wrecks", -21, -8], ["nakleh", -20, -7],
  ["strawbag", -20, -7], ["Tonix", -20, -6], ["Dealerodd", -25, 0], ["par5tx", -22, -3],
  ["ZoeDarlin", -18, -7], ["joshbenesh", -19, -5], ["Lynbot5000", -20, -3], ["KnockoutG", -12, -10],
  ["par5MS0210", -16, -3], ["Eyerie", -12, -6], ["Callthemedic", -17, 0], ["Mrroth", -12, -5],
  ["StoneyMan69", -17, 1], ["Fake4Real", -13, -2], ["NuttyGrandpa", -15, 0], ["AKFlyerFan", -8, -2],
  ["Fabita53", -10, 0], ["thatgirl18", -15, 8],
]
const s21SemiPro: Pair[] = [
  ["call_me_snow", -25, -12], ["Catweazel", -23, -14], ["Calassy", -24, -12], ["The Real JB", -21, -12],
  ["hhaus", -19, -12], ["TrickyDicky", -24, -7], ["EL.MEXICANO", -21, -9], ["steven_T", -18, -12],
  ["Mully", -22, -6], ["Tornado", -18, -9], ["clarksoft", -18, -8], ["Maxxom-fr", -18, -8],
  ["deebee", -18, -7], ["The Mortski", -17, -6], ["PorkPie Doofus", -24, 3], ["2000MPH", -14, -3],
  ["Chipnputt", -11, -6], ["D3bb13", -14, 0], ["Neo Impossible", -8, -6], ["Emil", -7, -4],
]
const s21Pro: Pair[] = [
  ["biz", -24, -14], ["Mau", -23, -15], ["NERD_GP", -29, -9], ["Will_Xo", -25, -13],
  ["Jesunet", -28, -9], ["Karma Changer", -23, -13], ["The_WB", -23, -13], ["akaMikeD", -21, -14],
  ["Freitag", -23, -12], ["Jay", -23, -12], ["Trikster32", -24, -11], ["pluff", -26, -8],
  ["Gatorsfan89", -25, -8], ["Gus", -19, -13], ["quickfam4", -17, -15], ["DontQuitWhenLosing", -15, -16],
  ["Larry", -24, -7], ["Princess_Bankshot", -19, -12], ["LaurentE", -16, -12], ["omielgato", -16, -11],
]
const s21Elite: Pair[] = [
  ["moba", -29, -18], ["upстаниа_c", -28, -18], ["5.0jim", -31, -14], ["Fugohallarin", -26, -19],
  ["Zanetti", -27, -18], ["El Jorge", -29, -14], ["Harry Highpants", -25, -18], ["ZONK", -28, -15],
  ["Puttnafed", -27, -15], ["Colbatic", -28, -13], ["Duardy", -22, -19], ["FelixTortilla", -29, -12],
  ["his.Dudeness", -23, -18], ["IceCreamTaco", -23, -18], ["bigja33", -25, -14], ["INDY", -24, -14],
  ["leanin2it", -23, -14], ["Marc", -23, -13], ["Sticky", -23, -13], ["Derby_Daz", -18, -16],
  ["wayne1538", -23, -11], ["Goldenbrett", -24, -9], ["gomarino13", -22, -11], ["gOnz0nater", -19, -13],
  ["OpusMcGraw", -21, -11], ["TIGERHOODS", -19, -12], ["NATE", -19, -10], ["UroPa", -22, -6],
  ["Dude_Lebowski", -17, -9], ["Gobson", -20, 0],
]

const s21Event = "S21W05_GLE_HWH"
const s21Image = (file: string) => `${imageRoot}/${s21Event}/${file}`
const s20w05Event = "S20W05_MGE_ZZH"
const s20w05Image = (file: string) => `${imageRoot}/${s20w05Event}/${file}`
const s20w05Amateur: Pair[] = [
  ["OysterJelly", -19, -11], ["StoneyMan69", -18, -12], ["SlugJug33", -20, -8], ["BadWolf", -18, -7],
  ["Fake4Real", -17, -8], ["strawbag", -16, -6], ["##ultramontani##", -13, -7], ["puttz", -14, -6],
  ["Lynbot5000", -15, -3], ["ZoeDarlin", -14, -4], ["Fabita53", -14, -2], ["hmc21", -13, -3],
  ["indianchief", -14, -2], ["Bridgger", -16, 1], ["Eyerie", -10, -3], ["AKFlyerFan", -10, 11], ["MidMillenial", -5, 14],
]
const s20w05SemiPro: Pair[] = [
  ["breezy", -19, -17], ["D3bb13", -19, -15], ["Maxxom-fr", -21, -13], ["Firefly", -18, -12], ["Rare cup", -18, -12],
  ["steven_T", -20, -10], ["Kyda", -17, -11], ["The Real JB", -19, -9], ["autodidactic", -17, -10], ["Fakku_FR", -14, -12],
  ["LB1", -21, -4], ["deebee", -16, -8], ["TrickyDicky", -15, -7], ["Mully", -18, -2], ["The Mortski", -11, -5], ["Emil", -7, -8],
]
const s20w05Pro: Pair[] = [
  ["quickfam4", -21, -17], ["lefty", -22, -14], ["omielgato", -24, -12], ["Gus", -18, -17], ["LaurentE", -18, -17],
  ["Larry", -19, -15], ["Will_Xo", -17, -15], ["HeartBreakKid", -18, -13], ["Jay", -18, -13], ["NERD_GP", -16, -15],
  ["Karma Changer", -21, -9], ["pluff", -23, -7], ["DontQuitWhenLosing", -21, -8], ["Mau", -24, -5], ["Princess_Bankshot", -18, -11],
  ["Trikster32", -17, -12], ["akaMikeD", -19, -9], ["Gatorsfan89", -20, -7], ["Jesunet", -22, -5], ["Pootato", -21, -5],
  ["AmberWave", -19, -6], ["CHI CHI RODRIGUEZ", -12, -10], ["Freitag", -19, -3], ["JC", -16, 11],
]
const s20w05Elite: Pair[] = [
  ["Duardy", -24, -19], ["mini_G", -24, -18], ["Zanetti", -26, -16], ["Gobson", -22, -19], ["INDY", -24, -17],
  ["leanin2it", -21, -18], ["Puttnafed", -22, -17], ["wayne1538", -21, -17], ["upстаниа_c", -18, -19], ["Dude_Lebowski", -21, -15],
  ["IceCreamTaco", -20, -16], ["OpusMcGraw", -22, -14], ["his.Dudeness", -21, -14], ["Derby_Daz", -18, -16], ["Sticky", -20, -14],
  ["TIGERHOODS", -18, -15], ["FelixTortilla", -21, -11], ["Harry Highpants", -18, -14], ["5.0jim", -22, -9], ["Blues87", -20, -11],
  ["gomarino13", -19, -12], ["Goldenbrett", -20, -10], ["bigja33", -18, -11], ["Fugohallarin", -22, -6], ["moba", -17, -11],
  ["ZONK", -14, -12], ["NATE", -19, -6], ["UroPa", -14, -8], ["El Jorge", -11, -8],
]
const s20w06Event = "S20W06_BHE_QVH"
const s20w06Image = (file: string) => `${imageRoot}/${s20w06Event}/${file}`
const s20w06Amateur: Pair[] = [
  ["ZoeDarlin", -17, -16], ["KnockoutG", -16, -14], ["SD_Diver", -17, -13], ["StoneyMan69", -16, -12],
  ["NuttyGrandpa", -14, -12], ["Alabamer_Hammer", -12, -13], ["##ultramontani##", -14, -10], ["Necrolitic", -10, -12],
  ["indianchief", -13, -7], ["joshbenesh", -8, -12], ["BadWolf", -15, -4], ["Eyerie", -15, -4],
  ["AKFlyerFan", -15, -3], ["strawbag", -14, -3], ["Fabita53", -9, -5], ["Fake4Real", -12, 2],
  ["SlugJug33", -12, 2], ["MidMillenial", -5, 0], ["Bridgger", -4, 1], ["hmc21", -8, 7],
]
const s20w06SemiPro: Pair[] = [
  ["The Real JB", -18, -14], ["breezy", -18, -12], ["Maxxom-fr", -18, -12], ["PaulV-PPP CA", -11, -17],
  ["Firefly", -18, -9], ["steven_T", -18, -9], ["Neo Impossible", -16, -9], ["Chipnputt", -13, -11],
  ["Duckk", -19, -5], ["autodidactic", -13, -11], ["deebee", -12, -11], ["The Mortski", -14, -9],
  ["Emil", -12, -7], ["LB1", -15, -4],
]
const s20w06Pro: Pair[] = [
  ["akaMikeD", -16, -21], ["DontQuitWhenLosing", -19, -17], ["Gus", -20, -16], ["quickfam4", -17, -19],
  ["Trikster32", -17, -18], ["NERD_GP", -19, -15], ["Larry", -19, -14], ["Mau", -19, -14],
  ["CHI CHI RODRIGUEZ", -18, -14], ["HeartBreakKid", -20, -12], ["omielgato", -21, -11], ["pluff", -17, -15],
  ["Gatorsfan89", -22, -9], ["Jesunet", -16, -15], ["Metum", -19, -12], ["JC", -18, -12],
  ["Pootato", -16, -14], ["Princess_Bankshot", -19, -11], ["Karma Changer", -12, -14], ["LaurentE", -13, -13],
  ["Will_Xo", -17, -9], ["Jay", -15, -6], ["Freitag", -8, -11], ["lefty", -12, 12],
]
const s20w06Elite: Pair[] = [
  ["Harry Highpants", -23, -18], ["Matt916", -21, -20], ["OpusMcGraw", -21, -19], ["mini_G", -24, -15],
  ["bigja33", -21, -17], ["INDY", -20, -18], ["Zanetti", -21, -17], ["FelixTortilla", -23, -14],
  ["Fugohallarin", -20, -17], ["his.Dudeness", -20, -17], ["IceCreamTaco", -21, -16], ["Duardy", -18, -18],
  ["leanin2it", -22, -14], ["moba", -18, -18], ["gomarino13", -19, -16], ["Sticky", -19, -16],
  ["El Jorge", -15, -19], ["ZONK", -20, -14], ["Gobson", -18, -15], ["TIGERHOODS", -20, -13],
  ["wayne1538", -15, -17], ["upстаниа_c", -17, -15], ["Puttnafed", -17, -15], ["Goldenbrett", -18, -11],
  ["NATE", -18, -11], ["Dude_Lebowski", -13, -15], ["UroPa", -14, -8],
]
const s20w07Event = "S20W07_ALE_BHH"
const s20w07Image = (file: string) => `${imageRoot}/${s20w07Event}/${file}`
const s20w07Amateur: Pair[] = [
  ["##ultramontani##", -18, -16], ["Fake4Real", -18, -16], ["BadWolff", -17, -16], ["SD_Diver", -16, -7],
  ["KCRob", -16, -6], ["adaman_can", -16, -5], ["joshbenesh", -16, -5], ["KnockoutG", -17, -4],
  ["AKFlyerFan", -16, -3], ["Fabita53", -11, -8], ["strawbag", -14, -5], ["SlugJug33", -11, -6],
  ["Eyerie", -14, -2], ["StoneyMan69", -18, 3], ["ZoeDarlin", -10, -4], ["hmc21", -7, 3],
]
const s20w07SemiPro: Pair[] = [
  ["Browner", -20, -18], ["steven_T", -19, -18], ["Calassy", -22, -13], ["Duckk", -17, -18],
  ["Firefly", -17, -16], ["The Mortski", -19, -14], ["Neo Impossible", -16, -16], ["Maxxom-fr", -19, -12],
  ["breezy", -17, -13], ["TrickyDicky", -16, -14], ["autodidactic", -18, -12], ["LB1", -16, -11],
  ["Emil", -15, -11], ["PaulV-PPP CA", -15, -9], ["deebee", -14, -9], ["D3bb13", -7, -6],
]
const s20w07Pro: Pair[] = [
  ["Jay", -20, -20], ["Karma Changer", -23, -17], ["Gus", -20, -19], ["HeartBreakKid", -22, -17],
  ["pluff", -20, -19], ["Jesunet", -19, -15], ["CHI CHI RODRIGUEZ", -18, -15], ["akaMikeD", -20, -11],
  ["Gatorsfan89", -18, -13], ["Princess_Bankshot", -17, -14], ["Trikster32", -18, -13], ["Larry", -16, -13],
  ["DontQuitWhenLosing", -19, -9], ["Metum", -16, -12], ["LaurentE", -13, -13], ["omielgato", -18, -7],
  ["Freitag", -17, -7], ["Mau", -12, -10], ["Pootato", -18, -4], ["JC", -13, -7],
]
const s20w07Elite: Pair[] = [
  ["his.Dudeness", -21, -23], ["bigja33", -21, -20], ["Puttnafed", -18, -22], ["Colbatic", -20, -19],
  ["Dude_Lebowski", -23, -16], ["Zanetti", -20, -19], ["Goldenbrett", -18, -20], ["gomarino13", -20, -18],
  ["leanin2it", -19, -19], ["Duardy", -22, -15], ["El Jorge", -20, -17], ["INDY", -20, -17],
  ["wayne1538", -21, -16], ["upстаниа_c", -19, -18], ["Derby_Daz", -21, -15], ["Gobson", -20, -16],
  ["Fugohallarin", -18, -17], ["Matt916", -21, -14], ["mini_G", -19, -16], ["OpusMcGraw", -21, -13],
  ["TIGERHOODS", -17, -17], ["FelixTortilla", -18, -15], ["IceCreamTaco", -19, -13], ["ZONK", -19, -13],
  ["Sticky", -17, -14], ["Harry Highpants", -18, -12], ["UroPa", -16, -12], ["NATE", -16, -8],
]

function addPairs(target: Evidence[], division: string, pairs: Pair[], file: string): void {
  pairs.forEach(([player, lbe, rch], index) => {
    const sourceRow = index + 1
    target.push({
      source: "THE_WEEKLY", event_id: rchEvent, season_week: "S19W10", division,
      player_exact: player, source_player_id: "", course_code: "LBE", canonical_course: "Labyrinth Easy",
      difficulty: "EASY", score: lbe, completed_round: "true", source_screenshot: rchImage(file), source_row: sourceRow,
      verification_status: "VERIFIED", exception_reason: "", personal_handicap_eligible: "false",
    })
    target.push({
      source: "THE_WEEKLY", event_id: rchEvent, season_week: "S19W10", division,
      player_exact: player, source_player_id: "", course_code: "RCH", canonical_course: "Raptor Cliff's Hard",
      difficulty: "HARD", score: rch, completed_round: "true", source_screenshot: rchImage(file), source_row: sourceRow,
      verification_status: "VERIFIED", exception_reason: "", personal_handicap_eligible: "false",
    })
  })
}

// Re-running this generator must not duplicate the Phase 53 event.
const evidence = readExisting().filter((row) => row.event_id !== rchEvent && row.event_id !== s21Event && row.event_id !== s20w05Event && row.event_id !== s20w06Event && row.event_id !== s20w07Event)
addPairs(evidence, "AMATEUR", amateur, "image(20261019-174330).png")
addPairs(evidence, "SEMI-PRO", semiPro, "image(20261019-174341).png")
addPairs(evidence, "PRO", pro, "image(20261019-174350).png")
addPairs(evidence, "ELITE", elite, "image(20261019-174359).png")
function addEventPairs(target: Evidence[], eventId: string, seasonWeek: string, image: (file: string) => string, division: string, pairs: Pair[], file: string, easyCode: string, easyCourse: string, hardCode: string, hardCourse: string, sourceRows?: number[]): void {
  pairs.forEach(([player, easy, hard], index) => {
    const sourceRow = sourceRows?.[index] ?? index + 1
    target.push({ source: "THE_WEEKLY", event_id: eventId, season_week: seasonWeek, division,
      player_exact: player, source_player_id: "", course_code: easyCode, canonical_course: easyCourse,
      difficulty: "EASY", score: easy, completed_round: "true", source_screenshot: image(file), source_row: sourceRow,
      verification_status: "VERIFIED", exception_reason: "", personal_handicap_eligible: "false" })
    target.push({ source: "THE_WEEKLY", event_id: eventId, season_week: seasonWeek, division,
      player_exact: player, source_player_id: "", course_code: hardCode, canonical_course: hardCourse,
      difficulty: "HARD", score: hard, completed_round: "true", source_screenshot: image(file), source_row: sourceRow,
      verification_status: "VERIFIED", exception_reason: "", personal_handicap_eligible: "false" })
  })
}
addEventPairs(evidence, s21Event, "S21W05", s21Image, "AMATEUR", s21Amateur, "image(20261019-155200).png", "GLE", "Gloop Lair Easy", "HWH", "Hollywood Hard")
addEventPairs(evidence, s21Event, "S21W05", s21Image, "SEMI-PRO", s21SemiPro, "image(20261019-155411).png", "GLE", "Gloop Lair Easy", "HWH", "Hollywood Hard", [1, 1, 3, 4, 6, 6, 8, 11, 12, 13, 13, 15, 16, 18, 19, 19, 21, 21, 23, 23])
addEventPairs(evidence, s21Event, "S21W05", s21Image, "PRO", s21Pro, "image(20261019-155450).png", "GLE", "Gloop Lair Easy", "HWH", "Hollywood Hard", Array.from({ length: 20 }, (_, index) => index + 1))
addEventPairs(evidence, s21Event, "S21W05", s21Image, "ELITE", s21Elite, "image(20261019-155508).png", "GLE", "Gloop Lair Easy", "HWH", "Hollywood Hard")
addEventPairs(evidence, s20w05Event, "S20W05", s20w05Image, "AMATEUR", s20w05Amateur, "image(20261019-171235).png", "MGE", "Mars Gardens Easy", "ZZH", "Temple at Zerzura Hard")
addEventPairs(evidence, s20w05Event, "S20W05", s20w05Image, "SEMI-PRO", s20w05SemiPro, "image(20261019-171243).png", "MGE", "Mars Gardens Easy", "ZZH", "Temple at Zerzura Hard", [...Array.from({ length: 14 }, (_, index) => index + 1), 16, 17])
addEventPairs(evidence, s20w05Event, "S20W05", s20w05Image, "PRO", s20w05Pro, "image(20261019-171301).png", "MGE", "Mars Gardens Easy", "ZZH", "Temple at Zerzura Hard", [1, 2, 3, 4, 5, 6, 7, ...Array.from({ length: 17 }, (_, index) => index + 9)])
addEventPairs(evidence, s20w05Event, "S20W05", s20w05Image, "ELITE", s20w05Elite, "image(20261019-171317).png", "MGE", "Mars Gardens Easy", "ZZH", "Temple at Zerzura Hard", [...Array.from({ length: 28 }, (_, index) => index + 1), 30])
addEventPairs(evidence, s20w06Event, "S20W06", s20w06Image, "AMATEUR", s20w06Amateur, "image(20261019-161525).png", "BHE", "Blokhaven Easy", "QVH", "Quixote Valley Hard")
addEventPairs(evidence, s20w06Event, "S20W06", s20w06Image, "SEMI-PRO", s20w06SemiPro, "image(20261019-161601).png", "BHE", "Blokhaven Easy", "QVH", "Quixote Valley Hard", [1, 2, 2, 4, 5, 5, 7, 8, 8, 8, 11, 11, 14, 14])
addEventPairs(evidence, s20w06Event, "S20W06", s20w06Image, "PRO", s20w06Pro, "image(20261019-161616).png", "BHE", "Blokhaven Easy", "QVH", "Quixote Valley Hard", [1, 2, 2, 2, 5, 7, 8, 8, 10, 10, 10, 10, 14, 14, 14, 17, 17, 17, 20, 20, 20, 23, 24, 25])
addEventPairs(evidence, s20w06Event, "S20W06", s20w06Image, "ELITE", s20w06Elite, "image(20261019-162207).png", "BHE", "Blokhaven Easy", "QVH", "Quixote Valley Hard", [...Array.from({ length: 23 }, (_, index) => index + 1), 25, 26, 27, 28])
addEventPairs(evidence, s20w07Event, "S20W07", s20w07Image, "AMATEUR", s20w07Amateur, "image(20261019-160240).png", "ALE", "Alfheim Easy", "BHH", "Blokhaven Hard")
addEventPairs(evidence, s20w07Event, "S20W07", s20w07Image, "SEMI-PRO", s20w07SemiPro, "image(20261019-160722).png", "ALE", "Alfheim Easy", "BHH", "Blokhaven Hard", [1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 12, 14, 15, 16, 17])
addEventPairs(evidence, s20w07Event, "S20W07", s20w07Image, "PRO", s20w07Pro, "image(20261019-160734).png", "ALE", "Alfheim Easy", "BHH", "Blokhaven Hard", [1, 2, 3, 3, 3, 6, 7, 9, 9, 9, 13, 14, 14, 16, 17, 18, 19, 20, 21, 21])
addEventPairs(evidence, s20w07Event, "S20W07", s20w07Image, "ELITE", s20w07Elite, "image(20261019-161424).png", "ALE", "Alfheim Easy", "BHH", "Blokhaven Hard", [...Array.from({ length: 2 }, (_, index) => index + 1), ...Array.from({ length: 26 }, (_, index) => index + 4)])

const evidenceHeader = ["source", "event_id", "season_week", "division", "player_exact", "source_player_id", "course_code", "canonical_course", "difficulty", "score", "completed_round", "source_screenshot", "source_row", "verification_status", "exception_reason", "personal_handicap_eligible"]
fs.writeFileSync(path.join(root, "weekly_course_evidence.csv"), [evidenceHeader.join(","), ...evidence.map((row) => [
  row.source, row.event_id, row.season_week, row.division, row.player_exact, row.source_player_id, row.course_code, row.canonical_course,
  row.difficulty, row.score, row.completed_round, row.source_screenshot, row.source_row, row.verification_status, row.exception_reason,
  row.personal_handicap_eligible,
].map(csv).join(","))].join("\n") + "\n")

const manifestLines = fs.readFileSync(path.join(root, "phase52-input", "weekly_manifest.csv"), "utf8").trim().split(/\r?\n/)
const manifestHeader = parseCsvLine(manifestLines.shift()!)
const classifications: Record<string, { status: string; verifiedRows: number; reason: string }> = {
  S21W05_GLE_HWH: { status: "PARTIALLY_PROCESSED", verifiedRows: (s21Amateur.length + s21SemiPro.length + s21Pro.length + s21Elite.length) * 2, reason: "S21W05 rows visually transcribed; four source-name rows remain quarantined because the supplied screenshots do not preserve an exact screen name" },
  S20W07_ALE_BHH: { status: "PARTIALLY_PROCESSED", verifiedRows: (s20w07Amateur.length + s20w07SemiPro.length + s20w07Pro.length + s20w07Elite.length) * 2, reason: "Replacement Elite screenshot and remaining division rows visually transcribed; three visible screen-name rows remain quarantined" },
  S20W06_BHE_QVH: { status: "PARTIALLY_PROCESSED", verifiedRows: (s20w06Amateur.length + s20w06SemiPro.length + s20w06Pro.length + s20w06Elite.length) * 2, reason: "S20W06 rows visually transcribed; three visible screen-name rows remain quarantined because the supplied screenshots do not preserve exact names" },
  S20W05_MGE_ZZH: { status: "PARTIALLY_PROCESSED", verifiedRows: (s20w05Amateur.length + s20w05SemiPro.length + s20w05Pro.length + s20w05Elite.length) * 2, reason: "S20W05 rows visually transcribed; two visible screen names remain quarantined because the supplied screenshots do not preserve an exact name" },
  S20W04_RCE_CLH_UNCONFIRMED_WEEK: { status: "PARTIALLY_PROCESSED", verifiedRows: 0, reason: "Image header confirms S20W04/RCE/CLH; remaining rows require exact transcription" },
  S20W03_20E_MWH: { status: "PARTIALLY_PROCESSED", verifiedRows: 0, reason: "Screenshots accessible; no rows admitted without complete row-level visual verification" },
  S20W02_SWE_FFH: { status: "PARTIALLY_PROCESSED", verifiedRows: 0, reason: "Screenshots accessible; no rows admitted without complete row-level visual verification" },
  S20W01_AWE_HWH: { status: "PARTIALLY_PROCESSED", verifiedRows: 0, reason: "Screenshots accessible; no rows admitted without complete row-level visual verification" },
  S19W12_HWE_UTH: { status: "PARTIALLY_PROCESSED", verifiedRows: 0, reason: "Screenshots accessible; no rows admitted without complete row-level visual verification" },
  S19W11_WGE_BBH: { status: "PARTIALLY_PROCESSED", verifiedRows: 0, reason: "Screenshots accessible; no rows admitted without complete row-level visual verification" },
  S19W10_LBE_RCH: { status: "PARTIALLY_PROCESSED", verifiedRows: 158, reason: "79 visually verified players admitted; 3 visible player rows are quarantined: one ambiguous, one unreadable, and one truncated" },
  S18W09_WWE_FFH: { status: "PARTIALLY_PROCESSED", verifiedRows: 0, reason: "Screenshots accessible; no rows admitted without complete row-level visual verification" },
  S18W08_FFE_SECOND_CODE_UNVERIFIED: { status: "QUARANTINED", verifiedRows: 0, reason: "Second course code is visibly MOH but is not approved by the package manifest; no course rows admitted" },
}

const manifestStatusHeader = ["event_id", "block_order", "source_path", "sha256", "classification", "verified_course_rows", "reason"]
const manifestStatusRows: string[][] = [manifestStatusHeader]
for (const line of manifestLines) {
  const cells = parseCsvLine(line)
  const row = Object.fromEntries(manifestHeader.map((key, index) => [key, cells[index] ?? ""])) as Record<string, string>
  if (row.event === "SUPPLEMENTARY") {
    manifestStatusRows.push([row.event, row.block_order, row.filename, row.sha256, "SUPERSEDED", "0", "Supplementary context image; not an additional Weekly result capture"])
    continue
  }
  const classification = classifications[row.event] ?? { status: "QUARANTINED", verifiedRows: 0, reason: "No reviewed classification" }
  const rchRowsByBlock: Record<string, number> = { "1": 30, "2": 36, "3": 40, "4": 52 }
  const s21RowsByBlock: Record<string, number> = { "1": s21Amateur.length * 2, "2": s21SemiPro.length * 2, "3": s21Pro.length * 2, "4": s21Elite.length * 2 }
  const s20w05RowsByBlock: Record<string, number> = { "1": s20w05Amateur.length * 2, "2": s20w05SemiPro.length * 2, "3": s20w05Pro.length * 2, "4": s20w05Elite.length * 2 }
  const s20w06RowsByBlock: Record<string, number> = { "1": s20w06Amateur.length * 2, "2": s20w06SemiPro.length * 2, "3": s20w06Pro.length * 2, "4": s20w06Elite.length * 2 }
  const s20w07RowsByBlock: Record<string, number> = { "1": s20w07Amateur.length * 2, "2": s20w07SemiPro.length * 2, "3": s20w07Pro.length * 2, "4": s20w07Elite.length * 2 }
  const perImageRows = row.event === rchEvent ? rchRowsByBlock[row.block_order] ?? "" : row.event === s21Event ? s21RowsByBlock[row.block_order] ?? "" : row.event === s20w05Event ? s20w05RowsByBlock[row.block_order] ?? "" : row.event === s20w06Event ? s20w06RowsByBlock[row.block_order] ?? "" : row.event === s20w07Event ? s20w07RowsByBlock[row.block_order] ?? "" : ""
  manifestStatusRows.push([row.event, row.block_order, row.filename, row.sha256, classification.status, String(perImageRows), classification.reason])
}
fs.writeFileSync(path.join(root, "weekly_manifest_status.csv"), manifestStatusRows.map((row) => row.map(csv).join(",")).join("\n") + "\n")

const exceptionCourseCodes: Record<string, string> = {
  S21W05_GLE_HWH: "GLE/HWH", S20W07_ALE_BHH: "ALE/BHH", S20W06_BHE_QVH: "BHE/QVH", S20W05_MGE_ZZH: "MGE/ZZH",
  S20W04_RCE_CLH_UNCONFIRMED_WEEK: "RCE/CLH", S20W03_20E_MWH: "20E/MWH", S20W02_SWE_FFH: "SWE/FFH", S20W01_AWE_HWH: "AWE/HWH",
  S19W12_HWE_UTH: "HWE/UTH", S19W11_WGE_BBH: "WGE/BBH", S19W10_LBE_RCH: "LBE/RCH", S18W09_WWE_FFH: "WWE/FFH", S18W08_FFE_SECOND_CODE_UNVERIFIED: "FFE/?",
}
const exceptionRows: string[][] = [["source", "event_id", "course_codes", "screenshot_or_scope", "reason", "disposition"]]
for (const [event, classification] of Object.entries(classifications)) {
  exceptionRows.push(["THE_WEEKLY", event, exceptionCourseCodes[event] ?? "", "event screenshots", classification.reason, classification.status])
}
exceptionRows.push(["THE_WEEKLY", "S20W07_ALE_BHH", "ALE/BHH", "supplementary_DO_NOT_DOUBLE_COUNT/image(20261019-160759).png", "superseded Elite capture contains incomplete BHH and tournament penalty 99", "SUPERSEDED"])
exceptionRows.push(["THE_WEEKLY", "S19W10_LBE_RCH", "LBE/RCH", "image(20261019-174341).png row 15", "player name is not exact in the source image", "QUARANTINED_AMBIGUOUS_PLAYER"])
exceptionRows.push(["THE_WEEKLY", "S19W10_LBE_RCH", "LBE/RCH", "image(20261019-174350).png row 13", "player name is not readable as an exact screen name", "QUARANTINED_UNREADABLE_PLAYER"])
exceptionRows.push(["THE_WEEKLY", "S19W10_LBE_RCH", "LBE/RCH", "image(20261019-174359).png row 24", "player name is truncated in the supplied screenshot", "QUARANTINED_TRUNCATED_PLAYER"])
exceptionRows.push(["THE_WEEKLY", "ALL", "GLH", "manifest and package", "no GLH Weekly event supplied", "NO_ROWS_INVENTED"])
exceptionRows.push(["THE_WEEKLY", "S21W05_GLE_HWH", "GLE/HWH", "S21W05 division screenshots", "four visible rows omitted because the player screen names could not be preserved exactly", "QUARANTINED_NAME_UNCERTAIN"])
exceptionRows.push(["THE_WEEKLY", "S20W05_MGE_ZZH", "MGE/ZZH", "S20W05 division screenshots", "two visible rows omitted because the player screen names could not be preserved exactly", "QUARANTINED_NAME_UNCERTAIN"])
exceptionRows.push(["THE_WEEKLY", "S20W06_BHE_QVH", "BHE/QVH", "S20W06 division screenshots", "three visible rows omitted because the player screen names could not be preserved exactly", "QUARANTINED_NAME_UNCERTAIN"])
exceptionRows.push(["THE_WEEKLY", "S20W07_ALE_BHH", "ALE/BHH", "S20W07 division screenshots", "three visible rows omitted because the player screen names could not be preserved exactly; superseded Elite capture with penalty 99 remains excluded", "QUARANTINED_NAME_UNCERTAIN"])
fs.writeFileSync(path.join(root, "weekly_evidence_exceptions.csv"), exceptionRows.map((row) => row.map(csv).join(",")).join("\n") + "\n")

const eventCodes: Record<string, string> = {
  S21W05_GLE_HWH: "GLE/HWH", S20W07_ALE_BHH: "ALE/BHH", S20W06_BHE_QVH: "BHE/QVH", S20W05_MGE_ZZH: "MGE/ZZH",
  S20W04_RCE_CLH_UNCONFIRMED_WEEK: "RCE/CLH", S20W03_20E_MWH: "20E/MWH", S20W02_SWE_FFH: "SWE/FFH", S20W01_AWE_HWH: "AWE/HWH",
  S19W12_HWE_UTH: "HWE/UTH", S19W11_WGE_BBH: "WGE/BBH", S19W10_LBE_RCH: "LBE/RCH", S18W09_WWE_FFH: "WWE/FFH", S18W08_FFE_SECOND_CODE_UNVERIFIED: "FFE/?",
}
const summaryHeader = ["event_id", "course_codes", "source", "verified_course_rows", "status"]
const summaryRows: string[][] = [summaryHeader]
for (const [event, classification] of Object.entries(classifications)) summaryRows.push([event, eventCodes[event], "THE_WEEKLY", String(classification.verifiedRows), classification.status])
fs.writeFileSync(path.join(root, "weekly_event_summary.csv"), summaryRows.map((row) => row.map(csv).join(",")).join("\n") + "\n")

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : null
  const sd = values.length > 1 && mean !== null ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : null
  const eliteCount = values.length ? Math.max(1, Math.ceil(values.length * 0.12)) : 0
  const elite = eliteCount ? sorted.slice(0, eliteCount).reduce((sum, value) => sum + value, 0) / eliteCount : null
  return { rounds: values.length, mean, median, sd, elite, courseRating: values.length >= 20 ? elite : null, slope: values.length >= 20 && mean !== null && elite !== null ? mean - elite : null, min: sorted[0] ?? null, max: sorted.at(-1) ?? null }
}

// Production KWT aggregates were read with SELECT-only queries. Raw KWT arrays are not copied into this evidence package,
// so combined values are included only where the read-only aggregate comparison was independently completed.
const kwt: Record<string, { rounds: number; players: number; mean: number; median: number; sd: number; elite: number; min: number; max: number }> = {
  "BHE|EASY": { rounds: 50, players: 50, mean: -13.9, median: -14.5, sd: 5.3040223474, elite: -22.1666666667, min: -25, max: -1 },
  "BHH|HARD": { rounds: 50, players: 50, mean: -8.76, median: -9.5, sd: 6.2907771818, elite: -18.3333333333, min: -20, max: 6 },
  "HWH|HARD": { rounds: 50, players: 50, mean: -3.26, median: -4, sd: 8.78, elite: -16.667, min: -19, max: 16 },
  "LBE|EASY": { rounds: 283, players: 119, mean: -15.297, median: -17, sd: 6.021, elite: -23.559, min: -27, max: 4 },
  "RCH|HARD": { rounds: 163, players: 84, mean: -1.859, median: -2, sd: 8.186, elite: -13.9, min: -18, max: 27 },
}
const aggregateHeader = ["course_code", "difficulty", "model", "rounds", "distinct_players", "mean", "median", "sd", "elite_benchmark", "course_rating", "slope", "min", "max", "status"]
const aggregateRows: string[][] = [aggregateHeader]
const keys = [...new Set(evidence.map((row) => `${row.course_code}|${row.difficulty}`))].sort()
for (const key of keys) {
  const [courseCode, difficulty] = key.split("|")
  const rows = evidence.filter((row) => `${row.course_code}|${row.difficulty}` === key)
  const weeklyStats = stats(rows.map((row) => row.score))
  const distinctWeekly = new Set(rows.map((row) => row.player_exact)).size
  const production = kwt[key]
  const combinedReference: Record<string, { rounds: number; mean: number; median: number; sd: number; elite: number; min: number; max: number }> = {

    "LBE|EASY": { rounds: 362, mean: -16.122, median: -17, sd: 5.885, elite: -24.045, min: -27, max: 4 },
    "RCH|HARD": { rounds: 242, mean: -3.517, median: -4, sd: 7.904, elite: -15.067, min: -20, max: 27 },
  }
  const combined = combinedReference[key]
  const status = (rounds: number) => rounds >= 50 ? "POTENTIALLY_READY_SIMULATION" : rounds >= 20 ? "PROVISIONAL_SIMULATION" : "INSUFFICIENT_VERIFIED_SAMPLE"
  const add = (model: string, value: typeof weeklyStats | typeof production | typeof combined | null, players: number | string, state: string) => {
    const s = value as Record<string, number | null> | null
    const rounds = typeof s?.rounds === "number" ? s.rounds : 0
    const mean = typeof s?.mean === "number" ? s.mean : null
    const elite = typeof s?.elite === "number" ? s.elite : null
    aggregateRows.push([courseCode, difficulty, model, String(rounds), String(players), String(s?.mean ?? ""), String(s?.median ?? ""), String(s?.sd ?? ""), String(s?.elite ?? ""), String(rounds >= 20 ? elite ?? "" : ""), String(rounds >= 20 && mean !== null && elite !== null ? mean - elite : ""), String(s?.min ?? ""), String(s?.max ?? ""), state].map(String))
  }
  add("KWT_ONLY", production, production?.players ?? 0, production ? "PRODUCTION_READ_ONLY_AGGREGATE" : "RAW_KWT_EXPORT_REQUIRED")
  add("WEEKLY_ONLY", weeklyStats, distinctWeekly, status(weeklyStats.rounds))
  add("KWT_PLUS_WEEKLY", combined, combined ? (production?.players ?? 0) + distinctWeekly : 0, combined ? status(combined.rounds) : "RAW_KWT_EXPORT_REQUIRED_FOR_COMBINED")
}
fs.writeFileSync(path.join(root, "course_rating_comparison.csv"), aggregateRows.map((row) => row.map(csv).join(",")).join("\n") + "\n")

const preservedPhase52Rows = 23
const report = `# Weekly evidence comparison (Phase 54 local evidence completion)

This is a local, provisional evidence comparison. It is not a Production rating publication and it cannot feed personal Handicap histories.

## Archive and manifest

- The preserved package contains 56 manifest entries: 52 event screenshots plus four supplementary context images.
- The original package hashes were verified 56/56 before Phase 53. The 52 event screenshots remain available in phase52-input/weekly_screenshots.
- Every manifest entry is classified in weekly_manifest_status.csv. Supplementary captures are SUPERSEDED/context-only and are not additional observations.
- The S20W07 replacement Elite screenshot is retained. The superseded capture containing the incomplete row and tournament penalty 99 is excluded.

## Phase 54 admitted evidence

- Phase 52's ${preservedPhase52Rows} verified S20W07 BHH rows were reconciled into the complete S20W07 transcription; the superseded Elite capture containing the penalty 99 remains excluded.
- S19W10 LBE/RCH contributes 158 verified course rows from 79 visually verified players across Amateur, Semi-Pro, Pro, and Elite blocks.
- Three S19W10 rows remain quarantined because the exact screen name is not recoverable from the supplied image: one ambiguous, one unreadable, and one truncated.
- S21W05 GLE/HWH contributes 184 verified course rows from 92 visually transcribed players; four visible names remain quarantined.
- S20W05 MGE/ZZH contributes 172 verified course rows from 86 visually transcribed players; two visible names remain quarantined.
- S20W06 BHE/QVH contributes 170 verified course rows from 85 visually transcribed players; three visible names remain quarantined.
- S20W07 ALE/BHH contributes 160 verified course rows from 80 visually transcribed players; three visible names remain quarantined.
- Other accessible screenshots were reviewed and classified, but their remaining rows are not silently admitted until each name, course column, and score is visually confirmed. Their exact files and reason are in weekly_manifest_status.csv and weekly_evidence_exceptions.csv.

## Source separation

Weekly rows have personal_handicap_eligible=false and are eligible only for course-rating/slope evidence. No Weekly identity is merged with a Krys Leagues player. KWT data remains a separate source. Mighty Cocobot/personal-best evidence is not imported as ordinary rounds.

## Provisional calculations

The existing legacy simulation is used unchanged: Course Rating is the mean of the lowest 12% of observed scores and Slope is field mean minus elite mean. Under 20 rounds is insufficient, 20–49 is provisional, and 50+ is potentially ready for simulation only. These thresholds and formulas are not approved for Production.

Raptor Cliff's Hard is materially different in the admitted populations: KWT-only mean -1.859, elite benchmark -13.900, slope 12.041; Weekly-only mean -6.937, elite benchmark -16.300, slope 9.363. The Weekly field is lower-scoring and smaller, so combining it changes the provisional distribution but does not by itself prove greater fairness. The combined read-only comparison is -3.517 mean, -15.067 elite benchmark, and 11.550 slope over 242 observations.

The newly expanded BHE, GLE/HWH, ALE/BHH, and MGE/ZZH Weekly samples are course-rating-only simulations. BHE has 85 Weekly rounds and is potentially ready under the provisional sample threshold; its KWT+Weekly row is withheld because the local package does not contain the raw KWT scores needed to recompute the combined elite benchmark after the Weekly sample changed. GLE has 92 Weekly rounds and is potentially ready as a Weekly-only simulation. ALE has 80 Weekly rounds and BHH has 80 Weekly rounds, both potentially ready under the provisional sample threshold. BHH's KWT+Weekly row is withheld for the same raw-KWT reason.

LBE/RCH combined rows use a read-only Production aggregate comparison plus the locally admitted Weekly rows; the raw KWT export is not copied into the evidence package. This is explicitly labeled in course_rating_comparison.csv and is not an import.

For KWT + Weekly rows, distinct_players is the sum of source-population counts, not a cross-source identity merge.

## Remaining evidence gap

The supplied screenshots are readable as images, but full row-level transcription is not complete for the remaining event groups. No uncertain names or scores were invented. Gloop Lair Hard remains unsupported by supplied Weekly evidence.
`
fs.writeFileSync(path.join(root, "course_rating_comparison.md"), report.replace("Phase 53 local evidence completion", "Phase 54 local evidence completion"))
fs.writeFileSync(path.join(root, "weekly_source_provenance.md"), `# Weekly source provenance (Phase 54)\n\n- Source: The Weekly, an external tournament population.\n- Original archive: phase52-input/Krys_Handicap_Weekly_Evidence_Package.zip as preserved by extraction.\n- Manifest: phase52-input/weekly_manifest.csv.\n- Initial package verification: all 56 manifest hashes matched.\n- Row-level admitted evidence: weekly_course_evidence.csv, with original screenshot references and displayed row positions.\n- Manifest-level classification: weekly_manifest_status.csv.\n- Uncertain, unreadable, truncated, superseded, or not-yet-transcribed rows: weekly_evidence_exceptions.csv.\n- Weekly course evidence is never eligible for personal Handicap histories or individual Handicap Indexes.\n- External source player IDs remain separate; no Krys Leagues accounts or identity merges are created.\n- KWT and Mighty Cocobot evidence remain separate.\n- Phase 54 visually transcribed readable rows from S21W05 GLE/HWH, S20W05 MGE/ZZH, S20W06 BHE/QVH, and S20W07 ALE/BHH; all omitted source-name rows remain quarantined. Other remaining event groups remain explicitly partial and are not silently promoted to verified.\n- BHE and BHH combined KWT+Weekly simulations are withheld after the Weekly samples expanded because the raw KWT score export is not present locally.\n`)

console.log(JSON.stringify({ preservedPhase52Rows, admittedS19Rows: 158, totalRows: evidence.length, rchDistinctPlayers: 79 }, null, 2))
