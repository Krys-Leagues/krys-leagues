export const HANDICAP_ADMIN_PRODUCTION_TABLES = [
  "handicap_rounds",
  "course_ratings",
  "handicap_differentials",
  "handicap_index",
] as const

export const HANDICAP_REVIEW_PERSISTENCE_TABLES = [
  "handicap_calculation_runs",
  "handicap_rating_snapshots",
  "handicap_index_snapshots",
  "handicap_review_evidence",
  "handicap_review_decisions",
  "handicap_source_provenance",
] as const

type CountQueryResult = {
  count: number | null
  error: unknown | null
}

export type HandicapAdminTableStatus = Readonly<{
  status: "AVAILABLE" | "UNAVAILABLE"
  count: number | null
}>

export type HandicapAdminProductionData = Readonly<{
  legacy: Readonly<Record<(typeof HANDICAP_ADMIN_PRODUCTION_TABLES)[number], HandicapAdminTableStatus>>
  persistence: Readonly<Record<(typeof HANDICAP_REVIEW_PERSISTENCE_TABLES)[number], HandicapAdminTableStatus>>
}>

type ReadOnlySupabaseClient = {
  from(table: string): {
    select(columns: string, options: { count: "exact"; head: true }): PromiseLike<CountQueryResult>
  }
}

async function readCount(client: ReadOnlySupabaseClient, table: string): Promise<HandicapAdminTableStatus> {
  try {
    const result = await client.from(table).select("*", { count: "exact", head: true })
    if (result.error) return { status: "UNAVAILABLE", count: null }
    return { status: "AVAILABLE", count: result.count ?? 0 }
  } catch {
    return { status: "UNAVAILABLE", count: null }
  }
}

async function readTableGroup<const T extends readonly string[]>(
  client: ReadOnlySupabaseClient,
  tables: T,
): Promise<Readonly<Record<T[number], HandicapAdminTableStatus>>> {
  const entries = await Promise.all(
    tables.map(async (table) => [table, await readCount(client, table)] as const),
  )
  return Object.fromEntries(entries) as Readonly<Record<T[number], HandicapAdminTableStatus>>
}

/**
 * Reads only count/status metadata. Callers must authorize before invoking this
 * function; it intentionally never selects row contents or private evidence.
 */
export async function readHandicapAdminProductionData(
  client: ReadOnlySupabaseClient,
): Promise<HandicapAdminProductionData> {
  const [legacy, persistence] = await Promise.all([
    readTableGroup(client, HANDICAP_ADMIN_PRODUCTION_TABLES),
    readTableGroup(client, HANDICAP_REVIEW_PERSISTENCE_TABLES),
  ])
  return { legacy, persistence }
}
