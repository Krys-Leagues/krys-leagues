export default function LeaguePlayPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "white",
        maxWidth: 1100,
        margin: "0 auto",
        padding: "40px",
      }}
    >
      <h1 style={{ fontSize: 42 }}>🏌️ League Play</h1>

      <p style={{ color: "#cbd5e1", fontSize: 18 }}>
        Choose a league to view schedules, standings, results and records.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 20,
          marginTop: 30,
        }}
      >
        {[
          "Stroke Play",
          "Match Play",
          "Doubles",
          "Amateur → Pro",
        ].map((league) => (
          <div
            key={league}
            style={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <h2>{league}</h2>

            <p>Schedules • Standings • Results • Records</p>
          </div>
        ))}
      </div>
    </main>
  )
}