import Link from "next/link"
import { notFound } from "next/navigation"
import { MASTERS_PREVIEW_NEVER_PLAYED, summarizeMastersPreview, totalStrokes, totalToPar } from "@/lib/mastersFinalResultsPreview"

export default async function MastersFinalResultsPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug !== "masters") notFound()

  const summary = summarizeMastersPreview()
  const rows = [...summary.eligible].sort((left, right) => {
    if (left.officialPlacement !== null && right.officialPlacement !== null) return left.officialPlacement - right.officialPlacement || left.screenName.localeCompare(right.screenName)
    if (left.officialPlacement !== null) return -1
    if (right.officialPlacement !== null) return 1
    return left.screenName.localeCompare(right.screenName)
  })

  return <main style={page}><div style={shell}>
    <nav style={nav}><Link href="/majors/masters" style={link}>← The Mini-Golf Masters</Link><Link href="/majors/masters/results" style={link}>Live verified scorecards →</Link></nav>
    <header><p style={eyebrow}>KRYS LEAGUES · STAGING PREVIEW</p><h1 style={title}>The Mini-Golf Masters</h1><p style={intro}>Proposed final-results view using verified scorecards and the approved Top 10 source. This preview does not publish or finalize Production results.</p></header>
    <section style={warning} aria-live="polite"><strong>FINALIZATION BLOCKED FOR REVIEW</strong><span>54 players have at least one verified round. The approved source currently provides placements for the Top 10 only; the remaining 44 placements are intentionally shown as “—” instead of being inferred from incomplete totals.</span></section>
    <section style={cards}><article style={card}><strong>{summary.eligibleCount}</strong><span>players with ≥1 verified round</span></article><article style={card}><strong>{summary.vipQualifiers.length}</strong><span>approved VIP qualifiers</span></article><article style={card}><strong>{MASTERS_PREVIEW_NEVER_PLAYED.length}</strong><span>players with no verified rounds</span></article></section>
    <section style={panel}><h2>Verified MGA Championship VIP qualifiers</h2><p style={muted}>Established rule: every finalized Main Event placement 10th or better qualifies, including ties. The approved source has 10 individuals: placement 9 is tied.</p><div style={qualifiers}>{summary.vipQualifiers.map((player) => <span key={player.playerId} style={chip}>T{player.officialPlacement} · {player.screenName} · {formatToPar(totalToPar(player))}</span>)}</div></section>
    <section style={panel}><h2>Proposed final-results preview</h2><p style={muted}>Missing rounds remain blank. Totals include only verified rounds played and are labeled accordingly; they are not used to invent placements.</p><div style={tableWrap}><table style={table}><thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col">Round 1</th><th scope="col">Round 2</th><th scope="col">Round 3</th><th scope="col">Final Round</th><th scope="col">Verified total</th><th scope="col">Status</th></tr></thead><tbody>{rows.map((player) => <tr key={player.playerId}><td>{player.officialPlacement === null ? "—" : `${player.isTied ? "T" : ""}${player.officialPlacement}`}</td><th scope="row"><Link href={`/players/${player.playerId}`} style={playerLink}>{player.screenName}</Link></th>{player.rounds.map((round, index) => <td key={`${player.playerId}-${index}`}>{round ? <><strong>{round.strokes}</strong><small>{formatToPar(round.toPar)}</small></> : <span style={blank}>—</span>}</td>)}<td><strong>{totalStrokes(player)}</strong><small>{formatToPar(totalToPar(player))} · {player.rounds.filter(Boolean).length}/4 rounds</small></td><td style={player.officialPlacement === null ? pending : official}>{player.officialPlacement === null ? "Placement source pending" : "Approved Top 10"}</td></tr>)}</tbody></table></div></section>
    <section style={panel}><h2>Excluded from scored final placements</h2><p style={muted}>These registered players have no verified rounds. They remain identifiable for admin review but receive no score, placement, field, or cut outcome.</p><div style={qualifiers}>{MASTERS_PREVIEW_NEVER_PLAYED.map((player) => <span key={player.screenName} style={excluded}>{player.screenName} · no verified rounds</span>)}</div></section>
  </div></main>
}

function formatToPar(value: number) { return value === 0 ? "E" : value > 0 ? `+${value}` : String(value) }

const page: React.CSSProperties = { minHeight: "100vh", padding: "30px 16px 72px", backgroundImage: "linear-gradient(rgba(8,4,5,.84), rgba(8,4,5,.96)), url('/major-scorecards/masters/masters-large-scorecard.webp')", backgroundPosition: "center top", backgroundSize: "cover", backgroundAttachment: "fixed", color: "#fff8fb" }
const shell: React.CSSProperties = { width: "min(1440px, 100%)", margin: "0 auto" }
const nav: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 26 }
const link: React.CSSProperties = { color: "#ffd7e7", textDecoration: "none", border: "1px solid #8f4b6c", borderRadius: 999, padding: "9px 14px", fontWeight: 800 }
const eyebrow: React.CSSProperties = { color: "#f07eac", letterSpacing: ".18em", fontWeight: 900, fontSize: 12 }
const title: React.CSSProperties = { margin: "8px 0", fontFamily: "Georgia, serif", fontSize: "clamp(2.4rem, 7vw, 5.2rem)", lineHeight: .95, textTransform: "uppercase", textShadow: "0 3px 0 #000" }
const intro: React.CSSProperties = { maxWidth: 900, color: "#e1cbd4", fontSize: 18, lineHeight: 1.55 }
const warning: React.CSSProperties = { display: "grid", gap: 8, margin: "26px 0", padding: 18, border: "2px solid #f59e0b", borderRadius: 16, background: "rgba(69,26,3,.88)", color: "#fef3c7" }
const cards: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, margin: "20px 0" }
const card: React.CSSProperties = { display: "grid", gap: 5, padding: 18, border: "1px solid #8f4b6c", borderRadius: 14, background: "rgba(20,8,14,.85)" }
const panel: React.CSSProperties = { marginTop: 20, padding: 20, border: "1px solid #8f4b6c", borderRadius: 18, background: "rgba(20,8,14,.88)", boxShadow: "0 16px 48px rgba(0,0,0,.35)" }
const muted: React.CSSProperties = { color: "#e1cbd4", lineHeight: 1.5 }
const qualifiers: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 9 }
const chip: React.CSSProperties = { padding: "8px 11px", border: "1px solid #c15c86", borderRadius: 999, background: "rgba(111,31,67,.42)", fontWeight: 800 }
const excluded: React.CSSProperties = { padding: "8px 11px", border: "1px solid #725568", borderRadius: 999, color: "#d2bdc7" }
const tableWrap: React.CSSProperties = { overflowX: "auto", maxHeight: "min(72vh, 920px)", overflowY: "auto", border: "1px solid #573443", borderRadius: 12 }
const table: React.CSSProperties = { width: "100%", minWidth: 1020, borderCollapse: "collapse", background: "rgba(8,4,5,.72)" }
const playerLink: React.CSSProperties = { color: "#ffd7e7", textDecoration: "none" }
const blank: React.CSSProperties = { color: "#9f8490" }
const pending: React.CSSProperties = { color: "#fbbf24", fontSize: 12, fontWeight: 800 }
const official: React.CSSProperties = { color: "#86efac", fontSize: 12, fontWeight: 800 }
