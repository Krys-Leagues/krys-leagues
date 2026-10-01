export type MastersManualStreamSlot = {
  slot: 1 | 2 | 3 | 4
  enabled: boolean
  name: string
  score: number
}

export type MastersManualStreamCard = {
  slots: MastersManualStreamSlot[]
  revision: number
  updated_at: string
}

export const DEFAULT_MASTERS_MANUAL_STREAM_SLOTS: MastersManualStreamSlot[] = [
  { slot: 1, enabled: true, name: "", score: 0 },
  { slot: 2, enabled: true, name: "", score: 0 },
  { slot: 3, enabled: true, name: "", score: 0 },
  { slot: 4, enabled: true, name: "", score: 0 },
]

export function formatManualGolfScore(score: number) {
  if (score === 0) return "E"
  return score > 0 ? `+${score}` : String(score)
}

export function parseManualGolfScore(value: string) {
  const normalized = value.trim()
  if (/^e$/i.test(normalized)) return 0
  if (!/^[+-]?\d+$/.test(normalized)) return null
  const score = Number(normalized)
  if (!Number.isSafeInteger(score) || score < -999 || score > 999) return null
  return score
}

export function updateManualStreamSlot(
  slots: MastersManualStreamSlot[],
  slotNumber: MastersManualStreamSlot["slot"],
  changes: Partial<Omit<MastersManualStreamSlot, "slot">>,
) {
  return slots.map((slot) => slot.slot === slotNumber ? { ...slot, ...changes } : slot)
}

export function visibleManualStreamSlots(slots: MastersManualStreamSlot[]) {
  return slots.filter((slot) => slot.enabled)
}

export function canToggleManualStreamSlot(
  slots: MastersManualStreamSlot[],
  slotNumber: MastersManualStreamSlot["slot"],
) {
  const target = slots.find((slot) => slot.slot === slotNumber)
  if (!target || !target.enabled) return true
  return visibleManualStreamSlots(slots).length > 2
}

export function normalizeManualStreamCard(value: unknown): MastersManualStreamCard | null {
  if (!value || typeof value !== "object") return null
  const raw = value as { slots?: unknown; revision?: unknown; updated_at?: unknown }
  if (!Array.isArray(raw.slots) || raw.slots.length !== 4 || !Number.isInteger(raw.revision)) return null

  const slots: MastersManualStreamSlot[] = []
  for (let index = 0; index < raw.slots.length; index += 1) {
    const item = raw.slots[index]
    if (!item || typeof item !== "object") return null
    const slot = item as Partial<MastersManualStreamSlot>
    if (
      slot.slot !== index + 1
      || typeof slot.enabled !== "boolean"
      || typeof slot.name !== "string"
      || !Number.isInteger(slot.score)
      || (slot.score as number) < -999
      || (slot.score as number) > 999
    ) return null
    slots.push({
      slot: slot.slot as MastersManualStreamSlot["slot"],
      enabled: slot.enabled,
      name: slot.name,
      score: slot.score as number,
    })
  }

  return {
    slots,
    revision: raw.revision as number,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
  }
}
