import Link from "next/link"

export default function TestingAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Testing</h1>

      <p style={subtitle}>
        Test new features, validate workflows, and verify system functionality before deployment.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Feature Testing</strong>
          <span>
            Test new pages and functionality before making them live.
          </span>
        </section>

        <section style={card}>
          <strong>Database Testing</strong>
          <span>
            Verify queries, imports, and data integrity.
          </span>
        </section>

        <section style={card}>
          <strong>League Simulations</strong>
          <span>
            Run simulated league events and scoring tests.
          </span>
        </section>

        <section style={card}>
          <strong>Deployment Checks</strong>
          <span>
            Confirm builds pass before Git and Vercel deployment.
          </span>
        </section>

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