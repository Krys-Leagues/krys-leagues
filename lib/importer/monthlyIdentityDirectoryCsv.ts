import type { PlayerIdentityAlias } from "../identity/types.ts"
import { matchPlayers, type PlayerMatch } from "./matchPlayers.ts"
import type { PlayerIdentityLink } from "./loadPlayerIdentityLinks.ts"
import type { PlayerRecord } from "./loadPlayers.ts"

export type MonthlyIdentityDirectoryCsvRow = {
  identity_type: string
  source_player_id: string
  source_name: string
  discord_name: string
  discord_id: string
  active: string
  alias_id: string
  alias_name: string
  alias_normalized_name: string
  alias_source: string
  alias_verified: string
  historical_player_id: string
  mapped_canonical_player_id: string
}

export type MonthlyIdentityDirectorySnapshot = {
  rawPlayers: PlayerRecord[]
  aliases: PlayerIdentityAlias[]
  links: PlayerIdentityLink[]
  canonicalId: (playerId: string) => string
  matchNames: (names: string[]) => PlayerMatch[]
  rowCounts: { PLAYER: number; ALIAS: number; MAPPED: number }
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed === "" || trimmed.toLowerCase() === "null" ? null : trimmed
}

function booleanValue(value: string) {
  return value.trim().toLowerCase() === "true"
}

function aliasSource(value: string): PlayerIdentityAlias["source"] {
  return value === "manual" ||
    value === "import" ||
    value === "discord_name" ||
    value === "screen_name" ||
    value === "historical_alias"
    ? value
    : "unknown"
}

function parseCsvRows(csvText: string) {
  const records: string[][] = []
  let record: string[] = []
  let field = ""
  let quoted = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    const next = csvText[index + 1]
    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ",") {
      record.push(field)
      field = ""
    } else if (character === "\n" || character === "\r" && next === "\n") {
      record.push(field)
      records.push(record)
      record = []
      field = ""
      if (character === "\r") index += 1
    } else {
      field += character
    }
  }
  if (quoted) throw new Error("Identity directory CSV contains an unterminated quoted field.")
  if (field !== "" || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records
}

export function loadMonthlyIdentityDirectoryCsv(csvText: string): MonthlyIdentityDirectorySnapshot {
  const [header, ...values] = parseCsvRows(csvText.trim())
  if (!header?.length) throw new Error("Identity directory CSV has no header.")
  const rows = values.filter(row => row.some(value => value !== "")).map(row => {
    if (row.length !== header.length) throw new Error("Identity directory CSV has an inconsistent column count.")
    return Object.fromEntries(header.map((key, index) => [key, row[index]])) as unknown as MonthlyIdentityDirectoryCsvRow
  })
  const playerRows = rows.filter(row => row.identity_type === "PLAYER" && row.source_player_id.trim())
  const aliasRows = rows.filter(row => row.identity_type === "ALIAS" && row.alias_verified.trim().toLowerCase() === "true")
  const linkRows = rows.filter(row => row.identity_type === "MAPPED" && row.historical_player_id.trim() && row.mapped_canonical_player_id.trim())
  const links = linkRows.map(row => ({
    historicalPlayerId: row.historical_player_id.trim(),
    canonicalPlayerId: row.mapped_canonical_player_id.trim(),
  }))
  const direct = new Map(links.map(link => [link.historicalPlayerId, link.canonicalPlayerId]))
  const canonicalId = (playerId: string) => {
    const visited = new Set<string>()
    let current = playerId
    while (direct.has(current) && !visited.has(current)) {
      visited.add(current)
      current = direct.get(current)!
    }
    return current
  }
  const rawPlayers = playerRows.map(row => ({
    id: row.source_player_id.trim(),
    screen_name: row.source_name,
    discord_name: nullable(row.discord_name),
    discord_username: null,
    discord_id: nullable(row.discord_id),
    active: booleanValue(row.active),
  }))
  const aliases = aliasRows.map(row => ({
    id: row.alias_id.trim(),
    playerId: canonicalId(row.source_player_id.trim()),
    aliasName: row.alias_name,
    normalizedAlias: row.alias_normalized_name,
    source: aliasSource(row.alias_source),
    active: true,
    verified: true,
  }))
  return {
    rawPlayers,
    aliases,
    links,
    canonicalId,
    matchNames: (names) => matchPlayers(names, rawPlayers, aliases, links),
    rowCounts: {
      PLAYER: rows.filter(row => row.identity_type === "PLAYER").length,
      ALIAS: rows.filter(row => row.identity_type === "ALIAS").length,
      MAPPED: rows.filter(row => row.identity_type === "MAPPED").length,
    },
  }
}
