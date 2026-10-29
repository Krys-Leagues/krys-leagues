import Link from "next/link"

export default function ChampionOfChampionsSetupPage() {
  return (
    <main style={page}>
      <h1 style={title}>Champion of Champions Setup</h1>

      <p style={subtitle}>
        Prepare the Champion of Champions field, event details, courses, and
        bracket.
      </p>

      <div style={grid}>
        <section style={card}>
          <strong>Event Information</strong>
          <span>Create the event year, dates, and competition details.</span>
        </section>

        <section style={card}>
          <strong>Qualified Champions</strong>
          <span>Add the eligible champions competing in the event.</span>
        </section>

        <section style={card}>
          <strong>Course Setup</strong>
          <span>Choose the courses and round format.</span>
        </section>

        <section style={card}>
          <strong>Bracket Setup</strong>
          <span>Prepare the matchups and advancement structure.</span>
        </section>

        <Link href="/admin/champion-of-champions/results" style={card}>
          <strong>Results</strong>
          <span>Enter or review Champion of Champions results.</span>
        </Link>

        <Link href="/admin/champion-of-champions" style={card}>
          <strong>Back to Champion Admin</strong>
          <span>Return to the Champion of Champions admin hub.</span>
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
  maxWidth: 760,
  lineHeight: 1.5,
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