export default function KWTPage() {
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
      <h1 style={{ fontSize: 42 }}>🏆 KWT</h1>

      <p style={{ color: "#cbd5e1", fontSize: 18 }}>
        Krys Weekly Tournament
      </p>

      <div
        style={{
          display: "grid",
          gap: 20,
          marginTop: 30,
        }}
      >
        <div style={card}>
          <h2>Current Tournament</h2>
          <p>Coming Soon</p>
        </div>

        <div style={card}>
          <h2>Upcoming Events</h2>
          <p>Coming Soon</p>
        </div>

        <div style={card}>
          <h2>Past Champions</h2>
          <p>Coming Soon</p>
        </div>

        <div style={card}>
          <h2>Records</h2>
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