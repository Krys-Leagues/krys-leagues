export type DoublesCourseComponent = {
  key: "course1" | "course2"
  homeStrokes: number[]
  awayStrokes: number[]
  verified: boolean
  evidenceId: string
  uploaderPlayerId: string
}

export function holesWonForCourse(component: Pick<DoublesCourseComponent, "homeStrokes" | "awayStrokes">) {
  if (component.homeStrokes.length !== 18 || component.awayStrokes.length !== 18) throw new Error("Each Doubles course component requires exactly 18 holes for both teams")
  let home = 0
  let away = 0
  for (let index = 0; index < 18; index += 1) {
    if (component.homeStrokes[index] < component.awayStrokes[index]) home += 1
    else if (component.awayStrokes[index] < component.homeStrokes[index]) away += 1
  }
  return { homeHolesWon: home, awayHolesWon: away }
}

export function buildDoublesScorecardCommit(components: DoublesCourseComponent[]) {
  const course1 = components.find((component) => component.key === "course1")
  const course2 = components.find((component) => component.key === "course2")
  if (!course1 || !course2 || !course1.verified || !course2.verified) throw new Error("Both verified Doubles course components are required")
  const first = holesWonForCourse(course1)
  const second = holesWonForCourse(course2)
  return Object.freeze({
    home_score: first.homeHolesWon + second.homeHolesWon,
    away_score: first.awayHolesWon + second.awayHolesWon,
    course1: first,
    course2: second,
    uploaderPlayerIds: [course1.uploaderPlayerId, course2.uploaderPlayerId],
    evidenceIds: [course1.evidenceId, course2.evidenceId],
  })
}

export function scorecardCommitKey(fixtureId: string, course1EvidenceId: string, course2EvidenceId: string) {
  return `${fixtureId}:doubles-scorecard:${course1EvidenceId}:${course2EvidenceId}`
}
