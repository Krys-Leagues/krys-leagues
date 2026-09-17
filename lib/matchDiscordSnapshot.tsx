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
  const height = 390 + snapshot.assignments.length * 58 + snapshot.standings.length * 62

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
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 22, letterSpacing: 5, color: "#94a3b8" }}>
            KRYS LEAGUES · MATCH PLAY
          </div>
          <div style={{ display: "flex", marginTop: 9, fontSize: 50, fontWeight: 900, color: accent }}>
            MATCH DIVISION {snapshot.division_number}
          </div>
        </div>
        <div style={{ display: "flex", padding: "12px 20px", border: `2px solid ${accent}`, borderRadius: 999, fontSize: 24, fontWeight: 800 }}>
          SEASON {snapshot.season_number}
        </div>
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
        ) : snapshot.assignments.map((assignment) => (
          <div key={`${assignment.game_number}-${assignment.player1_display_name}-${assignment.player2_display_name}`} style={{ display: "flex", alignItems: "center", minHeight: 50, marginBottom: 8, padding: "8px 16px", borderLeft: `5px solid ${accent}`, borderRadius: 10, background: "#0f172a", fontSize: 20 }}>
            <div style={{ ...cell("13%", "flex-start"), color: accent, fontWeight: 900 }}>GAME {assignment.game_number}</div>
            <div style={{ ...cell("27%", "flex-start"), fontWeight: 700 }}>{assignment.player1_display_name || "Player 1"}</div>
            <div style={{ ...cell("7%"), color: accent, fontWeight: 900 }}>VS</div>
            <div style={{ ...cell("27%", "flex-start"), fontWeight: 700 }}>{assignment.player2_display_name || "Player 2"}</div>
            <div style={{ ...cell("26%", "flex-start"), color: "#cbd5e1" }}>{assignment.course || "Course TBA"}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
        <div style={{ display: "flex", marginBottom: 12, color: accent, fontSize: 25, fontWeight: 900, letterSpacing: 2 }}>
          CURRENT STANDINGS
        </div>
        <div style={{ display: "flex", minHeight: 48, padding: "8px 14px", borderRadius: "10px 10px 0 0", background: accent, color: "#020617", fontSize: 17, fontWeight: 900 }}>
          <div style={cell("8%")}>RANK</div><div style={cell("35%", "flex-start")}>PLAYER</div>
          <div style={cell("8%")}>P</div><div style={cell("8%")}>W</div><div style={cell("8%")}>L</div>
          <div style={cell("8%")}>D</div><div style={cell("12%")}>POINTS</div><div style={cell("13%")}>HW</div>
        </div>
        {snapshot.standings.map((standing, index) => (
          <div key={standing.player_screen_name} style={{ display: "flex", minHeight: 54, padding: "8px 14px", borderBottom: "1px solid #25324a", background: index % 2 === 0 ? "#0b1222" : "#0f172a", fontSize: 19 }}>
            <div style={{ ...cell("8%"), color: accent, fontWeight: 900 }}>{standing.displayed_rank}</div>
            <div style={{ ...cell("35%", "flex-start"), fontWeight: 800 }}>{standing.player_screen_name}</div>
            <div style={cell("8%")}>{standing.played}</div><div style={cell("8%")}>{standing.wins}</div>
            <div style={cell("8%")}>{standing.losses}</div><div style={cell("8%")}>{standing.draws}</div>
            <div style={{ ...cell("12%"), fontWeight: 900 }}>{standing.points}</div><div style={cell("13%")}>{standing.holes_won}</div>
          </div>
        ))}
      </div>
    </div>,
    { width: 1200, height },
  )
}
