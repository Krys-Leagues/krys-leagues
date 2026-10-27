import type { HandicapIndex } from "./engine.ts"
import { formatGolfHandicapIndex } from "./indexDisplay.ts"

/**
 * Local-only presentation contract for a future player-facing Handicap card.
 * It deliberately accepts only a calculated index snapshot and never reads or
 * writes Production data. Unpublished chronology is shown as preview-only.
 */
export type PlayerHandicapDisplay = Readonly<{
  canonicalPlayerId: string
  screenName: string
  index: number | null
  displayIndex: string
  status: "PUBLISHED" | "PREVIEW_ONLY" | "UNAVAILABLE"
  handicapStatus: "NOT_YET_RATED" | "PROVISIONAL" | "OFFICIAL_ELIGIBLE"
  chronologyConfidence: HandicapIndex["chronologyConfidence"]
  latestRoundCount: number
  selectedRoundCount: number
  ratingVersionIds: readonly string[]
  selectedSourceKeys: readonly string[]
  activeRoundCount: number
  notice: string
}>

export function buildPlayerHandicapDisplay(input: {
  screenName: string
  index: HandicapIndex
}): PlayerHandicapDisplay {
  const { index } = input
  const handicapStatus = index.handicapStatus ?? (index.index === null
    ? "NOT_YET_RATED"
    : index.latestRoundCount >= 20 ? "OFFICIAL_ELIGIBLE" : "PROVISIONAL")
  const status = index.publicationStatus === "PUBLISHED" && handicapStatus === "OFFICIAL_ELIGIBLE"
    ? "PUBLISHED"
    : index.index === null
      ? "UNAVAILABLE"
      : "PREVIEW_ONLY"
  const notice = handicapStatus === "PROVISIONAL"
    ? "Provisional: calculated from all available qualifying cards; publication remains separately gated."
    : status === "PUBLISHED"
    ? "Calculated from the approved personal-round policy."
    : status === "PREVIEW_ONLY"
      ? "Preview only: chronology evidence is not exact enough for publication."
      : "Unavailable: fewer than the required eligible rounds are available."
  return Object.freeze({
    canonicalPlayerId: index.playerId,
    screenName: input.screenName,
    index: index.index,
    displayIndex: formatGolfHandicapIndex(index.index),
    status,
    handicapStatus,
    chronologyConfidence: index.chronologyConfidence,
    latestRoundCount: index.latestRoundCount,
    selectedRoundCount: index.selectedRoundCount,
    activeRoundCount: index.activeRoundCount ?? index.latestRoundCount,
    ratingVersionIds: Object.freeze([...index.ratingVersionIds]),
    selectedSourceKeys: Object.freeze([...index.selectedSourceKeys]),
    notice,
  })
}
