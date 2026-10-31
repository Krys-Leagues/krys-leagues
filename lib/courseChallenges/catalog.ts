import { CHERRY_BLOSSOM_REWARD_ASSET_PATHS } from "./assets.ts"
import type { CourseChallengeCourse, CourseChallengeLevel, CourseChallengePrestigeStage, CourseChallengeRequirement } from "./types"

const levelNumbers = [1, 2, 3, 4, 5] as const
const asset = (name: string) => "/course-challenges/tourist-trap/" + name
const cherryAsset = (name: string) => "/course-challenges/cherry-blossom/" + name
function req(id: string, label: string, kind: CourseChallengeRequirement["kind"], operator: CourseChallengeRequirement["operator"] = "eq", target?: number, hole?: number, reviewRequired = false, helpText?: string): CourseChallengeRequirement {
  return { id, label, kind, operator, target, hole, reviewRequired, helpText }
}
const complete = (level: number) => req("l" + level + "-complete", "Complete the course", "complete_course", "eq", 1)
const relative = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-relative", (target > 0 ? "+" : "") + target + " or better", "relative_to_par", "lte", target)
const relativeLabel = (level: number, side: string, target: number, label: string) => req("l" + level + "-" + side + "-relative", label, "relative_to_par", "lte", target)
const hio = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-hio", target + " hole-in-one" + (target === 1 ? "" : "s"), "hio_count", "gte", target)
const bogeys = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-bogeys", target + " bogeys or fewer", "bogey_count", "lte", target)
const birdies = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-birdies", target + " birdie" + (target === 1 ? "" : "s"), "birdie_count", "gte", target)
const eagles = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-eagles", target + " eagle" + (target === 1 ? "" : "s"), "eagle_count", "gte", target)
const holeScore = (level: number, side: string, hole: number, label: string, operator: CourseChallengeRequirement["operator"], target: number, helpText?: string) => req("l" + level + "-" + side + "-h" + hole, label, "hole_score", operator, target, hole, false, helpText)
const holeRelative = (level: number, side: string, hole: number, label: string, target: number, helpText?: string) => req("l" + level + "-" + side + "-h" + hole + "-relative", label, "hole_relative_to_par", "lte", target, hole, false, helpText)
const strokeOuts = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-stroke-outs", target + " stroke-outs or fewer", "stroke_out_count", "lte", target)
const holesAtOrBelow = (level: number, side: string, target: number, scoreThreshold: number, label: string) => ({ ...req("l" + level + "-" + side + "-holes-at-most", label, "holes_at_or_below_score_count", "gte", target), scoreThreshold })
const holesUnderPar = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-holes-under-par", target + " holes under par", "holes_under_par_count", "gte", target)
const allHolesAtOrBelow = (level: number, side: string, scoreThreshold: number, label: string) => ({ ...req("l" + level + "-" + side + "-all-holes-at-most", label, "all_holes_at_or_below_score", "eq", 18), scoreThreshold })

function touristTrapLevels(): CourseChallengeLevel[] {
  const requirements: Record<number, { easy: CourseChallengeRequirement[]; hard: CourseChallengeRequirement[] }> = {
    1: {
      easy: [complete(1), relative(1, "easy", -7), req("l1-easy-pars", "4 holes at par or better", "par_or_better_count", "gte", 4)],
      hard: [complete(1), relative(1, "hard", 7), strokeOuts(1, "hard", 2)],
    },
    2: {
      easy: [complete(2), relative(2, "easy", -10), hio(2, "easy", 3), bogeys(2, "easy", 2), holeRelative(2, "easy", 18, "Birdie or better on Hole 18", -1, "Go around, down the stairs.")],
      hard: [complete(2), relative(2, "hard", 3), hio(2, "hard", 1), strokeOuts(2, "hard", 1), holeRelative(2, "hard", 15, "Par or better on Hole 15", 0, "Skip the trick shot and lay up if you're struggling.")],
    },
    3: {
      easy: [complete(3), relative(3, "easy", -12), bogeys(3, "easy", 0), holeScore(3, "easy", 1, "Hole-in-one on Hole 1", "eq", 1), holeScore(3, "easy", 2, "Hole-in-one on Hole 2", "eq", 1)],
      hard: [complete(3), relative(3, "hard", -2), strokeOuts(3, "hard", 0), holeRelative(3, "hard", 13, "Par or better on Hole 13", 0), holeScore(3, "hard", 18, "4 strokes or better on Hole 18", "lte", 4)],
    },
    4: {
      easy: [complete(4), relative(4, "easy", -15), bogeys(4, "easy", 0), hio(4, "easy", 4), holeRelative(4, "easy", 18, "Eagle or better on Hole 18", -2)],
      hard: [complete(4), relative(4, "hard", -10), strokeOuts(4, "hard", 0), hio(4, "hard", 1), eagles(4, "hard", 1), birdies(4, "hard", 3)],
    },
    5: {
      easy: [complete(5), relative(5, "easy", -20), hio(5, "easy", 4), eagles(5, "easy", 2), birdies(5, "easy", 4)],
      hard: [complete(5), relative(5, "hard", -20), strokeOuts(5, "hard", 0), hio(5, "hard", 1), eagles(5, "hard", 2), holeRelative(5, "hard", 9, "Birdie or better on Hole 9", -1), holeRelative(5, "hard", 13, "Birdie or better on Hole 13", -1), holeRelative(5, "hard", 14, "Birdie or better on Hole 14", -1), holeRelative(5, "hard", 15, "Birdie or better on Hole 15", -1)],
    },
  }
  return levelNumbers.map((level) => ({
    level,
    easyCode: "TTE",
    hardCode: "TTH",
    requirementsStatus: "ready",
    easyRequirements: requirements[level].easy,
    hardRequirements: requirements[level].hard,
    stickerKey: "course-challenge:tourist-trap:level-" + level + ":sticker",
    stickerAsset: asset("tourist-trap-level-" + level + ".png"),
    badgeKey: null,
    badgeAsset: null,
  }))
}

function cherryBlossomLevels(): CourseChallengeLevel[] {
  const requirements: Record<number, { easy: CourseChallengeRequirement[]; hard: CourseChallengeRequirement[] }> = {
    1: {
      easy: [relative(1, "easy", -10)],
      hard: [relative(1, "hard", 6), holeRelative(1, "hard", 2, "Hole 2 — bogey or better", 1), holeRelative(1, "hard", 10, "Hole 10 — par or better", 0)],
    },
    2: {
      easy: [relative(2, "easy", -12), holeRelative(2, "easy", 2, "Hole 2 — par or better", 0), holeRelative(2, "easy", 10, "Hole 10 — birdie or better", -1)],
      hard: [relative(2, "hard", 4), holeRelative(2, "hard", 10, "Hole 10 — under par", -1)],
    },
    3: {
      easy: [relative(3, "easy", -14)],
      hard: [relative(3, "hard", 2), holeRelative(3, "hard", 2, "Hole 2 — par or better", 0)],
    },
    4: {
      easy: [relative(4, "easy", -16), holeRelative(4, "easy", 2, "Hole 2 — eagle or better", -2), holeRelative(4, "easy", 10, "Hole 10 — albatross or better", -3)],
      hard: [relativeLabel(4, "hard", 0, "Par or better"), holeRelative(4, "hard", 2, "Hole 2 — birdie or better", -1), holeRelative(4, "hard", 10, "Hole 10 — eagle or better", -2)],
    },
    5: {
      easy: [relative(5, "easy", -18), holeRelative(5, "easy", 1, "Hole 1 — birdie or better", -1), holeRelative(5, "easy", 9, "Hole 9 — eagle or better", -2), holeRelative(5, "easy", 18, "Hole 18 — albatross or better", -3)],
      hard: [relative(5, "hard", -2), holeRelative(5, "hard", 1, "Hole 1 — par or better", 0), holeRelative(5, "hard", 9, "Hole 9 — birdie or better", -1), holeRelative(5, "hard", 18, "Hole 18 — eagle or better", -2)],
    },
  }
  return levelNumbers.map((level) => ({
    level,
    easyCode: "CBE",
    hardCode: "CBH",
    requirementsStatus: "ready",
    easyRequirements: requirements[level].easy,
    hardRequirements: requirements[level].hard,
    stickerKey: "course-challenge:cherry-blossom:level-" + level + ":sticker",
    stickerAsset: cherryAsset("cherry-blossom-level-" + level + ".png"),
    badgeKey: null,
    badgeAsset: null,
  }))
}

function aroundTheWorldLevels(): CourseChallengeLevel[] {
  const requirements: Record<number, { easy: CourseChallengeRequirement[]; hard: CourseChallengeRequirement[] }> = {
    1: {
      easy: [complete(1), relative(1, "easy", -3), birdies(1, "easy", 2), strokeOuts(1, "easy", 1)],
      hard: [complete(1), relative(1, "hard", 5), req("l1-hard-par-or-better", "3 holes at par or better", "par_or_better_count", "gte", 3)],
    },
    2: {
      easy: [complete(2), relative(2, "easy", -6), holeRelative(2, "easy", 8, "Birdie or better on Hole 8", -1), strokeOuts(2, "easy", 0)],
      hard: [complete(2), relative(2, "hard", 0), birdies(2, "hard", 2)],
    },
    3: {
      easy: [complete(3), relative(3, "easy", -10), holeRelative(3, "easy", 8, "Eagle or better on Hole 8", -2), holeRelative(3, "easy", 1, "Birdie or better on Hole 1", -1), holeRelative(3, "easy", 3, "Birdie or better on Hole 3", -1), holeRelative(3, "easy", 5, "Birdie or better on Hole 5", -1), holeRelative(3, "easy", 17, "Birdie or better on Hole 17", -1)],
      hard: [complete(3), relative(3, "hard", -5), holeRelative(3, "hard", 3, "Birdie or better on Hole 3", -1), holeRelative(3, "hard", 10, "Birdie or better on Hole 10", -1), strokeOuts(3, "hard", 1)],
    },
    4: {
      easy: [complete(4), relative(4, "easy", -15), bogeys(4, "easy", 0), holesAtOrBelow(4, "easy", 5, 2, "5 holes at 2 strokes or better")],
      hard: [complete(4), relative(4, "hard", -10), strokeOuts(4, "hard", 0), holeScore(4, "hard", 7, "2 strokes or better on Hole 7", "lte", 2, "Lay up on the bottom to get it in two.")],
    },
    5: {
      easy: [complete(5), relative(5, "easy", -20), holesUnderPar(5, "easy", 10)],
      hard: [complete(5), relative(5, "hard", -15), bogeys(5, "hard", 2)],
    },
  }
  return levelNumbers.map((level) => ({
    level,
    easyCode: "AWE",
    hardCode: "AWH",
    requirementsStatus: "ready",
    easyRequirements: requirements[level].easy,
    hardRequirements: requirements[level].hard,
    stickerKey: "course-challenge:80-days-around-the-world:level-" + level + ":sticker",
    stickerAsset: null,
    badgeKey: null,
    badgeAsset: null,
  }))
}

function touristPrestigeStages(): CourseChallengePrestigeStage[] {
  return [
    { stage: 1, key: "course-pro", label: "Course Pro", easyRequirements: [relative(6, "easy", -23), bogeys(6, "easy", 0)], hardRequirements: [relative(6, "hard", -20), bogeys(6, "hard", 0), eagles(6, "hard", 2)], requirementsStatus: "ready", rewardKey: "course-challenge:tourist-trap:course-pro", rewardAsset: asset("tourist-trap-course-pro.png"), requiresHard: true },
    { stage: 2, key: "course-master", label: "Course Master", easyRequirements: [relative(7, "easy", -25), bogeys(7, "easy", 0), eagles(7, "easy", 3)], hardRequirements: [relative(7, "hard", -23), bogeys(7, "hard", 0), holeRelative(7, "hard", 9, "Birdie or better on Hole 9", -1), holeRelative(7, "hard", 13, "Birdie or better on Hole 13", -1), holeRelative(7, "hard", 14, "Birdie or better on Hole 14", -1), holeRelative(7, "hard", 15, "Birdie or better on Hole 15", -1)], requirementsStatus: "ready", rewardKey: "course-challenge:tourist-trap:course-master", rewardAsset: asset("tourist-trap-course-master.png"), requiresHard: true },
  ]
}

function cherryPrestigeStages(): CourseChallengePrestigeStage[] {
  return [
    { stage: 1, key: "course-pro", label: "Course Pro", easyRequirements: [relative(6, "easy", -28)], hardRequirements: [relative(6, "hard", -23), holeRelative(6, "hard", 16, "Hole 16 — par or better", 0), holeRelative(6, "hard", 17, "Hole 17 — par or better", 0), holeRelative(6, "hard", 18, "Hole 18 — par or better", 0)], requirementsStatus: "ready", rewardKey: "course-challenge:cherry-blossom:course-pro", rewardAsset: cherryAsset("cherry-blossom-course-pro.png"), requiresHard: true },
    { stage: 2, key: "course-master", label: "Course Master", easyRequirements: [relative(7, "easy", -31)], hardRequirements: [relative(7, "hard", -26), holeRelative(7, "hard", 15, "Hole 15 — birdie or better", -1), holeRelative(7, "hard", 16, "Hole 16 — birdie or better", -1), holeRelative(7, "hard", 17, "Hole 17 — birdie or better", -1), holeRelative(7, "hard", 18, "Hole 18 — birdie or better", -1)], requirementsStatus: "ready", rewardKey: "course-challenge:cherry-blossom:course-master", rewardAsset: cherryAsset("cherry-blossom-course-master.png"), requiresHard: true },
  ]
}

function aroundTheWorldPrestigeStages(): CourseChallengePrestigeStage[] {
  return [
    { stage: 1, key: "course-pro", label: "Course Pro", easyRequirements: [allHolesAtOrBelow(6, "easy", 2, "All 18 holes at 2 strokes or better")], hardRequirements: [relative(6, "hard", -17), bogeys(6, "hard", 0), eagles(6, "hard", 1)], requirementsStatus: "ready", rewardKey: "course-challenge:80-days-around-the-world:course-pro", rewardAsset: null, requiresHard: true },
    { stage: 2, key: "course-master", label: "Course Master", easyRequirements: [relative(7, "easy", -26)], hardRequirements: [allHolesAtOrBelow(7, "hard", 2, "All 18 holes at 2 strokes or better")], requirementsStatus: "ready", rewardKey: "course-challenge:80-days-around-the-world:course-master", rewardAsset: null, requiresHard: true },
  ]
}

type AceStageSpec = { key: "wader" | "chaser" | "hunter" | "legend"; label: string; easy: number; hard: number | null }
function aceStages(slug: string, specs: AceStageSpec[], assetPath: (name: string) => string | null) {
  return specs.map((spec, index) => {
    return {
      stage: (index + 1) as 1 | 2 | 3 | 4,
      key: spec.key,
      label: "Ace " + spec.label,
      easyRequirements: [hio(index + 1, "easy", spec.easy)],
      hardRequirements: spec.hard === null ? [] : [hio(index + 1, "hard", spec.hard)],
      requirementsStatus: "ready" as const,
      rewardKey: "course-challenge:" + slug + ":ace-" + spec.key,
      rewardAsset: assetPath(slug + "-ace-" + spec.key + ".png"),
      requiresHard: spec.hard !== null,
    }
  })
}

const touristAceStages = aceStages("tourist-trap", [{ key: "wader", label: "Wader", easy: 2, hard: null }, { key: "chaser", label: "Chaser", easy: 3, hard: 1 }, { key: "hunter", label: "Hunter", easy: 6, hard: 1 }, { key: "legend", label: "Legend", easy: 10, hard: 3 }], asset)
const cherryAceStages = aceStages("cherry-blossom", [{ key: "wader", label: "Wader", easy: 3, hard: null }, { key: "chaser", label: "Chaser", easy: 6, hard: 2 }, { key: "hunter", label: "Hunter", easy: 10, hard: 5 }, { key: "legend", label: "Legend", easy: 12, hard: 8 }], cherryAsset)
const aroundTheWorldAceStages = aceStages("80-days-around-the-world", [{ key: "wader", label: "Wader", easy: 2, hard: null }, { key: "chaser", label: "Chaser", easy: 4, hard: 2 }, { key: "hunter", label: "Hunter", easy: 7, hard: 5 }, { key: "legend", label: "Legend", easy: 11, hard: 7 }], () => null)
const comingSoonCourses: CourseChallengeCourse[] = [
  { slug: "gardens-of-babylon", name: "Gardens of Babylon", status: "coming_soon", displayOrder: 4, shortDescription: "Coming soon.", backgroundImage: null, easyCode: "", hardCode: "", levels: [] },
  { slug: "raptor-cliffs", name: "Raptor Cliff's", status: "coming_soon", displayOrder: 5, shortDescription: "Coming soon.", backgroundImage: null, easyCode: "", hardCode: "", levels: [] },
  { slug: "forgotten-fairyland", name: "Forgotten Fairyland", status: "coming_soon", displayOrder: 6, shortDescription: "Coming soon.", backgroundImage: null, easyCode: "", hardCode: "", levels: [] },
  { slug: "tiki-a-coco", name: "Tiki à Coco", status: "coming_soon", displayOrder: 7, shortDescription: "Coming soon.", backgroundImage: null, easyCode: "", hardCode: "", levels: [] },
]
export const COURSE_CHALLENGE_COURSES: CourseChallengeCourse[] = [
  {
    slug: "tourist-trap",
    name: "Tourist Trap",
    status: "live",
    displayOrder: 1,
    shortDescription: "The first Course Challenge book, built around one Easy and one Hard card per Level.",
    backgroundImage: "https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/TTE_FULL.jpg",
    easyCode: "TTE",
    hardCode: "TTH",
    levels: touristTrapLevels(),
    courseProAsset: asset("tourist-trap-course-pro.png"),
    courseMasterAsset: asset("tourist-trap-course-master.png"),
    aceStages: touristAceStages,
    prestigeStages: touristPrestigeStages(),
  },
  {
    slug: "cherry-blossom",
    name: "Cherry Blossom",
    status: "live",
    displayOrder: 2,
    shortDescription: "A second launch course using the same five-Level book and full Ace Track.",
    backgroundImage: "https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/CBE_FULL.jpg",
    easyCode: "CBE",
    hardCode: "CBH",
    levels: cherryBlossomLevels(),
    aceStages: cherryAceStages,
    courseProAsset: CHERRY_BLOSSOM_REWARD_ASSET_PATHS.coursePro,
    courseMasterAsset: CHERRY_BLOSSOM_REWARD_ASSET_PATHS.courseMaster,
    prestigeStages: cherryPrestigeStages(),
  },
  {
    slug: "80-days-around-the-world",
    name: "80 Days Around the World",
    status: "live",
    displayOrder: 3,
    shortDescription: "A five-Level Course Challenge book built from the existing Around The World Easy and Hard scorecards.",
    backgroundImage: "/course-challenges/80-days-around-the-world/80-days-around-the-world.jpg",
    easyCode: "AWE",
    hardCode: "AWH",
    levels: aroundTheWorldLevels(),
    aceStages: aroundTheWorldAceStages,
    prestigeStages: aroundTheWorldPrestigeStages(),
  },
  ...comingSoonCourses,
]

export function getCourseChallenge(slug: string) { return COURSE_CHALLENGE_COURSES.find((course) => course.slug === slug) ?? null }
export function getPublicCourseChallenges() { return COURSE_CHALLENGE_COURSES.filter((course) => course.status === "live").sort((left, right) => left.displayOrder - right.displayOrder) }
export function getComingSoonCourseChallenges() { return COURSE_CHALLENGE_COURSES.filter((course) => course.status === "coming_soon").sort((left, right) => left.displayOrder - right.displayOrder) }
export function getCourseChallengeLevel(course: CourseChallengeCourse, level: number) { return course.levels.find((item) => item.level === level) ?? null }
export function getAceStage(course: CourseChallengeCourse, stage: number) { return course.aceStages?.find((item) => item.stage === stage) ?? null }
export function getPrestigeStage(course: CourseChallengeCourse, stage: number) { return course.prestigeStages?.find((item) => item.stage === stage) ?? null }
export function isRegularTrackComplete(completedLevels: number[]) { return levelNumbers.every((level) => completedLevels.includes(level)) }
export function isPrestigeStageUnlocked(course: CourseChallengeCourse, stage: number, completedLevels: number[], completedPrestigeStages: number[]) {
  if (stage === 1) return isRegularTrackComplete(completedLevels)
  return completedPrestigeStages.includes(stage - 1)
}
export function isAceChallengeUnlocked(course: CourseChallengeCourse, completedLevels: number[]) { void completedLevels; return Boolean(course.aceStages?.length) }
export function courseChallengeRewardLabel(course: CourseChallengeCourse, level: number, kind: "sticker" | "badge") { return kind === "sticker" ? course.name + " Level " + level + " sticker" : course.name + " Level " + level + " badge" }
