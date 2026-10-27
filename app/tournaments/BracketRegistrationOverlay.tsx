import Link from "next/link"
import type { PublicLiveTournament } from "@/lib/tournaments/public"

export default function BracketRegistrationOverlay({ live }: { live: PublicLiveTournament[] }) {
  return (
    <div aria-live="polite" style={overlay}>
      {live.length > 0 ? <div style={livePanel}>
        <strong>LIVE BRACKET PREVIEW</strong>
        <span>{live.length === 1 ? live[0].name : `${live.length} published brackets`}</span>
        <Link href="/tournaments/current#live-preview" style={liveLink}>View live bracket →</Link>
      </div> : null}
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  pointerEvents: "none",
}

const livePanel: React.CSSProperties = {
  position: "absolute",
  top: "28%",
  left: "20.5%",
  width: "59%",
  height: "35%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4%",
  padding: "3%",
  borderRadius: "3%",
  color: "#fff",
  background: "#010a1f",
  boxShadow: "none",
  fontSize: "clamp(12px, 1.45vw, 24px)",
  textAlign: "center",
  pointerEvents: "auto",
}

const liveLink: React.CSSProperties = {
  color: "#a7f3d0",
  fontSize: "0.8em",
  fontWeight: 800,
  textDecoration: "none",
}
