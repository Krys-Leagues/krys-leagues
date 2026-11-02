import Link from "next/link"
import { PublicLeagueBoard } from "@/components/publicLeague/PublicLeagueBoard"

export default function PublicStandingsPage() {
  return (
    <main style={page}>
      <Link href="/stroke" style={backButton}>← Stroke Play</Link>
      <PublicLeagueBoard kind="stroke" />
    </main>
  )
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: "24px 16px 48px",
  background: "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  margin: "0 auto 4px",
  padding: "10px 16px",
  border: "1px solid #475569",
  borderRadius: 10,
  background: "#1e293b",
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}
