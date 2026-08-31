import { createClient } from "@supabase/supabase-js"
import { detailedCardStats, rankByCombinedTotal, rankByScore, type PublicCombinedRecord, type PublicCourse, type PublicSingleRecord } from "@/lib/all-time/public-records"

function publicRecordsClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error("Public Records server access is not configured.")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, view = params.get("view"), supabase = publicRecordsClient()
    const catalogQuery = () => supabase.from("all_time_courses").select("id, code, base_map, display_name, difficulty").eq("active", true).in("difficulty", ["Easy", "Hard"])
    if (view === "courses") {
      const { data, error } = await catalogQuery().order("display_name")
      if (error) throw error
      return Response.json({ courses: data ?? [] }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } })
    }
    if (view === "single") {
      const courseId = params.get("courseId")
      if (!courseId) return Response.json({ error: "courseId is required." }, { status: 400 })
      const { data: course, error: courseError } = await catalogQuery().eq("id", courseId).maybeSingle()
      if (courseError) throw courseError
      if (!course) return Response.json({ error: "Active course not found." }, { status: 404 })
      const { data, error } = await supabase.from("all_time_best_records").select("id, course_id, player_id, score, historical_player_name, best_observation_id, player:players(screen_name)").eq("course_id", course.id)
      if (error) throw error
      const records = (data ?? []) as Array<PublicSingleRecord & { best_observation_id: string }>
      const observationIds = records.map((record) => record.best_observation_id).filter(Boolean)
      const observations = observationIds.length ? await supabase.from("all_time_record_observations").select("id,hole_strokes").in("id", observationIds) : { data: [], error: null }
      if (observations.error) throw observations.error
      const cards = new Map((observations.data ?? []).map((observation) => [observation.id, observation.hole_strokes as number[] | null]))
      const coursePars = await supabase.from("all_time_courses").select("hole_pars").eq("id", course.id).maybeSingle()
      const publicRecords = records.map((record) => ({ ...record, detailed_stats: detailedCardStats(cards.get(record.best_observation_id), coursePars.error ? null : coursePars.data?.hole_pars as number[] | null) }))
      return Response.json({ course, records: rankByScore(publicRecords) }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
    }
    if (view === "combined") {
      const baseMap = params.get("baseMap")
      const { data: catalog, error: catalogError } = await catalogQuery().order("base_map")
      if (catalogError) throw catalogError
      const maps = [...new Set(((catalog ?? []) as PublicCourse[]).map(course => course.base_map))]
      if (!baseMap) return Response.json({ maps }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } })
      if (!maps.includes(baseMap)) return Response.json({ error: "Active map not found." }, { status: 404 })
      const { data, error } = await supabase.from("all_time_combined_best_records").select("id, base_map, player_id, easy_score, hard_score, combined_score, historical_player_name, player:players(screen_name)").eq("base_map", baseMap)
      if (error) throw error
      let combinedRows = (data ?? []) as PublicCombinedRecord[]
      if (!combinedRows.length) {
        const { data: legacy, error: legacyError } = await supabase.from("combined_course_records").select("id, player_id, player_name, course_name, easy_score, hard_score, combined_score, player:players(screen_name)").eq("course_name", baseMap)
        if (legacyError) throw legacyError
        combinedRows = (legacy ?? []).map(row => ({ id: row.id, base_map: row.course_name, player_id: row.player_id, easy_score: row.easy_score, hard_score: row.hard_score, combined_score: row.combined_score, historical_player_name: row.player_name, player: row.player })) as PublicCombinedRecord[]
      }
      return Response.json({ maps, records: rankByCombinedTotal(combinedRows) }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
    }
    if (view === "profile") {
      const playerId = params.get("playerId"), category = params.get("category")
      if (!playerId || !["Easy", "Hard", "Combined"].includes(category || "")) return Response.json({ error: "Valid playerId and category are required." }, { status: 400 })
      const { data: catalog, error: catalogError } = await catalogQuery().order("display_name")
      if (catalogError) throw catalogError
      const courses = (catalog ?? []) as PublicCourse[], combined = category === "Combined", difficulty = category === "Easy" ? "Easy" : "Hard"
      const rows: Array<{ key: string; rank: number | null; course: string; score: number } | { key: string; rank: number | null; course: string; easyScore: number; hardScore: number; totalScore: number }> = []
      if (!combined) {
        const results = await Promise.all(courses.filter(course => course.difficulty === difficulty).map(async course => ({ course, result: await supabase.from("all_time_best_records").select("id, course_id, player_id, score, historical_player_name, player:players(screen_name)").eq("course_id", course.id) })))
        for (const { course, result } of results) { if (result.error) throw result.error; const own = rankByScore((result.data ?? []) as PublicSingleRecord[]).find(row => row.player_id === playerId); if (own) rows.push({ key: course.id, rank: own.rank, course: course.base_map, score: own.score }) }
      } else {
        const maps = [...new Set(courses.map(course => course.base_map))]
        const results = await Promise.all(maps.map(async baseMap => {
          const result = await supabase.from("all_time_combined_best_records").select("id, base_map, player_id, easy_score, hard_score, combined_score, historical_player_name, player:players(screen_name)").eq("base_map", baseMap)
          if (result.error || result.data?.length) return { baseMap, rows: result.data as PublicCombinedRecord[] | null, error: result.error }
          const legacy = await supabase.from("combined_course_records").select("id, player_id, player_name, course_name, easy_score, hard_score, combined_score, player:players(screen_name)").eq("course_name", baseMap)
          return { baseMap, rows: legacy.data?.map(row => ({ id: row.id, base_map: row.course_name, player_id: row.player_id, easy_score: row.easy_score, hard_score: row.hard_score, combined_score: row.combined_score, historical_player_name: row.player_name, player: row.player })) as PublicCombinedRecord[] | undefined, error: legacy.error }
        }))
        for (const { baseMap, rows: mapRows, error } of results) { if (error) throw error; const own = rankByCombinedTotal(mapRows ?? []).find(row => row.player_id === playerId); if (own) rows.push({ key: baseMap, rank: own.rank, course: baseMap, easyScore: own.easy_score, hardScore: own.hard_score, totalScore: own.combined_score }) }
      }
      return Response.json({ rows: rows.sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.course.localeCompare(b.course)) }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=120" } })
    }
    return Response.json({ error: "Unknown Records view." }, { status: 400 })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Public Records could not be loaded."
    return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
