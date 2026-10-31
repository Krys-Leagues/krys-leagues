import Link from "next/link"

export default function BrandingSettingsPage() {
  return (
    <main style={page}>
      <h1 style={title}>Branding Settings</h1>

      <p style={subtitle}>
        Configure Krys Leagues branding, logos, icons, and visual identity.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>League Logo</strong>
          <span>
            Manage the primary Krys Leagues logo.
          </span>
        </section>

        <section style={card}>
          <strong>Site Branding</strong>
          <span>
            Configure colors, banners, and brand assets.
          </span>
        </section>

        <section style={card}>
          <strong>Media Assets</strong>
          <span>
            Upload and manage branding graphics and icons.
          </span>
        </section>

        <section style={card}>
          <strong>Brand Preview</strong>
          <span>
            Preview branding changes before publishing.
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