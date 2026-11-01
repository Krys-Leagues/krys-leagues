import type { KwtStagedFact } from "./kwtDiscordStaging.ts"
import type { KwtPersonWeekReview, KwtManualIdentityAssignment } from "./kwtDiscordWeekReview.ts"

export type KwtExceptionDecision = "preserve" | "exclude" | "unknown"
export type KwtFactReviewStatus = "Ready" | "Needs identity" | "Needs review" | "Conflict" | "Unknown preserved" | "Existing" | "Duplicate" | "Excluded"
export type KwtSeasonReviewDraft = {
  assignments: Record<string, KwtManualIdentityAssignment[]>
  exceptionDecisions: Record<string, KwtExceptionDecision>
  leftUnresolvedNames: string[]
  reviewedPeriods: string[]
}

export const emptyKwtSeasonReviewDraft = (): KwtSeasonReviewDraft => ({ assignments: {}, exceptionDecisions: {}, leftUnresolvedNames: [], reviewedPeriods: [] })
export const kwtSeasonReviewDraftKey = (sourceSha256: string) => `krys-leagues:kwt-season-9-review:${sourceSha256}`
export const kwtFactRenderKey = (fact: Pick<KwtStagedFact, "sourceFingerprint" | "sourceSection" | "factType">, periodKey: string, historicalName: string, occurrenceIndex: number) =>
  [fact.sourceFingerprint, periodKey, fact.sourceSection, historicalName, fact.factType, occurrenceIndex].map(value => encodeURIComponent(String(value))).join(":")
export function parseKwtSeasonReviewDraft(value: string | null): KwtSeasonReviewDraft {
  if (!value) return emptyKwtSeasonReviewDraft()
  try {
    const parsed = JSON.parse(value) as Partial<KwtSeasonReviewDraft>
    return { assignments: parsed.assignments ?? {}, exceptionDecisions: parsed.exceptionDecisions ?? {}, leftUnresolvedNames: parsed.leftUnresolvedNames ?? [], reviewedPeriods: parsed.reviewedPeriods ?? [] }
  } catch { return emptyKwtSeasonReviewDraft() }
}

function unusualReason(fact: KwtStagedFact) {
  if (fact.week === 4 && fact.factType === "award" && fact.payload.division === "Semi-Pro" && fact.payload.difficulty === "hard" && fact.payload.score === -28) return "Explicitly published -28 Semi-Pro Hard; preserve without silent correction."
  if (fact.week === 4 && fact.factType === "badge" && /3\s*-\s*@zanetti\.4/i.test(fact.rawSourceText)) return "Unusual Duck notation retained raw; multiplicity must not be inferred."
  return null
}

export function describeKwtFact(fact: KwtStagedFact) {
  const payload = fact.payload
  if (fact.factType === "placement") return `${payload.scope === "overall" ? "Overall" : payload.division ?? "Division"} placement: ${payload.position}`
  if (fact.factType === "award") return `Best ${payload.difficulty === "easy" ? "Easy" : "Hard"} award: ${payload.score}`
  if (fact.factType === "promotion") return `Promotion: ${payload.fromDivision ?? "unknown division"} → ${payload.destinationDivision}`
  if (fact.factType === "badge") return `${String(payload.type)} badge${payload.multiplicity ? ` ×${payload.multiplicity}` : ""}${payload.aceCount ? ` · ${payload.aceCount} aces` : ""}`
  if (fact.factType === "annotation") return `New Player annotation: ${payload.text}`
  return `Special recognition: ${payload.text}`
}

export function reviewKwtFact(fact: KwtStagedFact, decisions: Record<string, KwtExceptionDecision>) {
  const decision = decisions[fact.sourceFingerprint]
  const unusual = unusualReason(fact)
  let status: KwtFactReviewStatus
  if (decision === "exclude") status = "Excluded"
  else if (decision === "unknown") status = "Unknown preserved"
  else if (fact.status === "existing") status = "Existing"
  else if (fact.status === "duplicate") status = "Duplicate"
  else if (fact.status === "conflict" && !decision) status = "Conflict"
  else if (unusual && !decision) status = "Needs review"
  else if (fact.identityStatus !== "resolved") status = "Needs identity"
  else status = "Ready"
  return { ...fact, description: describeKwtFact(fact), status, unusualReason: unusual, decision: decision ?? null, requiresDecision: Boolean(unusual || fact.status === "conflict") }
}

export function buildKwtWeeklyReconciliation(periods: KwtPersonWeekReview[], facts: KwtStagedFact[], decisions: Record<string, KwtExceptionDecision>, leftUnresolvedNames: string[], unknownFields: Array<{ week: number; field: string; reason: string }> = []) {
  const leftUnresolved = new Set(leftUnresolvedNames)
  return periods.map(period => {
    const periodFacts = facts.filter(fact => period.week === null ? fact.week === null : fact.week === period.week).map(fact => reviewKwtFact(fact, decisions))
    const people = period.people.map(person => ({ ...person, facts: periodFacts.filter(fact => fact.sourceHandle.toLocaleLowerCase() === person.historicalName.toLocaleLowerCase()), explicitlyLeftUnresolved: leftUnresolved.has(person.historicalName.toLocaleLowerCase()) }))
    const exceptions = periodFacts.filter(fact => fact.requiresDecision || fact.status === "Conflict")
    const identityComplete = people.every(person => person.status === "resolved" || person.explicitlyLeftUnresolved)
    const decisionsComplete = exceptions.every(fact => Boolean(decisions[fact.sourceFingerprint]))
    const conflicts = periodFacts.filter(fact => fact.status === "Conflict").length
    const periodUnknownFields = period.week === null ? [] : unknownFields.filter(field => field.week === period.week)
    return {
      ...period,
      people,
      facts: periodFacts,
      exceptions,
      unknownFields: periodUnknownFields,
      canMarkReviewed: identityComplete && decisionsComplete,
      reviewBlockers: { identityComplete, decisionsComplete },
      factSummary: {
        ready: periodFacts.filter(fact => fact.status === "Ready").length,
        needsReview: periodFacts.filter(fact => fact.status === "Needs review").length,
        conflicts,
        existing: periodFacts.filter(fact => fact.status === "Existing").length,
        duplicates: periodFacts.filter(fact => fact.status === "Duplicate").length,
        blocked: periodFacts.filter(fact => ["Needs identity", "Needs review", "Conflict"].includes(fact.status)).length,
        unknownFields: periodUnknownFields.length,
      },
    }
  })
}
