import Link from "next/link"

export default function AdvancedSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Advanced Settings</h1>

      <p style={subtitle}>
        Configure advanced application behavior and system options.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Application Options</strong>
          <span>Advanced application configuration.</span>
        </section>

        <section style={card}>
          <strong>Performance</strong>
          <span>Configure caching and optimization settings.</span>
        </section>

        <section style={card}>
          <strong>Developer Options</strong>
          <span>Development and debugging configuration.</span>
        </section>

        <section style={card}>
          <strong>Experimental Features</strong>
          <span>Enable future features under development.</span>
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