
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { mainHubArtwork } from "@/lib/artworkPageMaps"
import Link from "next/link"

export default function HomePage() {
  return (
    <ArtworkNavigation
      definition={mainHubArtwork}
      hiddenTargetIds={["admin-login"]}
      overlay={<div className="artwork-navigation__main-hub-footer-cover" aria-hidden="true" />}
      afterFrame={
        <div className="artwork-navigation__main-hub-actions" aria-label="Featured Krys Leagues destinations">
          <Link href="/course-challenges" className="artwork-navigation__featured-course-link">
            <span aria-hidden="true">✦</span>
            KRYS LEAGUES COURSE CHALLENGES
          </Link>
          <Link href="/admin" className="artwork-navigation__admin-link">ADMIN LOGIN</Link>
        </div>
      }
    />
  )
}
