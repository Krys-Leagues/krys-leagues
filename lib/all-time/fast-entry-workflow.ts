export type FastEntryAction = "add_again" | "add_again_scorecard" | "finish"

export type FastEntryWorkspace = {
  period: string
  courseId: string
  playerId: string
  playerSearch: string
  scoreText: string
  holes: string[]
  source: string
  reference: string
  notes: string
  scorecardKey: string | null
}

const emptyHoles = () => Array.from({ length: 18 }, () => "")

export function workspaceAfterSuccessfulSave(
  current: FastEntryWorkspace,
  action: FastEntryAction,
): FastEntryWorkspace {
  const keepScorecard = action === "add_again_scorecard"

  return {
    period: current.period,
    courseId: keepScorecard ? current.courseId : "",
    playerId: "",
    playerSearch: "",
    scoreText: "",
    holes: emptyHoles(),
    source: current.source,
    reference: "",
    notes: "",
    scorecardKey: keepScorecard ? current.scorecardKey : null,
  }
}

export function sourceAfterScorecardSelection(source: string, sourceWasChanged: boolean) {
  return sourceWasChanged ? source : "SCORECARD"
}

export function validScorecardFile(file: Pick<File, "size" | "type">) {
  return file.size > 0
    && file.size <= 10 * 1024 * 1024
    && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
}
