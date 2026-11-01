import Link from "next/link"

export default function KWTSetupPage() {
  return (
    <main style={page}>
      <h1 style={title}>KWT Season Setup</h1>

      <p style={subtitle}>
        Prepare KWT seasons, player imports, divisions, and league settings.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Season Information</strong>
          <span>Create and configure a new KWT season.</span>
        </section>

        <section style={card}>
          <strong>Player Imports</strong>
          <span>Prepare player lists before weekly CSV imports.</span>
        </section>

        <section style={card}>
          <strong>Division Setup</strong>
          <span>Configure divisions and league settings.</span>
        </section>

        <Link href="/admin/kwt-import" style={card}>
          <strong>Import Results</strong>
          <span>Upload KWT weekly CSV files.</span>
        </Link>

        <Link href="/admin/players" style={card}>
          <strong>Players</strong>
          <span>Open the global player manager.</span>
        </Link>

        <Link href="/admin/kwt" style={card}>
          <strong>Back to KWT Admin</strong>
          <span>Return to the KWT admin hub.</span>
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