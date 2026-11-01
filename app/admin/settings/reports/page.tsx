import Link from "next/link"

export default function ReportsSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Report Settings</h1>

      <p style={subtitle}>
        Configure report generation, exports, printable layouts, and scheduled reports.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Report Templates</strong>
          <span>
            Configure layouts for league and player reports.
          </span>
        </section>

        <section style={card}>
          <strong>Scheduled Reports</strong>
          <span>
            Configure automatic report generation.
          </span>
        </section>

        <section style={card}>
          <strong>Export Formats</strong>
          <span>
            Configure PDF, CSV, and spreadsheet output.
          </span>
        </section>

        <section style={card}>
          <strong>Public Reports</strong>
          <span>
            Configure which reports are visible to the public.
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