import Link from "next/link"

export default function PerformanceSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Performance Settings</h1>

      <p style={subtitle}>
        Configure caching, optimization, monitoring, and application performance.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Performance Monitoring</strong>
          <span>
            Monitor application speed and resource usage.
          </span>
        </section>

        <section style={card}>
          <strong>Caching</strong>
          <span>
            Configure cache settings and optimization options.
          </span>
        </section>

        <section style={card}>
          <strong>Resource Usage</strong>
          <span>
            Review CPU, memory, and storage utilization.
          </span>
        </section>

        <section style={card}>
          <strong>Optimization</strong>
          <span>
            Configure performance tuning and maintenance options.
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