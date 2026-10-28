import "server-only"

import { NextResponse } from "next/server"
import { loadCommittedKwtKiwiRows } from "@/lib/kwt/kiwiAchievementsServer"
import { trustedTournamentClient } from "@/lib/tournaments/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const client = trustedTournamentClient()
    const pages = await client.from("kwt_championship_pages").select("id,season_number,week_number,course_code,title,article_title,story_body,artwork_storage_path,supporting_media,published_at").eq("status", "published").order("season_number", { ascending: false }).order("week_number", { ascending: false })
    if (pages.error) throw pages.error
    const awards = await client.from("kwt_trophy_awards").select("id,recipient_player_id,recipient_name_snapshot,award_scope,division,placement,award_category,status,batch_id").in("status", ["approved", "awarded"])
    if (awards.error) throw awards.error
    const batchIds = [...new Set((awards.data || []).map((award) => award.batch_id))]
    const batches = batchIds.length ? await client.from("kwt_trophy_batches").select("id,season_number,week_number,course_code").in("id", batchIds) : { data: [], error: null }
    if (batches.error) throw batches.error
    const batchMap = new Map((batches.data || []).map((batch) => [batch.id, batch]))
    const publicAwards = (awards.data || []).filter((award) => batchMap.has(award.batch_id)).map((award) => ({ ...award, imageUrl: `/api/trophies/kwt-awards/${award.id}/image`, playerUrl: `/players/${award.recipient_player_id}`, season: batchMap.get(award.batch_id)?.season_number, week: batchMap.get(award.batch_id)?.week_number, course: batchMap.get(award.batch_id)?.course_code }))
    const kiwiRows = await loadCommittedKwtKiwiRows({ season: 15, week: 1, eventIdentifier: "KWTS15W01", easyCourseCode: "RCE", hardCourseCode: "RCH", client })
    const verifiedAchievements = kiwiRows.filter((row) => row.badges.length > 0).map((row) => ({ playerId: row.playerId, screenName: row.screenName, division: row.division, easyScore: row.easyScore, hardScore: row.hardScore, easyBogeys: row.easyBogeys, hardBogeys: row.hardBogeys, badges: row.badges }))
    const publicPages = (pages.data || []).map((page) => ({ ...page, verified_achievements: page.season_number === 15 && page.week_number === 1 && page.course_code === "RCE/RCH" ? verifiedAchievements : [] }))
    return NextResponse.json({ pages: publicPages, awards: publicAwards }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "KWT championship memories are not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
