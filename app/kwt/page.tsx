import Link from "next/link"
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { kwtArtwork } from "@/lib/artworkPageMaps"

export default function KWTPage() {
  return (
    <>
    <ArtworkNavigation
      definition={kwtArtwork}
      overlay={
        <Link href="/" className="artwork-navigation__back-link" aria-label="Back to Krys Leagues">← Krys Leagues</Link>
      }
    />
    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12, padding: "18px 16px 28px", background: "#05020d" }}><Link href="/kwt/net" style={{ color: "#fff", border: "1px solid #4de8ff", borderRadius: 999, padding: "10px 16px", textDecoration: "none", fontWeight: 900 }}>OPEN KWT NET LEADERBOARD</Link><Link href="/kwt/champions" style={{ color: "#fff", border: "1px solid #f3c969", borderRadius: 999, padding: "10px 16px", textDecoration: "none", fontWeight: 900 }}>KWT HALL OF CHAMPIONS &amp; MEMORIES</Link></div>
    </>
  )
}
