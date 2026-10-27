import Image from "next/image"
import Link from "next/link"
import { createServerSupabaseClient } from "@/lib/supabase/server"

type Placement = {
  player_id: string | null
  player_screen_name_snapshot: string | null
  field_placement: number | null
  is_tied: boolean | null
  is_finalized: boolean | null
}

type PlayDay = { id: string; day_number: number; label: string | null }
type Scorecard = {
  id: string
  play_day_id: string
  player_id: string | null
  player_screen_name_snapshot: string | null
  status: string
  course_code: string | null
}
type Hole = { scorecard_id: string; hole_number: number; par: number; strokes: number }

export default async function MajorChampionshipPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()
  const eventResult = await supabase.from("major_events").select("id,name,slug,year,status,is_public,is_test_event").eq("slug", slug).maybeSingle()
  const event = eventResult.data as { id: string; name: string; slug: string; year: number | null; status: string; is_public: boolean; is_test_event: boolean } | null
  if (!event || !event.is_public) return <main style={page}><div style={shell}><Link href="/majors" style={back}>← Majors</Link><section style={card}><h1>Championship unavailable</h1><p>This championship is not publicly available.</p></section></div></main>

  const [placementsResult, daysResult, cardsResult] = await Promise.all([
    supabase.from("major_final_placements").select("player_id,player_screen_name_snapshot,field_placement,is_tied,is_finalized").eq("major_event_id", event.id).order("field_placement", { ascending: true }),
    supabase.from("major_play_days").select("id,day_number,label").eq("major_event_id", event.id).order("day_number", { ascending: true }),
    supabase.from("major_player_scorecards").select("id,play_day_id,player_id,player_screen_name_snapshot,status,course_code").eq("major_event_id", event.id).order("play_day_id", { ascending: true }),
  ])
  const placements = (placementsResult.data || []) as Placement[]
  const days = (daysResult.data || []) as PlayDay[]
  const cards = (cardsResult.data || []) as Scorecard[]
  const finalReady = placements.length > 0 && placements.every((placement) => placement.is_finalized === true)
  const cardIds = cards.map((card) => card.id)
  const holesResult = cardIds.length ? await supabase.from("major_player_scorecard_holes").select("scorecard_id,hole_number,par,strokes").in("scorecard_id", cardIds) : { data: [] }
  const holes = (holesResult.data || []) as Hole[]
  const holesByCard = new Map<string, Hole[]>()
  for (const hole of holes) holesByCard.set(hole.scorecard_id, [...(holesByCard.get(hole.scorecard_id) || []), hole])
  const dayById = new Map(days.map((day) => [day.id, day]))
  const historyByPlayer = new Map<string, { name: string; rounds: { label: string; course: string; score: number | null; status: string }[] }>()
  for (const card of cards) {
    const playerKey = card.player_id || card.player_screen_name_snapshot || card.id
    const player = historyByPlayer.get(playerKey) || { name: card.player_screen_name_snapshot || "Verified player", rounds: [] }
    const score = (holesByCard.get(card.id) || []).reduce((total, hole) => total + (hole.strokes - hole.par), 0)
    player.rounds.push({ label: dayById.get(card.play_day_id)?.label || `Round ${dayById.get(card.play_day_id)?.day_number || ""}`, course: card.course_code || "Course recorded", score: (holesByCard.get(card.id) || []).length ? score : null, status: card.status })
    historyByPlayer.set(playerKey, player)
  }

  return <main style={page}><div style={shell}><nav style={nav}><Link href="/majors" style={back}>← Majors</Link><Link href="/leaderboards" style={back}>All Leaderboards</Link></nav><header><p style={eyebrow}>KRYS LEAGUES · PERMANENT CHAMPIONSHIP SHOWCASE</p><h1>{event.name} Championship</h1><p style={intro}>Verified final standings and preserved four-round scorecard history.</p></header><section style={hero}><Image src="/approved-pages/the masters.jpg" alt="Mini-Golf Masters championship artwork" fill sizes="(max-width: 900px) 100vw, 900px" style={{ objectFit: "cover" }} priority /><div style={heroShade}><strong>{event.year || ""} · {event.name}</strong><span>{event.is_test_event ? "TEST EVENT · NOT OFFICIAL" : "OFFICIAL RESULTS"}</span></div></section>{!finalReady ? <section style={card} aria-live="polite"><h2>Final leaderboard is awaiting authorized finalization.</h2><p>{placements.length ? "Placement records exist but are not finalized for public publication." : "Verified scorecards are preserved, but no final placements have been published."} This page will reveal the official standings only after the existing admin finalization gate is complete.</p><Link href={`/majors/${slug}/results`} style={button}>VIEW VERIFIED SCORECARD RESULTS</Link></section> : <><section style={card}><h2>Final leaderboard</h2><div style={tableWrap}><table style={table}><thead><tr><th>PLACE</th><th>PLAYER</th><th>STATUS</th></tr></thead><tbody>{placements.map((placement, index) => <tr key={`${placement.player_id || placement.player_screen_name_snapshot || "player"}-${index}`}><td>{placement.field_placement || "—"}{placement.is_tied ? " (T)" : ""}</td><th>{placement.player_id ? <Link href={`/players/${placement.player_id}`} style={playerLink}>{placement.player_screen_name_snapshot || "Verified player"}</Link> : placement.player_screen_name_snapshot || "Verified player"}</th><td>FINALIZED</td></tr>)}</tbody></table></div></section><section style={card}><h2>Four-round scorecard history</h2><div style={historyGrid}>{Array.from(historyByPlayer.values()).map((player) => <article key={player.name} style={historyCard}><h3>{player.name}</h3>{player.rounds.map((round, index) => <div key={`${round.label}-${index}`} style={roundRow}><span>{round.label}</span><span>{round.course}</span><strong>{round.score === null ? "—" : formatToPar(round.score)}</strong><small>{round.status === "verified" ? "VERIFIED" : "PROVISIONAL"}</small></div>)}</article>)}</div></section></>}</div></main>
}

function formatToPar(value: number) { return value > 0 ? `+${value}` : String(value) }

const page: React.CSSProperties = { minHeight: "100vh", background: "#080514", color: "#f8f3ff", padding: "32px 16px 72px" }
const shell: React.CSSProperties = { width: "min(1120px, 100%)", margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }
const back: React.CSSProperties = { color: "#d7f5ff", textDecoration: "none", border: "1px solid #654b85", borderRadius: 999, padding: "9px 14px" }
const eyebrow: React.CSSProperties = { color: "#8deeff", letterSpacing: ".16em", fontWeight: 800, fontSize: 12 }
const intro: React.CSSProperties = { color: "#d5c9e8", fontSize: 18 }
const hero: React.CSSProperties = { position: "relative", minHeight: 260, overflow: "hidden", borderRadius: 22, border: "1px solid #76569c", margin: "28px 0", background: "#1a0d2b" }
const heroShade: React.CSSProperties = { position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8, padding: 24, background: "linear-gradient(transparent 35%, rgba(8,5,20,.86))", fontSize: 20 }
const card: React.CSSProperties = { marginTop: 22, padding: 24, borderRadius: 20, background: "rgba(22,12,39,.88)", border: "1px solid #5d4381" }
const button: React.CSSProperties = { display: "inline-block", marginTop: 14, color: "#07101c", background: "#8deeff", borderRadius: 999, padding: "10px 16px", textDecoration: "none", fontWeight: 800 }
const tableWrap: React.CSSProperties = { overflowX: "auto" }
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 520 }
const playerLink: React.CSSProperties = { color: "#8deeff" }
const historyGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }
const historyCard: React.CSSProperties = { border: "1px solid #493465", borderRadius: 14, padding: 14 }
const roundRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center", borderTop: "1px solid #38264c", padding: "10px 0" }

