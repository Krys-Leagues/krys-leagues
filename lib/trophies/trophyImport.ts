export type TrophyImportCandidate = {
  key: string
  playerName: string
  playerId: string | null
  eventType: string
  eventName: string
  leagueType: string
  division: string
  placement: string
  season: string
  month: string
  trophyTitle: string
  imageUrl: string
  sourceKey: string
  status: "ready" | "needs-player" | "duplicate"
}

const MONTHS = new Map([
  ["january", "January"], ["february", "February"], ["march", "March"],
  ["april", "April"], ["may", "May"], ["june", "June"],
  ["july", "July"], ["august", "August"], ["september", "September"],
  ["october", "October"], ["november", "November"], ["december", "December"],
])

function titleCaseDivision(value: string) {
  return value
    .replace(/([a-z])([0-9])/gi, "$1 $2")
    .replace(/semipro/gi, "Semi Pro")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function decodeSegment(value: string) {
  try { return decodeURIComponent(value) } catch { return value }
}

export function normalizeTrophyPlayerName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "")
}

export function resolveTrophyPlayer(name: string, players: Array<{ id: string; screenName: string; verifiedAliases: string[] }>) {
  const normalized = normalizeTrophyPlayerName(name)
  if (!normalized) return null
  const matches = players.filter((player) => [player.screenName, ...player.verifiedAliases].some((candidate) => normalizeTrophyPlayerName(candidate) === normalized))
  const canonicalIds = new Set(matches.map((player) => player.id))
  return canonicalIds.size === 1 ? matches[0] : null
}

export type TrophyDuplicateComparable = {
  playerId: string | null
  playerName: string
  trophyTitle: string
  eventType: string
  eventName: string
  leagueType: string
  division: string
  placement: string
  season: string
  month: string
  imageUrl?: string | null
  sourceKey?: string | null
}

export function trophySemanticKey(value: TrophyDuplicateComparable) {
  return [value.playerId || normalizeTrophyPlayerName(value.playerName), value.trophyTitle, value.eventType, value.eventName, value.leagueType, value.division, value.placement, value.season, value.month]
    .map((part) => String(part || "").trim().toLocaleLowerCase().replace(/\s+/g, " "))
    .join("|")
}

function hasSpecificTrophyIdentity(value: TrophyDuplicateComparable) {
  const normalize = (part: string) => part.trim().toLocaleLowerCase().replace(/\s+/g, " ")
  const title = normalize(value.trophyTitle)
  const eventName = normalize(value.eventName)
  const genericLabels = new Set([
    "",
    normalize(value.placement),
    normalize(value.eventType),
    "trophy",
  ])
  return Boolean(eventName || (title && !genericLabels.has(title)))
}

export function findTrophyDuplicate(candidate: TrophyDuplicateComparable, existing: TrophyDuplicateComparable[]) {
  if (candidate.sourceKey) {
    const sourceMatch = existing.find((trophy) => trophy.sourceKey === candidate.sourceKey)
    if (sourceMatch) return { kind: "source" as const, trophy: sourceMatch }
  }
  if (candidate.imageUrl) {
    const imageMatch = existing.find((trophy) => trophy.imageUrl === candidate.imageUrl)
    if (imageMatch) return { kind: "image" as const, trophy: imageMatch }
  }
  if (!hasSpecificTrophyIdentity(candidate)) return null
  const semanticKey = trophySemanticKey(candidate)
  const achievementMatch = existing.find((trophy) =>
    hasSpecificTrophyIdentity(trophy) && trophySemanticKey(trophy) === semanticKey,
  )
  return achievementMatch ? { kind: "achievement" as const, trophy: achievementMatch } : null
}

export function parseTrophyAsset(imageUrl: string): TrophyImportCandidate | null {
  const decodedUrl = imageUrl.split("/").map(decodeSegment).join("/")
  const parts = decodedUrl.split("/").filter(Boolean)
  const monthlyIndex = parts.findIndex((part) => part.toLowerCase() === "monthly")
  if (monthlyIndex < 0 || parts.length < monthlyIndex + 5) return null

  const year = parts[monthlyIndex + 1]
  const rawMonth = parts[monthlyIndex + 2]
  const folderDivision = parts[monthlyIndex + 3]
  const filename = parts.at(-1)?.replace(/\.[^.]+$/, "") || ""
  const month = MONTHS.get(rawMonth.toLowerCase()) || rawMonth
  const named = filename.match(/^KrysMonthly_(\d{4})_([^_]+)_(.+?)_(1st|2nd|3rd)_(.+)$/i)
  const parsedDivision = named?.[3] || folderDivision
  const placement = named?.[4] || ""
  const playerName = named?.[5] || ""
  const division = titleCaseDivision(parsedDivision)

  return {
    key: imageUrl,
    playerName,
    playerId: null,
    eventType: "Monthly",
    eventName: `${month} ${year} Monthly`,
    leagueType: "monthly",
    division,
    placement,
    season: year,
    month: `${month} ${year}`,
    trophyTitle: placement ? `${division} · ${placement} Place` : `${division} Monthly Trophy`,
    imageUrl,
    sourceKey: `asset:${imageUrl}`,
    status: playerName ? "ready" : "needs-player",
  }
}
