export type BracketSize = 32 | 64

export type BracketEntrant = {
  seed: number
  playerId: string
  displayName: string
}

export type BracketSlot =
  | { type: "seed"; seed: number }
  | { type: "match"; matchId: string; outcome: "winner" }

export type BracketMatchResult = {
  winnerPlayerId: string
  loserPlayerId: string
  scoreLabel: string
  evidenceReference: string
  verifiedByAuthUserId: string
  recordedAt: string
  idempotencyKey: string
}

export type BracketMatch = {
  id: string
  round: number
  matchNumber: number
  label: string
  slotA: BracketSlot
  slotB: BracketSlot
  result: BracketMatchResult | null
}

export type TournamentBracket = {
  id: string
  name: string
  size: BracketSize
  revision: number
  status: "draft" | "registration_open" | "registration_closed" | "live" | "completed" | "cancelled"
  entrants: BracketEntrant[]
  matches: BracketMatch[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requireUuid(value: string, field: string) {
  if (!UUID.test(value)) throw new Error(`${field} must be a UUID`)
}

function requireText(value: string, field: string, max = 160) {
  if (!value.trim() || value.length > max) throw new Error(`${field} is required and must be at most ${max} characters`)
}

export function bracketRounds(size: BracketSize) {
  return Math.log2(size)
}

export function bracketMatchCount(size: BracketSize) {
  return size - 1
}

export function validateRegistrationCapacity(size: BracketSize, confirmedCount: number) {
  if (!Number.isInteger(confirmedCount) || confirmedCount < 0) throw new Error("Confirmed registration count must be a non-negative integer")
  if (confirmedCount > size) throw new Error(`This ${size}-player bracket is full`)
  return { confirmedCount, remainingPlaces: size - confirmedCount, ready: confirmedCount === size }
}

export function autoPlaceEntrants(players: Array<{ playerId: string; displayName: string }>): BracketEntrant[] {
  return [...players]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }))
    .map((player, index) => ({ ...player, seed: index + 1 }))
}

export function generateSingleEliminationBracket(input: {
  id: string
  name: string
  size: BracketSize
  entrants: BracketEntrant[]
  status?: TournamentBracket["status"]
}): TournamentBracket {
  requireText(input.id, "Tournament id", 120)
  requireText(input.name, "Tournament name")
  if (input.entrants.length !== input.size) throw new Error(`A ${input.size}-player bracket requires exactly ${input.size} confirmed players`)

  const rounds = bracketRounds(input.size)
  const matches: BracketMatch[] = []
  for (let round = 1; round <= rounds; round += 1) {
    const matchCount = input.size / 2 ** round
    for (let matchNumber = 1; matchNumber <= matchCount; matchNumber += 1) {
      const id = `${input.id}-r${round}-m${matchNumber}`
      const label = round === rounds ? "Final" : `Round ${round} · Match ${matchNumber}`
      if (round === 1) {
        const firstSeed = (matchNumber - 1) * 2 + 1
        matches.push({ id, round, matchNumber, label, slotA: { type: "seed", seed: firstSeed }, slotB: { type: "seed", seed: firstSeed + 1 }, result: null })
      } else {
        const previousFirst = (matchNumber - 1) * 2 + 1
        matches.push({
          id,
          round,
          matchNumber,
          label,
          slotA: { type: "match", matchId: `${input.id}-r${round - 1}-m${previousFirst}`, outcome: "winner" },
          slotB: { type: "match", matchId: `${input.id}-r${round - 1}-m${previousFirst + 1}`, outcome: "winner" },
          result: null,
        })
      }
    }
  }

  return { id: input.id, name: input.name.trim(), size: input.size, revision: 1, status: input.status || "draft", entrants: input.entrants, matches }
}

export function validateTournamentBracket(bracket: TournamentBracket) {
  requireText(bracket.id, "Tournament id", 120)
  requireText(bracket.name, "Tournament name")
  if (!Number.isInteger(bracket.revision) || bracket.revision < 1) throw new Error("Revision must be a positive integer")
  if (bracket.entrants.length !== bracket.size) throw new Error(`Bracket must contain exactly ${bracket.size} entrants`)
  if (bracket.matches.length !== bracketMatchCount(bracket.size)) throw new Error(`Bracket must contain exactly ${bracketMatchCount(bracket.size)} matches`)

  const entrantIds = new Set<string>()
  const seeds = new Set<number>()
  for (const entrant of bracket.entrants) {
    requireUuid(entrant.playerId, "Entrant playerId")
    requireText(entrant.displayName, "Entrant displayName", 100)
    if (!Number.isInteger(entrant.seed) || entrant.seed < 1 || entrant.seed > bracket.size) throw new Error("Entrant seed is outside the selected bracket size")
    if (entrantIds.has(entrant.playerId)) throw new Error("Each canonical player may enter only once")
    if (seeds.has(entrant.seed)) throw new Error("Each seed may be assigned only once")
    entrantIds.add(entrant.playerId)
    seeds.add(entrant.seed)
  }

  const matches = new Map(bracket.matches.map((match) => [match.id, match]))
  if (matches.size !== bracket.matches.length) throw new Error("Match ids must be unique")
  const usedSources = new Set<string>()
  for (const match of bracket.matches) {
    if (!Number.isInteger(match.round) || match.round < 1 || match.round > bracketRounds(bracket.size)) throw new Error("Match round is invalid")
    for (const slot of [match.slotA, match.slotB]) {
      if (slot.type === "seed") {
        if (!seeds.has(slot.seed)) throw new Error(`Match ${match.id} references missing seed ${slot.seed}`)
      } else {
        const source = matches.get(slot.matchId)
        if (!source || source.round >= match.round) throw new Error("Match sources must come from an earlier round")
        if (usedSources.has(slot.matchId)) throw new Error(`Match source ${slot.matchId} is routed more than once`)
        usedSources.add(slot.matchId)
      }
    }
  }
  return bracket
}

export function resolveBracketSlot(bracket: TournamentBracket, slot: BracketSlot) {
  if (slot.type === "seed") return bracket.entrants.find((entrant) => entrant.seed === slot.seed) ?? null
  const source = bracket.matches.find((match) => match.id === slot.matchId)
  if (!source?.result) return null
  return bracket.entrants.find((entrant) => entrant.playerId === source.result?.winnerPlayerId) ?? null
}

export function recordBracketMatchResult(bracket: TournamentBracket, input: Omit<BracketMatchResult, "loserPlayerId"> & { matchId: string; expectedRevision: number }): TournamentBracket {
  validateTournamentBracket(bracket)
  if (input.expectedRevision !== bracket.revision) throw new Error("Bracket changed; reload before recording the result")
  if (bracket.status !== "live") throw new Error("Results may be recorded only while the tournament is live")
  const matchIndex = bracket.matches.findIndex((match) => match.id === input.matchId)
  if (matchIndex < 0) throw new Error("Match does not exist")
  const match = bracket.matches[matchIndex]
  if (match.result) {
    if (match.result.idempotencyKey === input.idempotencyKey && match.result.winnerPlayerId === input.winnerPlayerId) return bracket
    throw new Error("A different verified result already exists for this match")
  }
  const playerA = resolveBracketSlot(bracket, match.slotA)
  const playerB = resolveBracketSlot(bracket, match.slotB)
  if (!playerA || !playerB) throw new Error("Both match slots must resolve before a result can be recorded")
  if (![playerA.playerId, playerB.playerId].includes(input.winnerPlayerId)) throw new Error("Winner must be one of the resolved match participants")
  const loserPlayerId = input.winnerPlayerId === playerA.playerId ? playerB.playerId : playerA.playerId
  const matches = bracket.matches.map((item, index) => index === matchIndex ? { ...item, result: { ...input, loserPlayerId } } : item)
  return { ...bracket, revision: bracket.revision + 1, matches }
}

export function publicBracketProjection(bracket: TournamentBracket) {
  validateTournamentBracket(bracket)
  return {
    id: bracket.id,
    name: bracket.name,
    size: bracket.size,
    rounds: bracketRounds(bracket.size),
    status: bracket.status,
    matches: bracket.matches.map((match) => ({
      id: match.id,
      round: match.round,
      label: match.label,
      playerAName: resolveBracketSlot(bracket, match.slotA)?.displayName ?? null,
      playerBName: resolveBracketSlot(bracket, match.slotB)?.displayName ?? null,
      scoreLabel: match.result?.scoreLabel ?? null,
      winnerName: match.result ? bracket.entrants.find((entrant) => entrant.playerId === match.result?.winnerPlayerId)?.displayName ?? null : null,
    })),
  }
}
