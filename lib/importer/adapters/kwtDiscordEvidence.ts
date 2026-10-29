import type { CompetitionDirectoryPlayer } from "./competitionPreview.ts"

export type EvidenceScope = "division" | "overall" | "season-final"
export type EvidenceStatus = "supplied" | "explicit-zero" | "unknown"

export type KwtPlacementFact = { scope: EvidenceScope; division: string | null; position: number; sourceHandle: string; raw: string }
export type KwtAwardFact = { scope: "division" | "overall"; division: string | null; difficulty: "easy" | "hard"; score: number; sourceHandle: string; raw: string }
export type KwtPromotionFact = { sourceHandle: string; fromDivision: string | null; destinationDivision: string; raw: string }
export type KwtBadgeFact = { type: "coconut" | "diamond" | "cactus" | "duck" | "beetle"; sourceHandle: string; multiplicity: number | null; aceCount: number | null; raw: string }
export type KwtSourceMessage = { sourceKey: string; section: string; rawText: string }

export type KwtDiscordEvent = {
  season: number
  week: number
  course: string
  playerCount: number | null
  rawText: string
  sourceMessages: KwtSourceMessage[]
  placements: KwtPlacementFact[]
  awards: KwtAwardFact[]
  promotions: KwtPromotionFact[]
  badges: KwtBadgeFact[]
  badgeStatus: Record<KwtBadgeFact["type"], EvidenceStatus>
  annotations: Array<{ sourceHandle: string; text: string; raw: string }>
  recognitions: Array<{ sourceHandle: string; text: string; raw: string }>
  warnings: string[]
}

export type KwtDiscordSeason = {
  season: number
  sourceSha256: string
  events: KwtDiscordEvent[]
  finals: { placements: KwtPlacementFact[]; recognitions: Array<{ sourceHandle: string; text: string; raw: string }>; rawText: string }
}

const divisions = new Map([["AMATEUR", "Amateur"], ["SEMI-PRO", "Semi-Pro"], ["PRO", "Pro"], ["ELITE", "Elite"]])
const badgeTypes = ["coconut", "diamond", "cactus", "duck", "beetle"] as const

function handles(value: string) {
  return [...value.matchAll(/@([\p{L}\p{N}_.-]+)/gu)].map(match => match[1])
}

function eventParts(raw: string) {
  const lines = raw.split(/\r?\n/).map(line => line.trim())
  const placements: KwtPlacementFact[] = []
  const awards: KwtAwardFact[] = []
  const promotions: KwtPromotionFact[] = []
  const badges: KwtBadgeFact[] = []
  const annotations: KwtDiscordEvent["annotations"] = []
  const recognitions: KwtDiscordEvent["recognitions"] = []
  const badgeStatus = Object.fromEntries(badgeTypes.map(type => [type, "unknown"])) as KwtDiscordEvent["badgeStatus"]
  const warnings: string[] = []
  let division: string | null = null
  let scope: EvidenceScope = "division"
  let badgeType: KwtBadgeFact["type"] | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/source annotation:\s*"New Player"/i.test(line)) {
      const annotatedHandle = line.match(/@([\p{L}\p{N}_.-]+)(?:\s*[—-])?\s+source annotation:\s*"New Player"/iu)?.[1]
      if (annotatedHandle) annotations.push({ sourceHandle: annotatedHandle, text: "New Player", raw: line })
    }
    if (divisions.has(line)) { division = divisions.get(line)!; scope = "division"; badgeType = null; continue }
    if (/^OVERALL(?: TOP 10)?$/.test(line)) { division = null; scope = "overall"; badgeType = null; continue }
    if (line === "BADGES") { division = null; badgeType = null; continue }
    const badgeHeader = line.match(/^(Coconut|Diamond|Cactus|Duck|Beetle):$/i)
    if (badgeHeader) { badgeType = badgeHeader[1].toLowerCase() as KwtBadgeFact["type"]; badgeStatus[badgeType] = "supplied"; continue }
    if (/NOT SUPPLIED|UNKNOWN/.test(line) && badgeType) { badgeStatus[badgeType] = "unknown"; continue }
    if (/^(?:0|NONE)$/i.test(line) && badgeType) { badgeStatus[badgeType] = "explicit-zero"; continue }

    const placement = line.match(/^(\d+)(?:st|nd|rd|th)\s+(.+)$/i)
    if (placement && (division || scope === "overall")) {
      for (const sourceHandle of handles(placement[2])) placements.push({ scope, division, position: Number(placement[1]), sourceHandle, raw: line })
      continue
    }

    const standardAwardHeader = line.match(/^Best\s+(Overall\s+)?(Easy|Hard):$/i)
    const alternateOverallAwardHeader = line.match(/^Best\s+(Easy|Hard)\s+Overall:$/i)
    if (standardAwardHeader || alternateOverallAwardHeader) {
      const isOverall = Boolean(standardAwardHeader?.[1] || alternateOverallAwardHeader)
      const difficulty = (standardAwardHeader?.[2] ?? alternateOverallAwardHeader![1]).toLowerCase() as "easy" | "hard"
      const factLine = lines.slice(index + 1).find(candidate => /^-?\d+\s+@/.test(candidate))
      const score = factLine?.match(/^(-?\d+)/)?.[1]
      if (factLine && score) for (const sourceHandle of handles(factLine)) awards.push({ scope: isOverall || scope === "overall" ? "overall" : "division", division: isOverall || scope === "overall" ? null : division, difficulty, score: Number(score), sourceHandle, raw: `${line} ${factLine}` })
      continue
    }

    const promotion = line.match(/^Promotions?\s*->\s*(Semi-Pro|Pro|Elite):$/i)
    if (promotion) {
      for (let next = index + 1; next < lines.length && (!lines[next] || lines[next].startsWith("@")); next++) {
        for (const sourceHandle of handles(lines[next])) promotions.push({ sourceHandle, fromDivision: division, destinationDivision: promotion[1], raw: `${line} ${lines[next]}` })
      }
      continue
    }

    if (badgeType && handles(line).length) {
      const aceCount = badgeType === "diamond" ? Number(line.match(/(\d+)\s+ACES/i)?.[1] ?? "") || null : null
      const multiplicity = Number(line.match(/X(\d+)/i)?.[1] ?? "") || null
      for (const sourceHandle of handles(line)) badges.push({ type: badgeType, sourceHandle, multiplicity, aceCount, raw: line })
    }
    if (/\d+(?:TH|ST|ND|RD) WIN/i.test(line)) for (const sourceHandle of handles(line)) recognitions.push({ sourceHandle, text: line.replace(/^.*?—\s*/, ""), raw: line })
  }

  if (/Week 8 is ONE competition week|ONE:\s*Season 9 \/ Week 8/i.test(raw)) warnings.push("One event is backed by multiple consecutive Discord messages; do not split it.")
  if (/explicitly says -28 Hard/i.test(raw)) warnings.push("Preserve the explicitly published -28 Semi-Pro Hard fact without correction.")
  if (/3 - @zanetti\.4/.test(raw)) warnings.push("Duck notation '3 - @zanetti.4' is retained raw; multiplicity is not inferred.")
  if (/No Overall Best Easy\/Hard line was supplied|No explicit Overall Best Easy\/Hard lines supplied/i.test(raw)) warnings.push("Overall Best Easy/Hard was not supplied and remains unknown.")
  const sectionMatches = [...raw.matchAll(/^(AMATEUR|SEMI-PRO|PRO|ELITE|OVERALL(?: TOP 10)?|BADGES)$/gm)]
  const sourceMessages = sectionMatches.map((match, index) => {
    const section = match[1].replace(" TOP 10", "")
    const start = match.index!
    const end = sectionMatches[index + 1]?.index ?? raw.length
    return { sourceKey: section.toLowerCase().replace(/[^a-z]+/g, "-"), section, rawText: raw.slice(start, end).trim() }
  })
  return { placements, awards, promotions, badges, badgeStatus, annotations, recognitions, warnings, sourceMessages }
}

export function parseKwtSeason9DiscordEvidence(rawText: string, sourceSha256 = "unverified"): KwtDiscordSeason {
  const matches = [...rawText.matchAll(/^SEASON 9 WEEK (\d+) — ([^\r\n]+)$/gm)]
  const finalsAt = rawText.indexOf("SEASON 9 FINAL RESULTS")
  const events = matches.map((match, index) => {
    const start = match.index!
    const end = index + 1 < matches.length ? matches[index + 1].index! : finalsAt
    const raw = rawText.slice(start, end)
    const count = raw.match(/(?:—|Players:)\s*(\d+)\s*PLAYERS/i)?.[1]
    return { season: 9, week: Number(match[1]), course: match[2].trim(), playerCount: count ? Number(count) : null, rawText: raw, ...eventParts(raw) }
  })
  const finalsRaw = finalsAt >= 0 ? rawText.slice(finalsAt, rawText.indexOf("SEASON 9 COMPLETENESS", finalsAt)) : ""
  const finalPlacements: KwtPlacementFact[] = []
  let finalDivision: string | null = null
  for (const rawLine of finalsRaw.split(/\r?\n/)) {
    const line = rawLine.trim()
    const divisionHeader = line.match(/^(ELITE|PRO|SEMI-PRO|AMATEUR) SEASON 9 TOP 10$/)
    if (divisionHeader) { finalDivision = divisions.get(divisionHeader[1])!; continue }
    if (line === "SEASON 9 OVERALL TOP 10") { finalDivision = null; continue }
    const placement = line.match(/^(\d+)(?:st|nd|rd|th)\s+(.+)$/i)
    if (placement) for (const sourceHandle of handles(placement[2])) finalPlacements.push({ scope: "season-final", division: finalDivision, position: Number(placement[1]), sourceHandle, raw: line })
  }
  const champion = finalsRaw.match(/CHAMP with 11 weekly wins out of 12 weeks of play is (@[\w.-]+)/i)
  const finalRecognitions = champion ? [{ sourceHandle: champion[1].slice(1), text: "Season 9 Champion — 11 weekly wins out of 12 weeks of play", raw: champion[0] }] : []
  return { season: 9, sourceSha256, events, finals: { placements: finalPlacements, recognitions: finalRecognitions, rawText: finalsRaw } }
}

export function normalizeDiscordHistoricalName(value: string) {
  return String(value ?? "").trim().replace(/^@/, "").trim()
}

const explicitAliases: Record<string, string> = { rimblas: "El Jorge", harry2939: "Maximus", g8r4l: "Shooter McGavin" }
export function reconcileKwtDiscordIdentities(season: KwtDiscordSeason, players: CompetitionDirectoryPlayer[], options: { removeLeadingAt?: boolean } = {}) {
  const removeLeadingAt = options.removeLeadingAt !== false
  const lookupKey = (value: string) => (removeLeadingAt ? normalizeDiscordHistoricalName(value) : String(value ?? "").trim()).toLocaleLowerCase()
  const sourceHandles = [...season.events.flatMap(event => [...event.placements, ...event.awards, ...event.promotions, ...event.badges, ...event.annotations, ...event.recognitions].map(fact => fact.sourceHandle)), ...season.finals.placements.map(fact => fact.sourceHandle), ...season.finals.recognitions.map(fact => fact.sourceHandle)]
  const grouped = new Map<string, { historicalName: string; originalSourceHandles: Set<string>; factCount: number }>()
  for (const sourceHandle of sourceHandles) {
    const originalSourceHandle = sourceHandle.trim().startsWith("@") ? sourceHandle.trim() : `@${sourceHandle.trim()}`
    const historicalName = removeLeadingAt ? normalizeDiscordHistoricalName(originalSourceHandle) : originalSourceHandle.trim()
    const key = lookupKey(historicalName)
    const value = grouped.get(key) ?? { historicalName, originalSourceHandles: new Set<string>(), factCount: 0 }
    value.originalSourceHandles.add(originalSourceHandle)
    value.factCount += 1
    grouped.set(key, value)
  }
  return [...grouped.values()].map(group => {
    const aliasTarget = explicitAliases[lookupKey(group.historicalName)]
    const needle = lookupKey(aliasTarget ?? group.historicalName)
    type MatchSource = "Current name" | "Verified alias" | "Former name" | "Approved Season 9 alias"
    const candidateMatches: Array<{ player: CompetitionDirectoryPlayer; matchSource: MatchSource; matchedValue: string }> = []
    for (const player of players) {
      if (lookupKey(player.screenName) === needle) {
        candidateMatches.push({ player, matchSource: aliasTarget ? "Approved Season 9 alias" : "Current name", matchedValue: player.screenName })
        continue
      }
      const aliases = player.identityAliases ?? player.verifiedAliases.map(name => ({ name, source: null }))
      const alias = aliases.find(value => lookupKey(value.name) === needle)
      if (alias) candidateMatches.push({ player, matchSource: aliasTarget ? "Approved Season 9 alias" : alias.source === "historical_alias" ? "Former name" : "Verified alias", matchedValue: alias.name })
    }
    const unique = [...new Map(candidateMatches.map(match => [match.player.id, match])).values()]
    const resolved = unique.length === 1 ? unique[0] : null
    return {
      historicalName: group.historicalName,
      normalizedHistoricalName: group.historicalName,
      sourceHandle: [...group.originalSourceHandles][0],
      originalSourceHandles: [...group.originalSourceHandles],
      factCount: group.factCount,
      aliasUsed: aliasTarget ?? null,
      matchSource: resolved?.matchSource ?? null,
      matchedValue: resolved?.matchedValue ?? null,
      status: unique.length === 1 ? "resolved" as const : unique.length > 1 ? "ambiguous" as const : "unresolved" as const,
      canonicalPlayerId: resolved?.player.id ?? null,
      canonicalPlayerName: resolved?.player.screenName ?? null,
      candidates: unique.map(match => ({ id: match.player.id, screenName: match.player.screenName, matchSource: match.matchSource })),
    }
  })
}

export function summarizeKwtDiscordSeason(season: KwtDiscordSeason) {
  const events = season.events
  return {
    weeks: events.length,
    finalsRecognized: season.finals.placements.length > 0,
    divisionPlacementFacts: events.flatMap(event => event.placements).filter(fact => fact.scope === "division").length,
    overallPlacementFacts: events.flatMap(event => event.placements).filter(fact => fact.scope === "overall").length,
    bestEasyFacts: events.flatMap(event => event.awards).filter(fact => fact.difficulty === "easy").length,
    bestHardFacts: events.flatMap(event => event.awards).filter(fact => fact.difficulty === "hard").length,
    promotionFacts: events.flatMap(event => event.promotions).length,
    badgeFacts: Object.fromEntries(badgeTypes.map(type => [type, events.flatMap(event => event.badges).filter(fact => fact.type === type).length])),
    badgeMultiplicities: events.flatMap(event => event.badges).filter(fact => fact.multiplicity !== null).length,
    specialRecognitions: events.flatMap(event => event.recognitions).length + season.finals.recognitions.length,
    newPlayerAnnotations: events.flatMap(event => event.annotations).length,
    parserWarnings: events.flatMap(event => event.warnings),
  }
}
