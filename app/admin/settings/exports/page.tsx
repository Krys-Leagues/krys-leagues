import Link from "next/link"

export default function ExportSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Export Settings</h1>

      <p style={subtitle}>
        Configure exports for players, standings, statistics, and league data.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Player Exports</strong>
          <span>
            Export player profiles, statistics, and history.
          </span>
        </section>

        <section style={card}>
          <strong>League Exports</strong>
          <span>
            Export standings, schedules, and season information.
          </span>
        </section>

        <section style={card}>
          <strong>Report Generation</strong>
          <span>
            Generate printable reports and summaries.
          </span>
        </section>

        <section style={card}>
          <strong>Export Formats</strong>
          <span>
            Configure CSV, PDF, and future export options.
          </span>
        </section>

        <Link href="/admin/settings" style={card}>
          <strong>Back to Settings</strong>
          <span>Return to the Settings page.</span>
        </Link>

        <Link href="/admin" style={card}>
          <strong>Back to Admin Home</strong>
          <span>Return to the main admin dashboard.</span>
        </Link>
      </div>
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "black",
  color: "white",
}

const title: React.CSSProperties = {
  fontSize: 34,
  marginBottom: 8,
}

const subtitle: React.CSSProperties = {
  color: "#cfcfcf",
  marginBottom: 28,
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 14,
}

const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 18,
  borderRadius: 14,
  border: "1px solid #333",
  background: "#111",
  color: "white",
  textDecoration: "none",
}