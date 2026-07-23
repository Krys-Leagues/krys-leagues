import Link from "next/link"

export default function MediaAdminPage() {
  return (
    <main style={page}>
      <h1 style={title}>Media Library</h1>

      <p style={subtitle}>
        Manage videos, images, trophies, banners, logos, and downloadable media used throughout Krys Leagues.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Trophy Media</strong>
          <span>
            Manage trophy images, videos, and Champion media.
          </span>
        </section>

        <section style={card}>
          <strong>League Images</strong>
          <span>
            Upload league banners, logos, and promotional artwork.
          </span>
        </section>

        <section style={card}>
          <strong>Player Media</strong>
          <span>
            Manage player profile images and featured content.
          </span>
        </section>

        <section style={card}>
          <strong>Downloads</strong>
          <span>
            Organize downloadable files used across the website.
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