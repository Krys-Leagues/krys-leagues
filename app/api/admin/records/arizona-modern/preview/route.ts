import { createClient } from "@supabase/supabase-js"

import type { IdentityPlayer, PlayerIdentityAlias } from "@/lib/identity"
import { normalizeIdentity } from "@/lib/identity"
import { previewIdentity } from "@/lib/all-time/arizona/identity"
import {
  parseLegacyCombinedCsv,
  reconcileLegacyCombinedRows,
} from "@/lib/all-time/arizona/legacy"
import { buildPreviewRows } from "@/lib/all-time/arizona/scoring"
import type {
  BestRecordSnapshot,
  IdentityPreview,
} from "@/lib/all-time/arizona/types"
import { parseArizonaModernWorkbook } from "@/lib/all-time/arizona/xlsm"

export const runtime = "nodejs"

type PlayerRow = {
  id: string
  screen_name: string
  discord_name: string | null
  discord_id: string | null
  active: boolean
}

type AliasRow = {
  id: string
  player_id: string
  alias: string
  normalized_alias: string | null
  source: string | null
  verified: boolean
}

type IdentityLinkRow = {
  historical_player_id: string
  canonical_player_id: string
}

function bearerToken(request: Request) {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ")
  return scheme?.toLowerCase() === "bearer" && token ? token : null
}

export async function POST(request: Request) {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: "Authentication is required." }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    return Response.json({ error: "The session is invalid." }, { status: 401 })
  }
  const { data: authorized, error: authorizationError } = await supabase.rpc(
    "is_current_user_site_admin"
  )
  if (authorizationError || !authorized) {
    return Response.json({ error: "Site-admin authorization is required." }, { status: 403 })
  }

  const form = await request.formData()
  const workbookFiles = form
    .getAll("workbooks")
    .filter((value): value is File => value instanceof File)
    .sort((left, right) => left.name.localeCompare(right.name))
  const legacyFiles = form
    .getAll("legacyCsvs")
    .filter((value): value is File => value instanceof File)

  if (workbookFiles.length === 0 && legacyFiles.length === 0) {
    return Response.json({ error: "Select at least one pilot fixture." }, { status: 400 })
  }
  if (workbookFiles.length > 2 || legacyFiles.length > 2) {
    return Response.json(
      { error: "The Arizona pilot accepts at most two workbooks and two legacy CSVs." },
      { status: 400 }
    )
  }

  try {
    const workbookResults = await Promise.all(
      workbookFiles.map(async (file) =>
        parseArizonaModernWorkbook(new Uint8Array(await file.arrayBuffer()), file.name)
      )
    )
    const legacyResults = await Promise.all(
      legacyFiles.map(async (file) =>
        parseLegacyCombinedCsv(await file.text(), file.name)
      )
    )

    const [
      { data: playerData, error: playerError },
      { data: aliasData, error: aliasError },
      { data: linkData, error: linkError },
    ] =
      await Promise.all([
        supabase
          .from("players")
          .select("id, screen_name, discord_name, discord_id, active")
          .order("screen_name"),
        supabase
          .from("player_aliases")
          .select("id, player_id, alias, normalized_alias, source, verified")
          .eq("verified", true)
          .order("alias"),
        supabase
          .from("player_identity_links")
          .select("historical_player_id, canonical_player_id"),
      ])
    if (playerError) throw new Error(`Could not load canonical players: ${playerError.message}`)
    if (aliasError) throw new Error(`Could not load player aliases: ${aliasError.message}`)
    if (linkError) throw new Error(`Could not load canonical identity links: ${linkError.message}`)

    const directCanonicalIds = new Map(
      ((linkData ?? []) as IdentityLinkRow[]).map((row) => [
        row.historical_player_id,
        row.canonical_player_id,
      ])
    )
    function canonicalPlayerId(playerId: string) {
      const visited = new Set<string>()
      let current = playerId
      while (directCanonicalIds.has(current) && !visited.has(current)) {
        visited.add(current)
        current = directCanonicalIds.get(current)!
      }
      return current
    }
    const rawPlayers = (playerData ?? []) as PlayerRow[]
    const canonicalScreenNames = new Map(
      rawPlayers.map((row) => [row.id, row.screen_name])
    )

    const players: IdentityPlayer[] = rawPlayers.map((row) => ({
      id: canonicalPlayerId(row.id),
      screenName: row.screen_name,
      discordName: row.discord_name,
      discordId: row.discord_id,
      active: row.active,
    }))
    const aliases: PlayerIdentityAlias[] = ((aliasData ?? []) as AliasRow[]).map((row) => ({
      id: row.id,
      playerId: canonicalPlayerId(row.player_id),
      aliasName: row.alias,
      normalizedAlias: row.normalized_alias ?? normalizeIdentity(row.alias),
      source:
        row.source === "manual" ||
        row.source === "import" ||
        row.source === "discord_name" ||
        row.source === "screen_name" ||
        row.source === "historical_alias"
          ? row.source
          : "unknown",
      firstSeenLeague: null,
      firstSeenSeason: null,
      lastSeenLeague: null,
      lastSeenSeason: null,
      active: row.verified,
    }))

    const allRecords = workbookResults.flatMap((result) => result.records)
    const legacyRows = legacyResults.flatMap((result) => result.rows)
    const names = new Set([
      ...allRecords.map((row) => row.historicalPlayerName),
      ...legacyRows.map((row) => row.historicalPlayerName),
    ])
    const identities = new Map<string, IdentityPreview>()
    for (const name of names) {
      const identity = previewIdentity(name, players, aliases)
      if (identity.playerId) {
        identity.canonicalScreenName = canonicalScreenNames.get(identity.playerId) ?? identity.canonicalScreenName
      }
      identities.set(name, identity)
    }

    let existingBest: BestRecordSnapshot[] = []
    let foundationInstalled = true
    const { data: bestData, error: bestError } = await supabase
      .from("all_time_best_records")
      .select("player_id, score, course:all_time_courses!inner(code)")
    if (bestError) {
      foundationInstalled = false
    } else {
      existingBest = (bestData ?? []).flatMap((row) => {
        const course = Array.isArray(row.course) ? row.course[0] : row.course
        if (!course || (course.code !== "AME" && course.code !== "AMH")) return []
        return [{
          courseCode: course.code,
          playerId: canonicalPlayerId(row.player_id),
          score: row.score,
        }]
      })
    }

    const previewRows = buildPreviewRows(allRecords, identities, existingBest)
    const categoryCounts = previewRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.category] = (counts[row.category] ?? 0) + 1
      return counts
    }, {})

    return Response.json({
      foundationInstalled,
      sourceRowsScanned: allRecords.length,
      workbookResults: workbookResults.map((result) => ({
        sourceFilename: result.sourceFilename,
        sourceFileHash: result.sourceFileHash,
        sourceCourseName: result.sourceCourseName,
        recordCount: result.records.length,
        issues: result.issues,
      })),
      categoryCounts,
      previewRows,
      legacy: {
        reconciliation: reconcileLegacyCombinedRows(
          legacyRows,
          identities,
          104,
          new Set(rawPlayers.map((player) => player.id).filter((id) => canonicalPlayerId(id) === id))
        ),
        issues: legacyResults.flatMap((result) => result.issues),
        rows: legacyRows,
      },
      identityFollowUps: [...identities.values()].filter(
        (identity) => identity.status !== "resolved"
      ),
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The preview could not be generated." },
      { status: 400 }
    )
  }
}
