export const TOURIST_TRAP_REWARD_ASSET_PATHS = {
  level1: "/course-challenges/tourist-trap/tourist-trap-level-1.png",
  level2: "/course-challenges/tourist-trap/tourist-trap-level-2.png",
  level3: "/course-challenges/tourist-trap/tourist-trap-level-3.png",
  level4: "/course-challenges/tourist-trap/tourist-trap-level-4.png",
  level5: "/course-challenges/tourist-trap/tourist-trap-level-5.png",
  aceWader: "/course-challenges/tourist-trap/tourist-trap-ace-wader.png",
  aceChaser: "/course-challenges/tourist-trap/tourist-trap-ace-chaser.png",
  aceHunter: "/course-challenges/tourist-trap/tourist-trap-ace-hunter.png",
  aceLegend: "/course-challenges/tourist-trap/tourist-trap-ace-legend.png",
  coursePro: "/course-challenges/tourist-trap/tourist-trap-course-pro.png",
  courseMaster: "/course-challenges/tourist-trap/tourist-trap-course-master.png",
} as const

export const CHERRY_BLOSSOM_REWARD_ASSET_PATHS = {
  level1: "/course-challenges/cherry-blossom/cherry-blossom-level-1.png",
  level2: "/course-challenges/cherry-blossom/cherry-blossom-level-2.png",
  level3: "/course-challenges/cherry-blossom/cherry-blossom-level-3.png",
  level4: "/course-challenges/cherry-blossom/cherry-blossom-level-4.png",
  level5: "/course-challenges/cherry-blossom/cherry-blossom-level-5.png",
  coursePro: "/course-challenges/cherry-blossom/cherry-blossom-course-pro.png",
  courseMaster: "/course-challenges/cherry-blossom/cherry-blossom-course-master.png",
  aceWader: "/course-challenges/cherry-blossom/cherry-blossom-ace-wader.png",
  aceChaser: "/course-challenges/cherry-blossom/cherry-blossom-ace-chaser.png",
  aceHunter: "/course-challenges/cherry-blossom/cherry-blossom-ace-hunter.png",
  aceLegend: "/course-challenges/cherry-blossom/cherry-blossom-ace-legend.png",
} as const

export const AROUND_THE_WORLD_REWARD_ASSET_PATHS = {
  level1: "/course-challenges/80-days/80-days-level-1.png",
  level2: "/course-challenges/80-days/80-days-level-2.png",
  level3: "/course-challenges/80-days/80-days-level-3.png",
  level4: "/course-challenges/80-days/80-days-level-4.png",
  level5: "/course-challenges/80-days/80-days-level-5.png",
  coursePro: "/course-challenges/80-days/80-days-pro.png",
  courseMaster: "/course-challenges/80-days/80-days-course-master.png",
  aceWader: "/course-challenges/80-days/" + encodeURIComponent("Sunset Skeleton Balloon Adventure Badge.png"),
  aceChaser: "/course-challenges/80-days/" + encodeURIComponent("Ace Chaser_ 80 Days Worldwide.png"),
  aceHunter: "/course-challenges/80-days/" + encodeURIComponent("Ace Hunter_ Around the World.png"),
  aceLegend: "/course-challenges/80-days/" + encodeURIComponent("Legendary Skeleton Golfer Crest (1).png"),
} as const

const widowAsset = (name: string) => "/course-challenges/widows-walkabout/" + encodeURIComponent(name)

export const WIDOWS_WALKABOUT_REWARD_ASSET_PATHS = {
  level1: widowAsset("widows-walkabout-level-1.png"),
  level2: widowAsset("widows-walkabout-level-2.png"),
  level3: widowAsset("widows-walkabout-level-3.png"),
  level4: widowAsset("widows-walkabout-level-4.png"),
  level5: widowAsset("widows-walkabout-level-5.png"),
  aceWader: widowAsset("Gothic Wader Widow’s Walkabout Emblem.png"),
  aceChaser: widowAsset("Neon Gothic Skeleton Golf Badge.png"),
  aceHunter: widowAsset("Neon Gothic Skeleton Golf Badge.png"),
  aceLegend: widowAsset("Neon Gothic Ace Legend Emblem (1).png"),
  coursePro: widowAsset("Gothic Widow’s Walkabout Course Pro.png"),
  courseMaster: widowAsset("Gothic Rainy Mansion Golf Crest.png"),
} as const
