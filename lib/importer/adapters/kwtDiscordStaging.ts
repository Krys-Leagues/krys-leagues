import type { KwtDiscordSeason } from "./kwtDiscordEvidence.ts"
import { normalizeDiscordHistoricalName } from "./kwtDiscordEvidence.ts"

export type KwtExistingRecord = Record<string, unknown>
export type KwtIdentityReview = {
  sourceHandle: string
  historicalName?: string
  status: "resolved" | "ambiguous" | "unresolved"
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
}

export type KwtStagedFact = {
  factType: "placement" | "award" | "promotion" | "badge" | "annotation" | "recognition"
  season: number
  week: number | null
  sourceHandle: string
  canonicalPlayerId: string | null
  canonicalPlayerName: string | null
  identityStatus: KwtIdentityReview["status"]
  payload: Record<string, unknown>
  semanticKey: string
  sourceFingerprint: string
  sourceSha256: string
  sourceSection: string
  rawSourceText: string
  status: "ready" | "unresolved" | "ambiguous" | "existing" | "duplicate" | "conflict"
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`
  return JSON.stringify(value)
}

function fingerprint(value: unknown) {
  const input = stable(value)
  let hash = 2166136261
  for (let index = 0; index < input.length; index++) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return `kwt-discord-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function existingFingerprint(record: KwtExistingRecord) {
  const raw = record.raw_data && typeof record.raw_data === "object" ? record.raw_data as Record<string, unknown> : null
  return String(record.source_fingerprint ?? record.sourceFingerprint ?? record.fingerprint ?? raw?.source_fingerprint ?? raw?.sourceFingerprint ?? "")
}

export function stageKwtDiscordEvidence(season: KwtDiscordSeason, identities: KwtIdentityReview[], existingRecords: KwtExistingRecord[] = []) {
  const identityByHandle = new Map(identities.map(identity => [normalizeDiscordHistoricalName(identity.historicalName ?? identity.sourceHandle).toLocaleLowerCase(), identity]))
  const existingFingerprints = new Set(existingRecords.map(existingFingerprint).filter(Boolean))
  const staged: KwtStagedFact[] = []

  function add(factType: KwtStagedFact["factType"], week: number | null, sourceHandle: string, payload: Record<string, unknown>, rawSourceText: string, sourceSection: string) {
    const identity = identityByHandle.get(normalizeDiscordHistoricalName(sourceHandle).toLocaleLowerCase()) ?? { sourceHandle, status: "unresolved" as const, canonicalPlayerId: null, canonicalPlayerName: null }
    const identityKey = identity.canonicalPlayerId ?? `source:${sourceHandle}`
    const semanticKey = stable({ season: season.season, week, factType, identityKey, scope: payload.scope ?? null, division: payload.division ?? null, badgeType: payload.type ?? null, difficulty: payload.difficulty ?? null })
    const sourceFingerprint = fingerprint({ semanticKey, payload, sourceSha256: season.sourceSha256, sourceSection, rawSourceText })
    staged.push({ factType, season: season.season, week, sourceHandle, canonicalPlayerId: identity.canonicalPlayerId, canonicalPlayerName: identity.canonicalPlayerName, identityStatus: identity.status, payload, semanticKey, sourceFingerprint, sourceSha256: season.sourceSha256, sourceSection, rawSourceText, status: existingFingerprints.has(sourceFingerprint) ? "existing" : identity.status === "resolved" ? "ready" : identity.status })
  }

  for (const event of season.events) {
    for (const fact of event.placements) add("placement", event.week, fact.sourceHandle, { scope: fact.scope, division: fact.division, position: fact.position }, fact.raw, fact.scope === "overall" ? "OVERALL" : fact.division ?? "UNKNOWN")
    for (const fact of event.awards) add("award", event.week, fact.sourceHandle, { scope: fact.scope, division: fact.division, difficulty: fact.difficulty, score: fact.score }, fact.raw, fact.scope === "overall" ? "OVERALL" : fact.division ?? "UNKNOWN")
    for (const fact of event.promotions) add("promotion", event.week, fact.sourceHandle, { fromDivision: fact.fromDivision, destinationDivision: fact.destinationDivision }, fact.raw, fact.fromDivision ?? "UNKNOWN")
    for (const fact of event.badges) add("badge", event.week, fact.sourceHandle, { type: fact.type, multiplicity: fact.multiplicity, aceCount: fact.aceCount }, fact.raw, "BADGES")
    for (const fact of event.annotations) add("annotation", event.week, fact.sourceHandle, { text: fact.text }, fact.raw, "ANNOTATION")
    for (const fact of event.recognitions) add("recognition", event.week, fact.sourceHandle, { text: fact.text }, fact.raw, "RECOGNITION")
  }
  for (const fact of season.finals.placements) add("placement", null, fact.sourceHandle, { scope: fact.scope, division: fact.division, position: fact.position }, fact.raw, "SEASON FINALS")
  for (const fact of season.finals.recognitions) add("recognition", null, fact.sourceHandle, { text: fact.text }, fact.raw, "SEASON FINALS")

  const byFingerprint = new Map<string, KwtStagedFact[]>()
  const bySemanticKey = new Map<string, KwtStagedFact[]>()
  for (const fact of staged) {
    byFingerprint.set(fact.sourceFingerprint, [...(byFingerprint.get(fact.sourceFingerprint) ?? []), fact])
    bySemanticKey.set(fact.semanticKey, [...(bySemanticKey.get(fact.semanticKey) ?? []), fact])
  }
  for (const facts of byFingerprint.values()) if (facts.length > 1) for (const fact of facts) if (fact.status === "ready") fact.status = "duplicate"
  for (const facts of bySemanticKey.values()) {
    if (new Set(facts.map(fact => stable(fact.payload))).size > 1) for (const fact of facts) if (fact.status === "ready") fact.status = "conflict"
  }

  const unknownFields = season.events.flatMap(event => [
    ...(event.playerCount === null ? [{ week: event.week, field: "playerCount", reason: "not supplied" }] : []),
    ...Object.entries(event.badgeStatus).filter(([, status]) => status === "unknown").map(([type]) => ({ week: event.week, field: `badge.${type}`, reason: "not supplied / unknown" })),
  ])
  return {
    facts: staged,
    unknownFields,
    summary: {
      totalFacts: staged.length,
      ready: staged.filter(fact => fact.status === "ready").length,
      unresolved: staged.filter(fact => fact.status === "unresolved").length,
      ambiguous: staged.filter(fact => fact.status === "ambiguous").length,
      existing: staged.filter(fact => fact.status === "existing").length,
      duplicates: staged.filter(fact => fact.status === "duplicate").length,
      conflicts: staged.filter(fact => fact.status === "conflict").length,
      unknownFields: unknownFields.length,
    },
  }
}
