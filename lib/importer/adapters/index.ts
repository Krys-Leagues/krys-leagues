import { strokeAdapter } from "./strokeAdapter"
import type {
  ImportLeagueType,
  LeagueImportAdapter,
} from "./types"

const adapters: Partial<
  Record<ImportLeagueType, LeagueImportAdapter>
> = {
  stroke: strokeAdapter,
}

export function getImportAdapter(
  leagueType: ImportLeagueType
): LeagueImportAdapter {
  const adapter = adapters[leagueType]

  if (!adapter) {
    throw new Error(
      `Import adapter is not ready for league type: ${leagueType}`
    )
  }

  return adapter
}

export {
  strokeAdapter,
}

export type {
  ImportContext,
  ImportLeagueType,
  ImportPlayerMatch,
  ImportRowResult,
  ImportValidationError,
  LeagueImportAdapter,
} from "./types"