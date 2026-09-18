import "server-only"

import { ImageResponse } from "next/og"

import type { MatchDiscordSnapshot } from "./matchDiscord"

const DIVISION_ACCENTS: Record<number, string> = {
  1: "#fb923c",
  2: "#4ade80",
  3: "#60a5fa",
  4: "#facc15",
  5: "#c084fc",
}

const cell = (width: string, justifyContent: "flex-start" | "center" = "center") => ({
  display: "flex",
  width,
  justifyContent,
  alignItems: "center",
}) as const

export function createMatchDivisionImage(snapshot: MatchDiscordSnapshot) {
  const accent = DIVISION_ACCENTS[snapshot.division_number] || "#f8fafc"
  const winnerGreen = "#4ade80"
  const height = 420 + snapshot.assignments.length * 84 + snapshot.standings.length * 62

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "46px 54px",
        color: "#f8fafc",
        background: "linear-gradient(145deg, #020617 0%, #071226 52%, #02040a 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: "#94a3b8" }}>
          KRYS LEAGUES · MATCH PLAY
        </div>
        <div style={{ display: "flex", padding: "12px 20px", border: `2px solid ${accent}`, borderRadius: 999, fontSize: 24, fontWeight: 800 }}>
          SEASON {snapshot.season_number}
        </div>
      </div>

      <div style={{ display: "flex", width: "100%", justifyContent: "center", marginTop: 16, textAlign: "center", fontSize: 50, fontWeight: 900, color: accent }}>
        MATCH DIVISION {snapshot.division_number}
      </div>

      <div style={{ display: "flex", height: 4, margin: "28px 0 24px", borderRadius: 99, background: accent }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", marginBottom: 12, color: accent, fontSize: 25, fontWeight: 900, letterSpacing: 2 }}>
          COURSE ASSIGNMENTS
        </div>
        {snapshot.assignments.length === 0 ? (
          <div style={{ display: "flex", padding: "14px 18px", borderRadius: 12, background: "#0f172a", color: "#cbd5e1", fontSize: 20 }}>
            Course assignments are not published yet.
          </div>
        ) : snapshot.assignments.map((assignment) => {
          const player1Won = assignment.completed
            && assignment.player1_holes_won !== null
            && assignment.player2_holes_won !== null
            && assignment.player1_holes_won > assignment.player2_holes_won
          const player2Won = assignment.completed
            && assignment.player1_holes_won !== null
            && assignment.player2_holes_won !== null
            && assignment.player2_holes_won > assignment.player1_holes_won

          return (
            <div key={`${assignment.game_number}-${assignment.player1_display_name}-${assignment.player2_display_name}`} style={{ display: "flex", alignItems: "center", minHeight: 76, marginBottom: 8, padding: "10px 16px", borderLeft: `5px solid ${accent}`, borderRadius: 10, background: "#0f172a", fontSize: 18 }}>
              <div style={{ ...cell("11%", "flex-start"), color: accent, fontWeight: 900 }}>GAME {assignment.game_number}</div>
              <div style={{ display: "flex", width: "47%", alignItems: "center" }}>
                <div style={{ ...cell("32%", "flex-start"), color: player1Won ? winnerGreen : "#f8fafc", fontWeight: 800 }}>{assignment.player1_display_name || "Player 1"}</div>
                {assignment.completed ? (
                  <div style={{ ...cell("13%"), padding: "7px 5px", borderRadius: 8, background: "#1e293b", color: player1Won ? winnerGreen : "#f8fafc", fontWeight: 900 }}>
                    {assignment.player1_holes_won} HW
                  </div>
                ) : <div style={cell("13%")} />}
                <div style={{ ...cell("10%"), color: accent, fontWeight: 900 }}>VS</div>
                {assignment.completed ? (
                  <div style={{ ...cell("13%"), padding: "7px 5px", borderRadius: 8, background: "#1e293b", color: player2Won ? winnerGreen : "#f8fafc", fontWeight: 900 }}>
                    {assignment.player2_holes_won} HW
                  </div>
                ) : <div style={cell("13%")} />}
                <div style={{ ...cell("32%", "flex-start"), paddingLeft: 8, color: player2Won ? winnerGreen : "#f8fafc", fontWeight: 800 }}>{assignment.player2_display_name || "Player 2"}</div>
              </div>
              <div style={{ ...cell("25%", "flex-start"), paddingLeft: 10, color: "#cbd5e1" }}>{assignment.course || "Course TBA"}</div>
              <div style={{ ...cell("17%"), justifyContent: "flex-end" }}>
                <div style={{ display: "flex", padding: "7px 10px", border: `1px solid ${assignment.completed ? accent : "#475569"}`, borderRadius: 999, color: assignment.completed ? accent : "#94a3b8", fontSize: 15, fontWeight: 900 }}>
                  {assignment.completed ? "COMPLETED" : "NOT PLAYED"}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
        <div style={{ display: "flex", marginBottom: 12, color: accent, fontSize: 25, fontWeight: 900, letterSpacing: 2 }}>
          CURRENT STANDINGS
        </div>
        <div style={{ display: "flex", minHeight: 48, padding: "8px 14px", borderRadius: "10px 10px 0 0", background: accent, color: "#020617", fontSize: 17, fontWeight: 900 }}>
          <div style={cell("8%")}>RANK</div><div style={cell("30%", "flex-start")}>PLAYER</div>
          <div style={cell("10%")}>PLAYED</div><div style={cell("9%")}>WINS</div><div style={cell("9%")}>LOSSES</div>
          <div style={cell("10%")}>DRAWS</div><div style={cell("12%")}>POINTS</div><div style={cell("12%")}>HW</div>
        </div>
        {snapshot.standings.map((standing, index) => (
          <div key={standing.player_screen_name} style={{ display: "flex", minHeight: 54, padding: "8px 14px", borderBottom: "1px solid #25324a", background: index % 2 === 0 ? "#0b1222" : "#0f172a", fontSize: 19 }}>
            <div style={{ ...cell("8%"), color: accent, fontWeight: 900 }}>{standing.displayed_rank}</div>
            <div style={{ ...cell("30%", "flex-start"), fontWeight: 800 }}>{standing.player_screen_name}</div>
            <div style={cell("10%")}>{standing.played}</div><div style={cell("9%")}>{standing.wins}</div>
            <div style={cell("9%")}>{standing.losses}</div><div style={cell("10%")}>{standing.draws}</div>
            <div style={{ ...cell("12%"), fontWeight: 900 }}>{standing.points}</div><div style={cell("12%")}>{standing.holes_won}</div>
          </div>
        ))}
      </div>
    </div>,
    { width: 1200, height },
  )
}
