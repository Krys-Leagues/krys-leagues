"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { MASTERS_SCORECARD_THEME, isMastersScorecardTheme, participantTotal, type PublicMajorScoreboard } from "@/lib/majors"
import { supabase } from "@/lib/supabase"

export default function MajorLiveScoreboardPage() {
  const params = useParams<{ sessionId: string; view: string }>()
  const [scoreboard, setScoreboard] = useState<PublicMajorScoreboard | null>(null)
  const [error, setError] = useState("")
  const view = params.view === "large" ? "large" : "compact"

  const refresh = useCallback(async () => {
    const response = await supabase.rpc("get_public_major_scoreboard", { p_session_id: params.sessionId })
    if (response.error || !response.data) {
      setError(response.error?.message || "This scoreboard is not published.")
      return
    }
    setScoreboard(response.data as PublicMajorScoreboard)
    setError("")
  }, [params.sessionId])

  useEffect(() => {
    // Initial public read and a lightweight polling fallback for remote updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const timer = window.setInterval(() => void refresh(), 2000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const scoreMap = useMemo(() => {
    const map = new Map<string, number>()
    scoreboard?.scores.forEach((score) => map.set(`${score.participant_id}:${score.hole_number}`, score.strokes))
    return map
  }, [scoreboard])

  if (!scoreboard) return <main style={waiting}>{error || "Loading live scoreboard…"}</main>

  const mastersTheme = isMastersScorecardTheme(scoreboard.event)
  const accent = scoreboard.event.scorecard_accent_color || (mastersTheme ? MASTERS_SCORECARD_THEME.accentColor : "#60a5fa")
  const textColor = scoreboard.event.scorecard_text_color || (mastersTheme ? MASTERS_SCORECARD_THEME.textColor : "#ffffff")
  const background = scoreboard.event.scorecard_background_url || (mastersTheme ? MASTERS_SCORECARD_THEME.backgroundUrl : null)

  if (view === "large" && mastersTheme) {
    return <MastersLargeScorecard scoreboard={scoreboard} scoreMap={scoreMap} />
  }

  return (
    <main style={{ ...stage, color: textColor }}>
      {background && <div aria-hidden="true" style={{ ...lockedBackground, backgroundImage: `url("${background}")` }} />}
      <div style={shade} />
      <section style={view === "large" ? largeBoard : compactBoard}>
        <header style={{ ...scoreHeader, borderColor: accent }}>
          <div><p style={{ ...majorLabel, color: accent }}>{scoreboard.event.name}</p><h1 style={scoreTitle}>{scoreboard.session.label}</h1></div>
          <div style={holeBlock}><span>Current hole</span><strong style={{ color: accent }}>{scoreboard.session.current_hole}</strong></div>
        </header>

        {view === "compact" ? (
          <div style={{ ...compactPlayers, gridTemplateColumns: `repeat(${scoreboard.session.participant_count}, minmax(0, 1fr))` }}>
            {scoreboard.participants.map((participant) => (
              <article key={participant.id} style={{ ...compactPlayer, borderColor: accent }}>
                <h2 style={playerName}>{participant.player_screen_name_snapshot}</h2>
                <div style={currentScore}><span>Hole {scoreboard.session.current_hole}</span><strong>{scoreMap.get(`${participant.id}:${scoreboard.session.current_hole}`) ?? "—"}</strong></div>
                <div style={total}><span>Total</span><strong>{participantTotal(scoreboard.scores, participant.id)}</strong></div>
              </article>
            ))}
          </div>
        ) : (
          <div style={largeTableWrap}>
            <table style={largeTable}>
              <thead><tr><th style={holeHeading}>Hole</th>{Array.from({ length: 18 }, (_, index) => <th key={index + 1} style={numberHeading}>{index + 1}</th>)}<th style={{ ...numberHeading, color: accent }}>Total</th></tr></thead>
              <tbody>{scoreboard.participants.map((participant) => <tr key={participant.id}><th style={nameCell}>{participant.player_screen_name_snapshot}</th>{Array.from({ length: 18 }, (_, index) => <td key={index + 1} style={scoreboard.session.current_hole === index + 1 ? { ...scoreCell, borderColor: accent, color: accent } : scoreCell}>{scoreMap.get(`${participant.id}:${index + 1}`) ?? "—"}</td>)}<td style={{ ...scoreCell, color: accent, fontWeight: 900 }}>{participantTotal(scoreboard.scores, participant.id)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <footer style={footer}><span>{scoreboard.session.is_active ? "LIVE" : "INACTIVE"}</span><span>Updated {new Date(scoreboard.session.updated_at).toLocaleTimeString()}</span></footer>
      </section>
    </main>
  )
}

function MastersLargeScorecard({
  scoreboard,
  scoreMap,
}: {
  scoreboard: PublicMajorScoreboard
  scoreMap: Map<string, number>
}) {
  const accent = scoreboard.event.scorecard_accent_color || MASTERS_SCORECARD_THEME.accentColor
  const textColor = scoreboard.event.scorecard_text_color || MASTERS_SCORECARD_THEME.textColor
  const background = scoreboard.event.scorecard_background_url || MASTERS_SCORECARD_THEME.backgroundUrl

  return (
    <main style={mastersStage}>
      <section style={{ ...mastersCanvas, backgroundImage: `url("${background}")`, color: textColor }}>
        <div style={{ ...mastersDataArea, borderColor: accent }}>
          <div style={{ ...mastersStatusBar, borderColor: accent }}>
            <strong>{scoreboard.session.label}</strong>
            <span>HOLE {scoreboard.session.current_hole}</span>
            <span>{scoreboard.session.is_active ? "● LIVE" : "INACTIVE"}</span>
          </div>
          <div style={{ ...mastersGrid, borderColor: accent }}>
            <strong>POS</strong><strong>PLAYER</strong><strong>CURRENT HOLE</strong><strong>HOLE SCORE</strong><strong>THRU</strong><strong>TOTAL STROKES</strong><strong>STATUS</strong>
          </div>
          {scoreboard.participants.map((participant, index) => {
            const completed = scoreboard.scores.filter((score) => score.participant_id === participant.id).length
            return (
              <div key={participant.id} style={{ ...mastersGrid, ...mastersPlayerRow, borderColor: accent }}>
                <strong>{index + 1}</strong>
                <strong style={mastersPlayerName}>{participant.player_screen_name_snapshot}</strong>
                <span>{scoreboard.session.current_hole}</span>
                <strong style={{ color: accent }}>{scoreMap.get(`${participant.id}:${scoreboard.session.current_hole}`) ?? "—"}</strong>
                <span>{completed}</span>
                <strong>{participantTotal(scoreboard.scores, participant.id)}</strong>
                <span>{scoreboard.session.is_active ? "PLAYING" : "—"}</span>
              </div>
            )
          })}
          <div style={mastersEmptyArea} />
          <div style={{ ...mastersUpdate, borderColor: accent }}>
            <span>LIVE SCORING · NEUTRAL STROKE TOTALS</span>
            <span>UPDATED {new Date(scoreboard.session.updated_at).toLocaleTimeString()}</span>
          </div>
        </div>
      </section>
    </main>
  )
}

const waiting: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", margin: 0, background: "transparent", color: "white", fontFamily: "Arial, sans-serif" }
const stage: React.CSSProperties = { position: "relative", minHeight: "100vh", boxSizing: "border-box", display: "grid", placeItems: "center", padding: "clamp(12px,3vw,40px)", overflow: "hidden", background: "transparent", fontFamily: "Arial, sans-serif" }
const lockedBackground: React.CSSProperties = { position: "absolute", inset: 0, zIndex: 0, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" }
const shade: React.CSSProperties = { position: "absolute", inset: 0, zIndex: 1, background: "radial-gradient(circle at center, rgba(2,6,23,.35), rgba(0,0,0,.88))" }
const compactBoard: React.CSSProperties = { position: "relative", zIndex: 2, width: "min(1200px,96vw)", padding: "clamp(14px,2.2vw,28px)", boxSizing: "border-box", borderRadius: 22, background: "rgba(2,6,23,.9)", boxShadow: "0 18px 60px rgba(0,0,0,.6)" }
const largeBoard: React.CSSProperties = { ...compactBoard, width: "min(1800px,98vw)" }
const scoreHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, paddingBottom: 14, borderBottom: "3px solid" }
const majorLabel: React.CSSProperties = { margin: 0, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".15em", fontSize: "clamp(12px,1.5vw,22px)" }
const scoreTitle: React.CSSProperties = { margin: "4px 0 0", fontSize: "clamp(22px,4vw,52px)" }
const holeBlock: React.CSSProperties = { display: "flex", flexDirection: "column", textAlign: "center", textTransform: "uppercase", fontWeight: 800 }
const compactPlayers: React.CSSProperties = { display: "grid", gap: "clamp(10px,2vw,24px)", marginTop: 18 }
const compactPlayer: React.CSSProperties = { minWidth: 0, padding: "clamp(12px,2vw,26px)", border: "2px solid", borderRadius: 16, background: "rgba(0,0,0,.72)" }
const playerName: React.CSSProperties = { margin: 0, overflowWrap: "anywhere", fontSize: "clamp(18px,3vw,38px)" }
const currentScore: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "end", marginTop: 18, fontSize: "clamp(14px,2vw,24px)" }
const total: React.CSSProperties = { ...currentScore, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.25)" }
const largeTableWrap: React.CSSProperties = { marginTop: 18, overflowX: "auto" }
const largeTable: React.CSSProperties = { width: "100%", borderCollapse: "separate", borderSpacing: 4, tableLayout: "fixed" }
const holeHeading: React.CSSProperties = { minWidth: 180, textAlign: "left", padding: 10, background: "rgba(0,0,0,.75)" }
const numberHeading: React.CSSProperties = { padding: 8, background: "rgba(0,0,0,.75)", fontSize: "clamp(10px,1.2vw,18px)" }
const nameCell: React.CSSProperties = { textAlign: "left", padding: 10, background: "rgba(0,0,0,.82)", overflowWrap: "anywhere" }
const scoreCell: React.CSSProperties = { padding: 8, textAlign: "center", background: "rgba(0,0,0,.72)", border: "1px solid rgba(255,255,255,.12)", fontSize: "clamp(12px,1.5vw,22px)" }
const footer: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12, color: "rgba(255,255,255,.72)", fontSize: 12, fontWeight: 800 }
const mastersStage: React.CSSProperties = { width: "100vw", minHeight: "100vh", margin: 0, display: "grid", placeItems: "center", overflow: "hidden", background: "#020102", fontFamily: "Georgia, 'Times New Roman', serif" }
const mastersCanvas: React.CSSProperties = { position: "relative", width: "min(100vw, calc(100vh * 16 / 9))", aspectRatio: "16 / 9", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", boxShadow: "0 0 60px #000" }
const mastersDataArea: React.CSSProperties = { position: "absolute", left: "2.1%", right: "2.15%", top: "34.6%", height: "45.2%", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden", background: "rgba(3,2,4,.965)", border: "1px solid", borderRadius: "2px", textShadow: "0 1px 2px #000" }
const mastersStatusBar: React.CSSProperties = { height: "18%", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", alignItems: "center", padding: "0 2%", boxSizing: "border-box", borderBottom: "1px solid", color: "#f3b1ca", fontSize: "clamp(9px,1.15vw,20px)", letterSpacing: ".05em" }
const mastersGrid: React.CSSProperties = { minHeight: "14%", display: "grid", gridTemplateColumns: ".45fr 2.5fr 1.15fr 1.05fr .7fr 1.2fr 1fr", alignItems: "center", textAlign: "center", borderBottom: "1px solid rgba(232,104,154,.5)", fontSize: "clamp(8px,1vw,18px)" }
const mastersPlayerRow: React.CSSProperties = { minHeight: "19%", fontSize: "clamp(10px,1.25vw,22px)" }
const mastersPlayerName: React.CSSProperties = { paddingLeft: "6%", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
const mastersEmptyArea: React.CSSProperties = { flex: 1, backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent calc(25% - 1px), rgba(232,104,154,.28) 25%)" }
const mastersUpdate: React.CSSProperties = { minHeight: "12%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2%", borderTop: "1px solid", color: "#f3b1ca", fontSize: "clamp(7px,.8vw,14px)", letterSpacing: ".08em" }
