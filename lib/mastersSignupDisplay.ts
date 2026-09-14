export const PLAYER_LOCAL_TIME_HEADING = "AVAILABLE TIMES — SHOWN IN YOUR LOCAL TIME"

export function meaningfulMajorSlotLabel(label: string | null | undefined) {
  const trimmed = label?.trim()
  return trimmed && !/^available$/i.test(trimmed) ? trimmed : null
}
