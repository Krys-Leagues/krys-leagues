import Link from "next/link"
import { redirect } from "next/navigation"

import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"
import { createAdminDataClient } from "@/lib/adminDataServer"
import {
  filterAdminIndexReviewRows,
  sortAdminIndexReviewRows,
  type AdminIndexReviewDirection,
  type AdminIndexReviewFilter,
  type AdminIndexReviewSort,
} from "@/lib/handicap/adminIndexReview"
import {
  readAdminCourseDetail,
  readAdminCourseReview,
  readAdminIndexReview,
  readAdminPlayerDetail,
  type AdminCourseReviewDetail,
  type AdminCourseReviewRow,
  type AdminPlayerReviewDetail,
} from "@/lib/handicap/adminIndexReviewServer"
import { readHandicapAdminProductionData } from "@/lib/handicap/adminReviewRead"

import styles from "./page.module.css"

export const dynamic = "force-dynamic"

type HandicapsAdminPageProps = {
  searchParams: Promise<{ filter?: string | string[]; sort?: string | string[]; direction?: string | string[]; search?: string | string[]; player?: string | string[]; course?: string | string[] }>
}

const FILTERS: readonly AdminIndexReviewFilter[] = ["all", "review_required", "ready", "negative", "nonnegative"]
const SORTS: readonly AdminIndexReviewSort[] = ["screen_name", "stored_index", "qualifying_rounds", "review_status"]

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function asFilter(value: string | undefined): AdminIndexReviewFilter {
  return FILTERS.includes(value as AdminIndexReviewFilter) ? value as AdminIndexReviewFilter : "all"
}

function asSort(value: string | undefined): AdminIndexReviewSort {
  return SORTS.includes(value as AdminIndexReviewSort) ? value as AdminIndexReviewSort : "screen_name"
}

function asDirection(value: string | undefined): AdminIndexReviewDirection {
  return value === "desc" ? "desc" : "asc"
}

function hrefWith(values: Record<string, string | undefined>, anchor?: "player-inspection" | "course-inspection") {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value)
  const encoded = query.toString()
  const path = encoded ? `/admin/handicaps?${encoded}` : "/admin/handicaps"
  return anchor ? `${path}#${anchor}` : path
}

export default async function HandicapsAdminPage({ searchParams }: HandicapsAdminPageProps) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) redirect("/admin")

  const query = await searchParams
  const filter = asFilter(one(query.filter))
  const sort = asSort(one(query.sort))
  const direction = asDirection(one(query.direction))
  const search = one(query.search)?.trim() ?? ""
  const selectedPlayerId = one(query.player)
  const selectedCourseCode = one(query.course)
  const adminDataClient = createAdminDataClient()
  const [productionData, indexReview] = await Promise.all([
    readHandicapAdminProductionData(adminDataClient),
    readAdminIndexReview(adminDataClient),
  ])
  const courseRows = indexReview.run ? await readAdminCourseReview(adminDataClient, indexReview.run.id) : []
  const filteredRows = filterAdminIndexReviewRows(indexReview.rows, filter).filter((row) => !search || (row.canonicalScreenName ?? "").toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const visibleIndexRows = sortAdminIndexReviewRows(filteredRows, sort, direction)
  const selectedPlayer = indexReview.rows.find((row) => row.canonicalPlayerId === selectedPlayerId)
  const selectedCourse = courseRows.find((course) => course.code === selectedCourseCode)
  const [playerDetail, courseDetail] = await Promise.all([
    selectedPlayer ? readAdminPlayerDetail(adminDataClient, selectedPlayer) : Promise.resolve<AdminPlayerReviewDetail | null>(null),
    selectedCourse ? readAdminCourseDetail(adminDataClient, selectedCourse) : Promise.resolve<AdminCourseReviewDetail | null>(null),
  ])

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Protected admin review</p>
          <h1>Handicap Review Desk</h1>
          <p className={styles.subtitle}>Read-only Production evidence and unpublished candidate review. No approval, import, rebuild, recalculation, or publish actions are exposed.</p>
        </div>
        <nav className={styles.actions} aria-label="Handicap navigation">
          <Link href="/admin/players" className={styles.secondaryLink}>Players</Link>
          <Link href="/admin" className={styles.secondaryLink}>Admin home</Link>
        </nav>
      </header>

      <section className={styles.notice} aria-label="Data provenance notice">
        <strong>PRELIMINARY / UNPUBLISHED REVIEW SET</strong>
        <span>These 166 revised candidates come from the committed Phase 118/119 review package and are verified against exact Production player identities. The older 157 Production snapshots are not displayed as revised results.</span>
      </section>

      <section className={styles.summaryGrid} aria-label="Handicap review summary">
        <SummaryCard label="Revised candidates" value={indexReview.status === "AVAILABLE" ? String(indexReview.rows.length) : "Unavailable"} detail="Preliminary local review package" />
        <SummaryCard label="Named players" value={indexReview.status === "AVAILABLE" ? String(new Set(indexReview.rows.map((row) => row.canonicalScreenName)).size) : "Unavailable"} detail="Exact public.players names" />
        <SummaryCard label="Rating snapshots" value={formatTableStatus(productionData.persistence.handicap_rating_snapshots)} detail="Installed Production count" />
        <SummaryCard label="Index snapshots" value={formatTableStatus(productionData.persistence.handicap_index_snapshots)} detail="Installed Production count" />
        <SummaryCard label="Eligible course rows" value={String(courseRows.filter((course) => course.snapshotId).length)} detail="Current review run, unpublished" />
        <SummaryCard label="Unrated in run" value={String(courseRows.filter((course) => !course.snapshotId).length)} detail="Not treated as approved" />
      </section>

      <section className={styles.panel}>
        <PanelHeading title="Review package status" detail="Server-side admin read after site-admin authorization; revised values are build-embedded review data, verified against Production canonical identities. No service key is sent to the browser." />
        <div className={styles.detailGrid}>
          <Detail label="Run" value={indexReview.run?.id ?? "Unavailable"} code />
          <Detail label="Status" value={indexReview.run?.status ?? "Unavailable"} />
          <Detail label="Publication gate" value={indexReview.run?.publicationEligibility ?? "Unavailable"} />
          <Detail label="Chronology" value={indexReview.run?.chronologyPolicy ?? "Unavailable"} />
          <Detail label="Policy" value={indexReview.run?.policyVersion ?? "Unavailable"} />
          <Detail label="Model" value={indexReview.run?.modelVersion ?? "Unavailable"} />
        </div>
        <p className={styles.reviewNote}>{indexReview.message}</p>
      </section>

      <section className={styles.panel}>
        <PanelHeading title="Course ratings and evidence" detail="Every official Easy/Hard entry is selectable. Values are preliminary and unpublished; Gloop Lair Hard remains unrated and provisional candidates remain on hold." />
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>Production course rating review</caption>
            <thead><tr><th>Course</th><th>Difficulty</th><th>Rating</th><th>Slope</th><th>Rounds</th><th>Players</th><th>Confidence</th><th>Status</th></tr></thead>
            <tbody>{courseRows.map((course) => <CourseRow key={course.key} course={course} selected={course.code === selectedCourseCode} search={search} />)}</tbody>
          </table>
        </div>
      </section>

      {courseDetail ? <CourseDetail detail={courseDetail} /> : <section id="course-inspection" className={styles.panel}><PanelHeading title="Course inspection" detail="Select any course above to inspect its rating, version, period, and evidence." /></section>}

      <section className={styles.panel} aria-label="Unpublished player Handicap review">
        <PanelHeading title="Named preliminary player candidates" detail="All rows below come from the verified Phase 118/119 local review package and exact public.players names. Values are unpublished; golf notation is display-only." />
        {indexReview.status === "AVAILABLE" && indexReview.summary ? (
          <>
            <p className={styles.reviewNote}>{indexReview.summary.total} candidates · {indexReview.summary.reviewRequired} require human review · {indexReview.summary.unpublished} unpublished · showing {visibleIndexRows.length}</p>
            <form className={styles.reviewControls} method="get">
              <label className={styles.controlLabel} htmlFor="handicap-search">Search name</label>
              <input id="handicap-search" name="search" defaultValue={search} className={styles.searchInput} />
              <input type="hidden" name="filter" value={filter} />
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="direction" value={direction} />
              <input type="submit" value="Search" className={styles.controlLink} />
            </form>
            <nav className={styles.reviewControls} aria-label="Handicap candidate filters">
              <span className={styles.controlLabel}>Filter:</span>
              {FILTERS.map((value) => <Link key={value} href={hrefWith({ filter: value, sort, direction, search })} className={value === filter ? styles.activeControl : styles.controlLink}>{value.replaceAll("_", " ")}</Link>)}
              <span className={styles.controlLabel}>Sort:</span>
              {SORTS.map((value) => <Link key={value} href={hrefWith({ filter, sort: value, direction, search })} className={value === sort ? styles.activeControl : styles.controlLink}>{value.replaceAll("_", " ")}</Link>)}
              <Link href={hrefWith({ filter, sort, direction: direction === "asc" ? "desc" : "asc", search })} className={styles.controlLink}>direction: {direction}</Link>
            </nav>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>Unpublished player Handicap candidates</caption>
                <thead><tr><th>Screen name</th><th>Previous</th><th>Revised</th><th>Movement</th><th>Golf notation</th><th>Rounds</th><th>Latest 10</th><th>Best 5</th><th>Rating refs</th><th>Review</th></tr></thead>
                <tbody>{visibleIndexRows.map((row) => <PlayerRow key={row.snapshotId} row={row} selected={row.canonicalPlayerId === selectedPlayerId} filter={filter} sort={sort} direction={direction} search={search} />)}</tbody>
              </table>
            </div>
          </>
        ) : <p className={styles.reviewNote}>{indexReview.message}</p>}
      </section>

      {playerDetail ? <PlayerDetail detail={playerDetail} /> : <section id="player-inspection" className={styles.panel}><PanelHeading title="Player inspection" detail="Select a named candidate above to inspect latest-ten evidence, best-five differentials, and versioned rating references." /></section>}

      <div className={styles.twoColumn}>
        <ReviewPanel title="Legacy Production metadata" items={Object.entries(productionData.legacy).map(([name, value]) => `${name}: ${formatTableStatus(value)}`)} />
        <ReviewPanel title="Publication boundary" items={["The current run is DRAFT / QUARANTINED.", "All current ratings and indexes are UNPUBLISHED.", "No approval, import, recalculation, rebuild, or publication controls exist on this page."]} />
      </div>
    </main>
  )
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className={styles.summaryCard}><span className={styles.cardLabel}>{label}</span><strong className={styles.cardValue}>{value}</strong><span className={styles.cardDetail}>{detail}</span></div>
}

function PanelHeading({ title, detail }: { title: string; detail: string }) {
  return <div className={styles.panelHeading}><h2>{title}</h2><p>{detail}</p></div>
}

function Detail({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return <div className={styles.detailItem}><span className={styles.cardLabel}>{label}</span>{code ? <code>{value}</code> : <strong>{value}</strong>}</div>
}

function CourseRow({ course, selected, search }: { course: AdminCourseReviewRow; selected: boolean; search: string }) {
  const status = course.status === "LOCAL_PRELIMINARY_UNPUBLISHED" ? "PRELIMINARY / UNPUBLISHED" : course.snapshotId ? "UNPUBLISHED" : "UNRATED / NOT IN RUN"
  return <tr className={`${course.snapshotId ? "" : styles.unratedRow} ${selected ? styles.selectedRow : ""}`}><td><Link href={hrefWith({ course: course.code, search }, "course-inspection")} className={styles.tableLink}>{course.baseMap} <code>{course.code}</code></Link></td><td>{course.difficulty}</td><td>{course.courseRating ?? "—"}</td><td>{course.slope ?? "—"}</td><td>{course.sampleSize || "—"}</td><td>{course.distinctPlayers || "—"}</td><td>{course.confidence}</td><td>{status}{course.recommendation ? ` · ${course.recommendation}` : ""}</td></tr>
}

function PlayerRow({ row, selected, filter, sort, direction, search }: { row: { snapshotId: string; canonicalPlayerId: string; canonicalScreenName: string | null; storedIndex: number | null; displayedIndex: string; qualifyingRoundCount: number; latestTenRoundCount: number; bestFiveRoundCount: number; ratingReferenceCount: number; chronologyConfidence: string; reviewStatus: string; reviewFlags: readonly string[]; previousIndex?: number | null; movement?: number | null; majorMovement?: boolean }; selected: boolean; filter: string; sort: string; direction: string; search: string }) {
  return <tr className={selected ? styles.selectedRow : undefined}><td><Link href={hrefWith({ player: row.canonicalPlayerId, filter, sort, direction, search }, "player-inspection")} className={styles.tableLink}>{row.canonicalScreenName ?? "Canonical screen name unavailable"}</Link>{row.majorMovement ? <span className={styles.cardDetail}> · major movement</span> : null}</td><td>{row.previousIndex ?? "—"}</td><td>{row.storedIndex ?? "—"}</td><td>{row.movement === null || row.movement === undefined ? "—" : row.movement > 0 ? `+${row.movement}` : row.movement}</td><td>{row.displayedIndex}</td><td>{row.qualifyingRoundCount}</td><td>{row.latestTenRoundCount}</td><td>{row.bestFiveRoundCount}</td><td>{row.ratingReferenceCount ? `${row.ratingReferenceCount} local` : "—"}</td><td>{row.reviewFlags.join(", ")}</td></tr>
}

function PlayerDetail({ detail }: { detail: AdminPlayerReviewDetail }) {
  return <section id="player-inspection" className={styles.panel}><PanelHeading title={`Player detail: ${detail.row.canonicalScreenName ?? "Unnamed"}`} detail={detail.message} /><div className={styles.detailGrid}><Detail label="Canonical UUID" value={detail.row.canonicalPlayerId} code /><Detail label="Historical source name" value={detail.row.originalScreenName ?? "—"} /><Detail label="Previous index" value={String(detail.row.previousIndex ?? "—")} /><Detail label="Revised index" value={String(detail.row.storedIndex ?? "—")} /><Detail label="Golf notation" value={detail.row.displayedIndex} /><Detail label="Movement" value={String(detail.row.movement ?? "—")} /><Detail label="Chronology" value={detail.row.chronologyConfidence} /><Detail label="Source mix" value={Object.entries(detail.sourceBreakdown).map(([key, value]) => `${key}: ${value}`).join(" · ") || "KWT evidence not matched"} /></div><h3>Latest ten KWT rounds</h3><EvidenceTable rows={detail.latestTen} /><h3>Best five differentials</h3><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Source round</th><th>Season/week</th><th>Course</th><th>Score</th><th>Rating ref</th><th>Differential</th></tr></thead><tbody>{detail.bestFive.map((row) => <tr key={row.sourceFingerprint}><td><code>{row.sourceFingerprint}</code></td><td>S{row.sourceSeason ?? "—"}W{row.sourceWeek ?? "—"}</td><td>{row.courseId ?? "—"} / {row.difficulty ?? "—"}</td><td>{row.score ?? "—"}</td><td><code>{row.ratingSnapshotId ?? "local preliminary"}</code></td><td>{row.differential ?? "—"}</td></tr>)}</tbody></table></div></section>
}

function EvidenceTable({ rows, showSource = false }: { rows: readonly { sourceFingerprint: string; sourceType: string; sourceSeason: number | null; sourceWeek: number | null; courseId: string | null; difficulty: string | null; score: number | null }[]; showSource?: boolean }) {
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Source round</th>{showSource ? <th>Source</th> : null}<th>Season/week</th><th>Course</th><th>Score</th></tr></thead><tbody>{rows.map((row) => <tr key={row.sourceFingerprint}><td><code>{row.sourceFingerprint}</code></td>{showSource ? <td>{row.sourceType}</td> : null}<td>S{row.sourceSeason ?? "—"}W{row.sourceWeek ?? "—"}</td><td>{row.courseId ?? "—"} / {row.difficulty ?? "—"}</td><td>{row.score ?? "—"}</td></tr>)}</tbody></table></div>
}

function CourseDetail({ detail }: { detail: AdminCourseReviewDetail }) {
  return <section id="course-inspection" className={styles.panel}><PanelHeading title={`Course detail: ${detail.course.baseMap} ${detail.course.difficulty}`} detail={detail.message} /><div className={styles.detailGrid}><Detail label="Course rating" value={String(detail.course.courseRating ?? "—")} /><Detail label="Slope" value={String(detail.course.slope ?? "—")} /><Detail label="Sample" value={String(detail.course.sampleSize)} /><Detail label="Distinct players" value={String(detail.course.distinctPlayers)} /><Detail label="Confidence" value={detail.course.confidence} /><Detail label="Recommendation" value={detail.course.recommendation ?? "—"} /><Detail label="Flags" value={detail.course.flags ?? "None"} /><Detail label="Source evidence" value={String(detail.evidenceCount)} /><Detail label="Source breakdown" value={Object.entries(detail.sourceBreakdown).map(([key, value]) => `${key}: ${value}`).join(" · ") || "None"} /></div>{detail.evidence.length > 0 ? <EvidenceTable rows={detail.evidence.slice(0, 40)} showSource /> : <p className={styles.reviewNote}>No row-level evidence is embedded in this aggregate Preview package.</p>}</section>
}

function ReviewPanel({ title, items }: { title: string; items: readonly string[] }) {
  return <section className={styles.panel}><PanelHeading title={title} detail="Read-only status" /><ul className={styles.list}>{items.map((item) => <li key={item}>{item}</li>)}</ul></section>
}

function formatTableStatus(value: { status: "AVAILABLE" | "UNAVAILABLE"; count: number | null }) {
  return value.status === "AVAILABLE" ? String(value.count ?? 0) : "Unavailable"
}
