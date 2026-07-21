export default function TournamentsPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "white",
        padding: "40px",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 42 }}>🏆 Tournament Center</h1>

      <p style={{ color: "#cbd5e1", fontSize: 18 }}>
        View all current and upcoming Krys Leagues tournaments.
      </p>

      <div
        style={{
          display: "grid",
          gap: 20,
          marginTop: 30,
        }}
      >
        <div style={card}>
          <h2>Open for Registration</h2>
          <p>No tournaments currently accepting registrations.</p>
        </div>

        <div style={card}>
          <h2>In Progress</h2>
          <p>No tournaments currently running.</p>
        </div>

        <div style={card}>
          <h2>Invitationals</h2>
          <ul>
            <li>Krys Cup</li>
            <li>Spicy Cup</li>
            <li>Champion of Champions</li>
          </ul>
          <p style={{ color: "#94a3b8" }}>
            Earn invitations through qualifying tournaments.
          </p>
        </div>

        <div style={card}>
          <h2>Past Champions</h2>
          <p>Coming Soon</p>
        </div>
      </div>
    </main>
  )
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
}