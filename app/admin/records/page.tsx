import Link from "next/link"

export default function RecordsAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Records Admin</h1>

      <p style={subtitle}>
        Choose which records page you want to open.
      </p>

      <div style={grid}>
        <Link href="/admin/records/arizona-modern" style={card}>
          <strong>Arizona Modern Pilot</strong>
          <span>Preview AME/AMH workbook imports and legacy combined reconciliation.</span>
        </Link>

        <Link href="/admin/records/combined" style={card}>
          <strong>Combined Course Records</strong>
          <span>View Easy and Hard all-time course records.</span>
        </Link>

        <Link href="/admin/records/single" style={card}>
          <strong>Single Course Records</strong>
          <span>View individual course leaderboards.</span>
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
