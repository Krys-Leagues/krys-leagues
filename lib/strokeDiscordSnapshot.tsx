import "server-only"

import { ImageResponse } from "next/og"

import type { StrokeDiscordSnapshot } from "./strokeDiscord"

const DIVISION_ACCENTS: Record<number, string> = {
  1: "#fb923c",
  2: "#60a5fa",
  3: "#4ade80",
  4: "#facc15",
  5: "#c084fc",
}

const cell = (width: string, justifyContent: "flex-start" | "center" = "center") => ({
  display: "flex",
  width,
  minWidth: 0,
  flexShrink: 0,
  justifyContent,
  alignItems: "center",
}) as const

const playerNameStyle = (name: string, leader: boolean) => ({
  ...cell("18%", "flex-start"),
  padding: "0 8px",
  color: leader ? "#4ade80" : "#f8fafc",
  fontSize: name.length > 18 ? 14 : name.length > 13 ? 16 : 18,
  fontWeight: 800,
  lineHeight: 1.12,
  wordBreak: "break-all",
}) as const

export function createStrokeDivisionImage(snapshot: StrokeDiscordSnapshot) {
  const accent = DIVISION_ACCENTS[snapshot.division_number] || "#f8fafc"
  const winnerGreen = "#4ade80"
  const reminder = snapshot.mode === "reminder"
  const standingsHeight = reminder ? 0 : 116 + snapshot.standings.length * 62
  const height = 300 + snapshot.assignments.length * 92 + standingsHeight

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "46px 54px",
        color: "#f8fafc",
        background: "linear-gradient(145deg, #020617 0%, #071426 50%, #02040a 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: "#94a3b8" }}>
          KRYS LEAGUES · STROKE PLAY
        </div>
        <div style={{ display: "flex", padding: "12px 20px", border: `2px solid ${accent}`, borderRadius: 999, fontSize: 24, fontWeight: 800 }}>
          SEASON {snapshot.season_number}
        </div>
      </div>

      <div style={{ display: "flex", width: "100%", justifyContent: "center", marginTop: 16, textAlign: "center", fontSize: 50, fontWeight: 900, color: accent }}>
        STROKE DIVISION {snapshot.division_number}
      </div>
      {reminder && (
        <div style={{ display: "flex", width: "100%", justifyContent: "center", marginTop: 7, color: "#fde68a", fontSize: 23, fontWeight: 900, letterSpacing: 2 }}>
          GAME REMINDER
        </div>
      )}

      <div style={{ display: "flex", height: 4, margin: "24px 0", borderRadius: 99, background: accent }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", marginBottom: 12, color: accent, fontSize: 25, fontWeight: 900, letterSpacing: 2 }}>
          {reminder ? "REMAINING COURSE ASSIGNMENTS" : "COURSE ASSIGNMENTS"}
        </div>
        {snapshot.assignments.map((assignment) => {
          const player1Won = assignment.completed
            && assignment.player1_score !== null
            && assignment.player2_score !== null
            && assignment.player1_score < assignment.player2_score
          const player2Won = assignment.completed
            && assignment.player1_score !== null
            && assignment.player2_score !== null
            && assignment.player2_score < assignment.player1_score

          return (
            <div key={`${assignment.game_number}-${assignment.player1_display_name}-${assignment.player2_display_name}`} style={{ display: "flex", alignItems: "center", minHeight: 84, marginBottom: 8, padding: "10px 16px", borderLeft: `5px solid ${accent}`, borderRadius: 10, background: "#0f172a", fontSize: 18 }}>
              <div style={{ ...cell("9%", "flex-start"), color: accent, fontWeight: 900 }}>GAME {assignment.game_number}</div>
              <div style={playerNameStyle(assignment.player1_display_name, player1Won)}>{assignment.player1_display_name}</div>
              {assignment.completed ? (
                <div style={{ ...cell("8%"), padding: "7px 5px", borderRadius: 8, background: "#1e293b", color: player1Won ? winnerGreen : "#f8fafc", fontWeight: 900 }}>
                  {assignment.player1_score}
                </div>
              ) : <div style={cell("8%")} />}
              <div style={{ ...cell("5%"), color: accent, fontWeight: 900 }}>VS</div>
              {assignment.completed ? (
                <div style={{ ...cell("8%"), padding: "7px 5px", borderRadius: 8, background: "#1e293b", color: player2Won ? winnerGreen : "#f8fafc", fontWeight: 900 }}>
                  {assignment.player2_score}
                </div>
              ) : <div style={cell("8%")} />}
              <div style={playerNameStyle(assignment.player2_display_name, player2Won)}>{assignment.player2_display_name}</div>
              <div style={{ ...cell("20%", "flex-start"), padding: "0 10px", color: "#cbd5e1", lineHeight: 1.2, wordBreak: "break-word" }}>{assignment.course || "Course TBA"}</div>
              <div style={{ ...cell("14%"), justifyContent: "flex-end" }}>
                <div style={{ display: "flex", padding: "7px 10px", border: `1px solid ${assignment.completed ? accent : "#475569"}`, borderRadius: 999, color: assignment.completed ? accent : "#94a3b8", fontSize: 15, fontWeight: 900 }}>
                  {assignment.completed ? "COMPLETED" : "NOT PLAYED"}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!reminder && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
          <div style={{ display: "flex", marginBottom: 12, color: accent, fontSize: 25, fontWeight: 900, letterSpacing: 2 }}>
            CURRENT STANDINGS
          </div>
          <div style={{ display: "flex", minHeight: 48, padding: "8px 14px", borderRadius: "10px 10px 0 0", background: accent, color: "#020617", fontSize: 17, fontWeight: 900 }}>
            <div style={cell("8%")}>RANK</div><div style={cell("30%", "flex-start")}>PLAYER</div>
            <div style={cell("10%")}>PLAYED</div><div style={cell("9%")}>WINS</div><div style={cell("9%")}>LOSSES</div>
            <div style={cell("10%")}>DRAWS</div><div style={cell("12%")}>POINTS</div><div style={cell("12%")}>STROKES</div>
          </div>
          {snapshot.standings.map((standing, index) => (
            <div key={`${standing.division_number}-${standing.player_screen_name}`} style={{ display: "flex", minHeight: 54, padding: "8px 14px", borderBottom: "1px solid #25324a", background: index % 2 === 0 ? "#0b1222" : "#0f172a", fontSize: 19 }}>
              <div style={{ ...cell("8%"), color: accent, fontWeight: 900 }}>{standing.displayed_rank}</div>
              <div style={{ ...cell("30%", "flex-start"), fontSize: standing.player_screen_name.length > 22 ? 15 : 19, fontWeight: 800, wordBreak: "break-all" }}>{standing.player_screen_name}</div>
              <div style={cell("10%")}>{standing.played}</div><div style={cell("9%")}>{standing.wins}</div>
              <div style={cell("9%")}>{standing.losses}</div><div style={cell("10%")}>{standing.ties}</div>
              <div style={{ ...cell("12%"), fontWeight: 900 }}>{standing.points}</div><div style={cell("12%")}>{standing.strokes}</div>
            </div>
          ))}
        </div>
      )}
    </div>,
    { width: 1200, height },
  )
}
