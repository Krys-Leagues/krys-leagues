export const MGA_ROOM_PREFIX = "KMGA"

function canonicalNumber(value: string) {
  const digits = value.trim()
  if (!/^\d{1,5}$/.test(digits)) return null
  const number = Number(digits)
  return Number.isSafeInteger(number) && number > 0 ? `${MGA_ROOM_PREFIX}${number}` : null
}

export function normalizeMgaRoomNameInput(value: string) {
  const normalized = value.trim().toUpperCase()
  const digits = normalized.startsWith(MGA_ROOM_PREFIX)
    ? normalized.slice(MGA_ROOM_PREFIX.length).trim()
    : normalized
  return canonicalNumber(digits)
}

export function roomNumberName(value: string) {
  const match = /^KMGA\s*(\d{1,5})$/i.exec(value.trim())
  return match ? canonicalNumber(match[1]) : null
}
