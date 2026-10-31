export type MastersLiveStatsHole = { holeNumber: number; par: number; strokes: number }
export type MastersLiveStatsCard = {
  entryId: string
  playDayId: string
  dayNumber: 1 | 2 | 3 | 4
  status: "submitted" | "verified"
  scoreToPar: number | null
  holes: MastersLiveStatsHole[]
}
export type MastersLiveStatsChoice = { entryId: string; playDayId: string; timeSlotId: string }
export type MastersLiveStatsTimeSlot = { id: string; playDayId: string; startsAt: string }
export type MastersLiveStatsEntry = { entryId: string; playerId: string; name: string }
export type MastersLiveStatRow = { playerId: string; name: string; count: number; rank: number; verifiedHoles?: number }
export type MastersLiveStats = { aces: MastersLiveStatRow[]; eagles: MastersLiveStatRow[]; birdies: MastersLiveStatRow[]; pars: MastersLiveStatRow[]; bogeyFree: MastersLiveStatRow[] }

function rankTopThree(counts: Map<string, { playerId: string; name: string; count: number }>) {
  const sorted = [...counts.values()].filter((row) => row.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId))
  let previous: number | undefined
  let rank = 0
  return sorted.flatMap((row, index) => {
    if (row.count !== previous) { rank = index + 1; previous = row.count }
    return rank <= 3 ? [{ ...row, rank }] : []
  })
}

export function buildMastersLiveStats(input: { now: Date; cards: MastersLiveStatsCard[]; choices: MastersLiveStatsChoice[]; timeSlots: MastersLiveStatsTimeSlot[]; entries: MastersLiveStatsEntry[] }): MastersLiveStats {
  const entryById = new Map(input.entries.map((entry) => [entry.entryId, entry]))
  const count = () => new Map<string, { playerId: string; name: string; count: number }>()
  const result = { aces: count(), eagles: count(), birdies: count(), pars: count() }
  for (const card of input.cards) {
    if (card.status !== "verified") continue
    const entry = entryById.get(card.entryId)
    if (!entry) continue
    for (const hole of card.holes) {
      const bump = (target: Map<string, { playerId: string; name: string; count: number }>) => {
        const row = target.get(entry.entryId) ?? { playerId: entry.playerId, name: entry.name, count: 0 }
        row.count += 1; target.set(entry.entryId, row)
      }
      if (hole.strokes === 1) bump(result.aces)
      if (hole.strokes === hole.par - 2) bump(result.eagles)
      if (hole.strokes === hole.par - 1) bump(result.birdies)
      if (hole.strokes === hole.par) bump(result.pars)
    }
  }
  const slotById = new Map(input.timeSlots.map((slot) => [slot.id, slot]))
  const occurredRounds = new Map<string, Set<string>>()
  for (const choice of input.choices) {
    const slot = slotById.get(choice.timeSlotId)
    if (slot && new Date(slot.startsAt).getTime() <= input.now.getTime()) {
      const rounds = occurredRounds.get(choice.entryId) ?? new Set<string>(); rounds.add(choice.playDayId); occurredRounds.set(choice.entryId, rounds)
    }
  }
  const cardsByRound = new Map<string, MastersLiveStatsCard>()
  for (const card of input.cards) cardsByRound.set(`${card.entryId}:${card.playDayId}`, card)
  const bogeyFree = count()
  for (const entry of input.entries) {
    const rounds = occurredRounds.get(entry.entryId)
    if (!rounds?.size) continue
    let verifiedHoles = 0; let valid = true
    for (const playDayId of rounds) {
      const card = cardsByRound.get(`${entry.entryId}:${playDayId}`)
      if (!card || card.status !== "verified" || card.holes.length !== 18) { valid = false; break }
      if (card.holes.some((hole) => hole.strokes > hole.par)) { valid = false; break }
      verifiedHoles += card.holes.length
    }
    if (valid) bogeyFree.set(entry.entryId, { playerId: entry.playerId, name: entry.name, count: verifiedHoles })
  }
  return { aces: rankTopThree(result.aces), eagles: rankTopThree(result.eagles), birdies: rankTopThree(result.birdies), pars: rankTopThree(result.pars), bogeyFree: rankTopThree(bogeyFree).map((row) => ({ ...row, verifiedHoles: row.count })) }
}
