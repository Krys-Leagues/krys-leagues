import { normalizeDiscordHistoricalName, type KwtDiscordSeason } from "./kwtDiscordEvidence.ts"

export type KwtReviewIdentity = {
  historicalName: string
  originalSourceHandles: string[]
  status: "resolved" | "unresolved" | "ambiguous"
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  matchSource: string | null
}

export type KwtManualIdentityAssignment = { canonicalPlayerId: string; canonicalPlayerName: string; periodKey?: string }

type PersonAccumulator = {
  historicalName: string
  sourceHandles: Set<string>
  factTypes: Map<string, number>
  factCount: number
  sourceSections: Set<string>
}

export type KwtPersonWeekReview = {
  periodKey: string
  label: string
  week: number | null
  sourceSectionCount: number
  people: Array<{
    historicalName: string
    originalSourceHandles: string[]
    factCount: number
    factTypes: Array<{ type: string; count: number }>
    sourceSections: string[]
    status: "resolved" | "missing" | "ambiguous" | "conflict"
    canonicalPlayerId: string | null
    canonicalPlayerName: string | null
    matchSource: string | null
    manuallySelected: boolean
  }>
  summary: { totalPeople: number; resolved: number; missing: number; ambiguous: number; needsChecking: number; factsReady: number; factsBlocked: number }
}

const identityKey = (value: string) => normalizeDiscordHistoricalName(value).toLocaleLowerCase()

export function buildKwtPersonWeekReview(season: KwtDiscordSeason, identities: KwtReviewIdentity[], manualAssignments: Record<string, KwtManualIdentityAssignment[]> = {}) {
  const identityByName = new Map(identities.map(identity => [identityKey(identity.historicalName), identity]))
  const periods: Array<{ periodKey: string; label: string; week: number | null; sourceSectionCount: number; facts: Array<{ sourceHandle: string; type: string; section: string }> }> = season.events.map(event => ({
    periodKey: `week-${event.week}`,
    label: `Week ${event.week}`,
    week: event.week,
    sourceSectionCount: event.sourceMessages.length,
    facts: [
      ...event.placements.map(fact => ({ sourceHandle: fact.sourceHandle, type: "Placement", section: fact.scope === "overall" ? "OVERALL" : fact.division ?? "UNKNOWN" })),
      ...event.awards.map(fact => ({ sourceHandle: fact.sourceHandle, type: fact.difficulty === "easy" ? "Best Easy" : "Best Hard", section: fact.scope === "overall" ? "OVERALL" : fact.division ?? "UNKNOWN" })),
      ...event.promotions.map(fact => ({ sourceHandle: fact.sourceHandle, type: "Promotion", section: fact.fromDivision ?? "UNKNOWN" })),
      ...event.badges.map(fact => ({ sourceHandle: fact.sourceHandle, type: `${fact.type[0].toUpperCase()}${fact.type.slice(1)} badge`, section: "BADGES" })),
      ...event.annotations.map(fact => ({ sourceHandle: fact.sourceHandle, type: "Annotation", section: "ANNOTATION" })),
      ...event.recognitions.map(fact => ({ sourceHandle: fact.sourceHandle, type: "Recognition", section: "RECOGNITION" })),
    ],
  }))
  periods.push({
    periodKey: "finals",
    label: "Season 9 Finals",
    week: null,
    sourceSectionCount: 1,
    facts: [...season.finals.placements.map(fact => ({ sourceHandle: fact.sourceHandle, type: "Final placement", section: fact.division ?? "OVERALL" })), ...season.finals.recognitions.map(fact => ({ sourceHandle: fact.sourceHandle, type: "Final recognition", section: "SEASON FINALS" }))],
  })

  return periods.map((period): KwtPersonWeekReview => {
    const people = new Map<string, PersonAccumulator>()
    for (const fact of period.facts) {
      const historicalName = normalizeDiscordHistoricalName(fact.sourceHandle)
      const key = identityKey(historicalName)
      const person = people.get(key) ?? { historicalName, sourceHandles: new Set<string>(), factTypes: new Map<string, number>(), factCount: 0, sourceSections: new Set<string>() }
      person.sourceHandles.add(fact.sourceHandle.trim().startsWith("@") ? fact.sourceHandle.trim() : `@${fact.sourceHandle.trim()}`)
      person.factTypes.set(fact.type, (person.factTypes.get(fact.type) ?? 0) + 1)
      person.factCount += 1
      person.sourceSections.add(fact.section)
      people.set(key, person)
    }
    const reviewedPeople: KwtPersonWeekReview["people"] = [...people.entries()].map(([key, person]) => {
      const automatic = identityByName.get(key)
      const assignments = manualAssignments[key] ?? []
      const uniqueManualIds = [...new Set(assignments.map(assignment => assignment.canonicalPlayerId))]
      const conflict = uniqueManualIds.length > 1
      const manual = !conflict && assignments.length ? assignments[assignments.length - 1] : null
      const status = conflict ? "conflict" as const : manual || automatic?.status === "resolved" ? "resolved" as const : automatic?.status === "ambiguous" ? "ambiguous" as const : "missing" as const
      return {
        historicalName: person.historicalName,
        originalSourceHandles: [...person.sourceHandles],
        factCount: person.factCount,
        factTypes: [...person.factTypes].map(([type, count]) => ({ type, count })),
        sourceSections: [...person.sourceSections],
        status,
        canonicalPlayerId: manual?.canonicalPlayerId ?? (status === "resolved" ? automatic?.canonicalPlayerId ?? null : null),
        canonicalPlayerName: manual?.canonicalPlayerName ?? (status === "resolved" ? automatic?.canonicalPlayerName ?? null : null),
        matchSource: manual ? "Manual Global Player selection" : automatic?.matchSource ?? null,
        manuallySelected: Boolean(manual),
      }
    }).sort((left, right) => {
      const priority = { conflict: 0, missing: 1, ambiguous: 2, resolved: 3 }
      return priority[left.status] - priority[right.status] || left.historicalName.localeCompare(right.historicalName)
    })
    const resolved = reviewedPeople.filter(person => person.status === "resolved").length
    const missing = reviewedPeople.filter(person => person.status === "missing").length
    const ambiguous = reviewedPeople.filter(person => person.status === "ambiguous").length
    const factsReady = reviewedPeople.filter(person => person.status === "resolved").reduce((total, person) => total + person.factCount, 0)
    const factsBlocked = reviewedPeople.filter(person => person.status !== "resolved").reduce((total, person) => total + person.factCount, 0)
    return { ...period, people: reviewedPeople, summary: { totalPeople: reviewedPeople.length, resolved, missing, ambiguous, needsChecking: reviewedPeople.length - resolved, factsReady, factsBlocked } }
  })
}
