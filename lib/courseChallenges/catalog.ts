import type { CourseChallengeCourse, CourseChallengeLevel, CourseChallengeRequirement } from "./types"

const levelNumbers = [1, 2, 3, 4, 5] as const
const asset = (name: string) => "/course-challenges/tourist-trap/" + name
function req(id: string, label: string, kind: CourseChallengeRequirement["kind"], operator: CourseChallengeRequirement["operator"] = "eq", target?: number, hole?: number, reviewRequired = false, helpText?: string): CourseChallengeRequirement {
  return { id, label, kind, operator, target, hole, reviewRequired, helpText }
}
const complete = (level: number) => req("l" + level + "-complete", "Complete the course", "complete_course", "eq", 1)
const relative = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-relative", (target > 0 ? "+" : "") + target + " or better", "relative_to_par", "lte", target)
const hio = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-hio", target + " hole-in-one" + (target === 1 ? "" : "s"), "hio_count", "gte", target)
const bogeys = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-bogeys", target + " bogeys or fewer", "bogey_count", "lte", target)
const birdies = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-birdies", target + " birdie" + (target === 1 ? "" : "s"), "birdie_count", "gte", target)
const eagles = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-eagles", target + " eagle" + (target === 1 ? "" : "s"), "eagle_count", "gte", target)
const holeScore = (level: number, side: string, hole: number, label: string, operator: CourseChallengeRequirement["operator"], target: number, helpText?: string) => req("l" + level + "-" + side + "-h" + hole, label, "hole_score", operator, target, hole, false, helpText)
const holeRelative = (level: number, side: string, hole: number, label: string, target: number, helpText?: string) => req("l" + level + "-" + side + "-h" + hole + "-relative", label, "hole_relative_to_par", "lte", target, hole, false, helpText)
const strokeOuts = (level: number, side: string, target: number) => req("l" + level + "-" + side + "-stroke-outs", target + " stroke-outs or fewer", "stroke_out_count", "lte", target)

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

function pendingLevels(slug: string, easyCode: string, hardCode: string): CourseChallengeLevel[] {
  return levelNumbers.map((level) => {
    if (slug === "cherry-blossom" && level === 1) {
      return {
        level,
        easyCode,
        hardCode,
        requirementsStatus: "ready",
        easyRequirements: [complete(1), relative(1, "easy", -10), strokeOuts(1, "easy", 0), req("cbl1-easy-eagles", "2 eagles or better", "eagle_count", "gte", 2)],
        hardRequirements: [complete(1), req("cbl1-hard-pars", "6 holes at par or better", "par_or_better_count", "gte", 6), holeRelative(1, "hard", 2, "Hole 2 — bogey or better", 1, "The bridges have very little friction, so the ball keeps rolling. Use soft, controlled shots and don’t be afraid to lay up."), holeRelative(1, "hard", 10, "Hole 10 — par or better", 0, "Take all the right-side holes. If you don’t miss any putts, that route can produce an albatross.")],
        stickerKey: "course-challenge:" + slug + ":level-" + level + ":sticker",
        stickerAsset: null,
        badgeKey: null,
        badgeAsset: null,
      }
    }
    return {
      level,
      easyCode,
      hardCode,
      requirementsStatus: "pending_review",
      easyRequirements: [],
      hardRequirements: [],
      stickerKey: "course-challenge:" + slug + ":level-" + level + ":sticker",
      stickerAsset: null,
      badgeKey: level === 3 || level === 5 ? "course-challenge:" + slug + ":level-" + level + ":badge" : null,
      badgeAsset: null,
    }
  })
}
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
    aceChallenge: {
      unlockAfterLevel: 3,
      requirementsStatus: "ready",
      easyRequirements: [req("ace-easy-hio", "8 hole-in-ones in one round", "hio_count", "gte", 8)],
      hardRequirements: [req("ace-hard-hio", "2 hole-in-ones in one round", "hio_count", "gte", 2)],
      rewardKey: "course-challenge:tourist-trap:ace-challenge",
      rewardAsset: asset("tourist-trap-ace-challenge.png"),
    },
  },
  {
    slug: "cherry-blossom",
    name: "Cherry Blossom",
    status: "scheduled",
    displayOrder: 2,
    shortDescription: "A second launch course using the same five-Level, two-sided progression engine.",
    backgroundImage: "https://objectstorage.us-ashburn-1.oraclecloud.com/n/idw1nygcxpvm/b/wmgt-assets/o/CBE_FULL.jpg",
    easyCode: "CBE",
    hardCode: "CBH",
    levels: pendingLevels("cherry-blossom", "CBE", "CBH"),
  },
]

export function getCourseChallenge(slug: string) { return COURSE_CHALLENGE_COURSES.find((course) => course.slug === slug) ?? null }
export function getPublicCourseChallenges() { return COURSE_CHALLENGE_COURSES.filter((course) => course.status === "live").sort((left, right) => left.displayOrder - right.displayOrder) }
export function getCourseChallengeLevel(course: CourseChallengeCourse, level: number) { return course.levels.find((item) => item.level === level) ?? null }
export function isAceChallengeUnlocked(course: CourseChallengeCourse, completedLevels: number[]) { return Boolean(course.aceChallenge && completedLevels.includes(course.aceChallenge.unlockAfterLevel)) }
export function courseChallengeRewardLabel(course: CourseChallengeCourse, level: number, kind: "sticker" | "badge") { return kind === "sticker" ? course.name + " Level " + level + " sticker" : course.name + " Level " + level + " badge" }