import Image from "next/image"
import Link from "next/link"

import MatchCenter, { ScorecardWorkspace } from "./MatchCenter"
import TournamentRegistrationPanel from "./TournamentRegistrationPanel"
import { isMissingTournamentSchema, trustedTournamentClient } from "@/lib/tournaments/server"
import { courseDetails, formatCourseSummary, formatSchedule, formatTiebreaker, pointRules, type PublicTournamentRound } from "@/lib/tournaments/publicDetails"
import styles from "./page.module.css"

export const dynamic = "force-dynamic"

type TournamentRow = {
  id: string
  name: string
  slug: string
  status: string
  bracket_size: number
  format: string
  registration_capacity: number
  registration_open_at: string | null
  registration_closed_at: string | null
  artwork_path: string | null
  template_id: string | null
  rules: Record<string, unknown>
  schedule_timezone: string | null
  start_at: string | null
  overall_deadline_at: string | null
}

type Match = { id: string; round_number: number; match_number: number; status: string; player_a_id: string | null; player_b_id: string | null; winner_player_id: string | null }
type Registration = { id: string; player_id: string; status: string; registered_at?: string | null; player_timezone?: string | null; screen_name: string | null }

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export default async function PublicTournamentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const client = trustedTournamentClient()
  const tournamentResult = await client.from("tournaments").select("id,name,slug,status,bracket_size,format,registration_capacity,registration_open_at,registration_closed_at,artwork_path,template_id,rules,schedule_timezone,start_at,overall_deadline_at").eq("slug", slug).in("status", ["registration_open", "registration_closed", "live", "completed"]).maybeSingle()
  const error = tournamentResult.error
  const tournament = tournamentResult.data as TournamentRow | null
  if (error && !isMissingTournamentSchema(error)) throw new Error(error.message)
  if (error || !tournament) return <main className={styles.page}><div className={styles.empty}><h1>Public tournament bracket</h1><p>This tournament is not available yet. An authorized operator must complete setup before it can be published.</p><Link href="/tournaments" className={styles.backLink}>← Bracket Tournaments</Link></div></main>

  const templateResult = tournament.template_id ? await client.from("tournament_templates").select("description,rules,artwork_path").eq("id", tournament.template_id).maybeSingle() : { data: null, error: null }
  const roundsResult = await client.from("tournament_rounds").select("round_number,name,course_config,scoring_rules,tiebreaker_rules,deadline_at,schedule_timezone,is_final").eq("tournament_id", tournament.id).order("round_number")
  const matchesResult = await client.from("tournament_matches").select("id,round_number,match_number,status,player_a_id,player_b_id,winner_player_id").eq("tournament_id", tournament.id).order("round_number").order("match_number")
  const registrationsResult = await client.from("tournament_registrations").select("id,player_id,status,registered_at,player_timezone").eq("tournament_id", tournament.id).eq("status", "confirmed").order("registered_at")
  if (templateResult.error || roundsResult.error || matchesResult.error || registrationsResult.error) throw new Error(templateResult.error?.message || roundsResult.error?.message || matchesResult.error?.message || registrationsResult.error?.message || "Tournament data could not be loaded")

  const template = templateResult.data as { description?: string; rules?: Record<string, unknown>; artwork_path?: string | null } | null
  const roundsData = (roundsResult.data ?? []) as unknown as PublicTournamentRound[]
  const matchRows = (matchesResult.data ?? []) as unknown as Match[]
  const registrationRows = (registrationsResult.data ?? []) as unknown as Omit<Registration, "screen_name">[]
  const playerIds = [...new Set([...registrationRows.map((registration) => registration.player_id), ...matchRows.flatMap((match) => [match.player_a_id, match.player_b_id, match.winner_player_id].filter((value): value is string => Boolean(value)))])]
  const playersResult = playerIds.length ? await client.from("players").select("id,screen_name").in("id", playerIds) : { data: [], error: null }
  if (playersResult.error) throw new Error(playersResult.error.message)
  const names = new Map((playersResult.data ?? []).map((player) => [player.id, player.screen_name]))
  const confirmedRegistrations: Registration[] = registrationRows.map((registration) => ({ ...registration, screen_name: names.get(registration.player_id) ?? null }))
  const rules = tournament.rules && Object.keys(tournament.rules).length ? tournament.rules : (template?.rules ?? {})
  const scoring = objectValue(rules.scoring)
  const roundCount = roundsData.length || Math.log2(tournament.bracket_size)
  const byRound = new Map<number, Match[]>()
  for (const match of matchRows) byRound.set(match.round_number, [...(byRound.get(match.round_number) ?? []), match])
  const artworkSrc = tournament.artwork_path?.startsWith("/") ? tournament.artwork_path : template?.artwork_path?.startsWith("/") ? template.artwork_path : "/approved-pages/bracket-tournaments-clean-approved.png"

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.breadcrumbs} aria-label="Tournament navigation"><Link href="/">← Krys Leagues Home</Link><span>/</span><Link href="/tournaments">Bracket Tournaments</Link></nav>
      <section className={styles.hero}>
        <Image src={artworkSrc} alt="Approved Krys Leagues Bracket Tournaments artwork" fill priority sizes="(max-width: 900px) 100vw, 1200px" className={styles.heroImage} />
        <div className={styles.heroShade} />
        <div className={styles.heroContent}><p className={styles.kicker}>Krys Leagues · Website-managed tournament</p><h1>{tournament.name}</h1><p>{template?.description || "Tournament description: To Be Announced."}</p><span className={`${styles.statusBadge} ${tournament.status === "registration_open" ? styles.open : ""}`}>{tournament.status === "registration_open" ? "REGISTRATION OPEN" : tournament.status.replaceAll("_", " ").toUpperCase()}</span></div>
      </section>

      <div className={styles.contentGrid}>
        <div className={styles.mainColumn}>
          <section className={styles.panel}><div className={styles.sectionHeading}><div><p className={styles.kicker}>Official format</p><h2>What you are entering</h2></div></div><div className={styles.statGrid}><div><span>Format</span><strong>{tournament.bracket_size}-player single elimination</strong></div><div><span>Rounds</span><strong>{roundCount} rounds · {tournament.bracket_size - 1} matches</strong></div><div><span>Courses</span><strong>{formatCourseSummary(roundsData)}</strong></div><div><span>Handicap</span><strong>No handicap adjustment configured</strong></div></div></section>
          <section className={styles.panel}><p className={styles.kicker}>Rules and advancement</p><h2>How it works</h2><div className={styles.ruleLayout}><div><h3>5, 4, 3, 2, 1 scoring</h3><div className={styles.pointList}>{pointRules(rules).map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.points} point{item.points === 1 ? "" : "s"}</strong></div>)}</div>{pointRules(rules).length === 0 && <p className={styles.helper}>Scoring rules: To Be Announced.</p>}</div><div><h3>Advancement</h3><p className={styles.bodyCopy}>{typeof scoring.winner === "string" && scoring.winner === "most_points" ? "The player with the most points wins each match and advances." : "Advancement rules: To Be Announced."}</p><h3>Tiebreaker</h3><p className={styles.bodyCopy}>{formatTiebreaker(roundsData)}</p></div></div></section>
          <section className={styles.panel}><p className={styles.kicker}>Courses and difficulty</p><h2>Round plan</h2><div className={styles.scheduleGrid}>{(courseDetails(roundsData).length ? courseDetails(roundsData) : [{ name: "To Be Announced", difficulty: "Configured" as const }]).map((course) => <div key={course.name}><span>{course.difficulty}</span><strong>{course.name}</strong></div>)}</div><p className={styles.bodyCopy}>The course assignment for each round is controlled by the saved tournament configuration.</p></section>
          <section className={styles.panel}><p className={styles.kicker}>Schedule</p><h2>Plan your rounds</h2><div className={styles.scheduleGrid}><div><span>Start</span><strong>{formatSchedule(tournament.start_at, tournament.schedule_timezone)}</strong></div><div><span>Overall deadline</span><strong>{formatSchedule(tournament.overall_deadline_at, tournament.schedule_timezone)}</strong></div><div><span>Schedule time zone</span><strong>{tournament.schedule_timezone || "To Be Announced"}</strong></div></div><p className={styles.bodyCopy}>After the bracket is published, use the protected Match Center to propose and confirm playing times with your opponent. Match deadlines and local-time conversions are shown there.</p></section>
          <section className={styles.panel}><p className={styles.kicker}>Eligibility and requirements</p><h2>Before you register</h2><ul className={styles.requirements}><li>Sign in with an existing Krys Leagues account.</li><li>Use your canonical Global Player identity.</li><li>Confirm or correct your IANA time zone.</li><li>One registration per player; capacity is enforced server-side.</li><li>Registration remains subject to the tournament status and available places.</li></ul></section>
          <section className={styles.panel}><p className={styles.kicker}>Awards</p><h2>Prizes and trophies</h2><p className={styles.bodyCopy}>{template?.artwork_path || tournament.artwork_path ? "Approved tournament artwork is configured for this event." : "Approved prizes and trophies: To Be Announced."}</p></section>
        </div>
          <aside className={styles.aside} aria-label="REGISTERED PLAYERS — places remaining"><TournamentRegistrationPanel tournamentId={tournament.id} capacity={tournament.registration_capacity} status={tournament.status} initialRegistrations={confirmedRegistrations} /></aside>
      </div>

      <section className={styles.bracketPanel}><div className={styles.sectionHeading}><div><p className={styles.kicker}>Tournament operations</p><h2>{tournament.status === "registration_open" ? "Bracket coming after registration closes" : "Published bracket"}</h2></div></div>{matchRows.length === 0 ? <p className={styles.bodyCopy}>The bracket will appear here after Lynne closes registration and seeds the confirmed roster. No matches are being fabricated.</p> : <div className={styles.roundGrid}>{[...byRound.entries()].map(([round, roundMatches]) => <article className={styles.roundCard} key={round}><h3>{round === roundCount ? "Final" : `Round ${round}`}</h3>{roundMatches.map((match) => <div className={styles.matchCard} key={match.id}><strong>{names.get(match.player_a_id ?? "") ?? "Waiting"}</strong><span>vs</span><strong>{names.get(match.player_b_id ?? "") ?? "Waiting"}</strong><small>{match.status === "completed" ? `Winner: ${names.get(match.winner_player_id ?? "") ?? "Verified"}` : match.status.replaceAll("_", " ")}</small>{match.player_a_id && match.player_b_id && <MatchCenter tournamentId={tournament.id} matchId={match.id} playerAId={match.player_a_id} playerBId={match.player_b_id} playerAName={names.get(match.player_a_id) ?? "Player A"} playerBName={names.get(match.player_b_id) ?? "Player B"} status={match.status} />}{match.player_a_id && match.player_b_id && <ScorecardWorkspace tournamentId={tournament.id} matchId={match.id} />}</div>)}</article>)}</div>}</section>
    </div>
  </main>
}
