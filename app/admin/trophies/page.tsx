"use client"

export default function TrophyAdminPage() {
  return (
    <main style={{ background: "black", color: "white", minHeight: "100vh", padding: 24 }}>
      <h1>Trophy Admin</h1>

      <p style={{ color: "#aaa" }}>
        Manage trophies for leagues, KWT, and tournaments.
      </p>

      <div style={{ marginTop: 20 }}>
        <div style={card}>
          <h2>Create Trophy Entry</h2>
          <p>Upload or register a new trophy after you create it.</p>
        </div>

        <div style={card}>
          <h2>Recent Trophies</h2>
          <p>View recently added trophies.</p>
        </div>

        <div style={card}>
          <h2>Player Trophy Lookup</h2>
          <p>Search a player and view their trophies.</p>
        </div>
      </div>
    </main>
  )
}

const card: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  background: "#080808",
}