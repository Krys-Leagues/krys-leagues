import Link from "next/link"

export default function StorageSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Storage Settings</h1>

      <p style={subtitle}>
        Configure file storage, media management, and storage usage.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Media Storage</strong>
          <span>
            Manage uploaded images, videos, and league assets.
          </span>
        </section>

        <section style={card}>
          <strong>Storage Usage</strong>
          <span>
            Review available space and storage statistics.
          </span>
        </section>

        <section style={card}>
          <strong>Cleanup</strong>
          <span>
            Remove unused files and optimize storage.
          </span>
        </section>

        <section style={card}>
          <strong>Future Cloud Storage</strong>
          <span>
            Configure future external storage providers.
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