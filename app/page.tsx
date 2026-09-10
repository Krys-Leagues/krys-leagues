
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { mainHubArtwork } from "@/lib/artworkPageMaps"
import Image from "next/image"
import Link from "next/link"

export default function HomePage() {
  return (
    <ArtworkNavigation
      definition={mainHubArtwork}
      hiddenTargetIds={["admin-login"]}
      frameAspectRatio="1664 / 850"
      frameClassName="artwork-navigation__main-hub-frame--cropped"
      afterFrame={
        <div className="artwork-navigation__main-hub-actions" aria-label="Main hub preview actions">
          <Link
            href="/course-challenges"
            className="artwork-navigation__course-challenges-preview-link"
            aria-label="Course Challenges"
          >
            <Image
              className="artwork-navigation__course-challenges-preview-banner"
              src="/course-challenges/course-challenges-hub-extension-preview.png"
              alt="Course Challenges"
              width={1364}
              height={230}
              priority
              draggable={false}
            />
          </Link>
          <div className="artwork-navigation__admin-treatment">
            <span className="artwork-navigation__admin-accent" aria-hidden="true" />
            <Link href="/admin" className="artwork-navigation__admin-link">
              <span className="artwork-navigation__admin-gear" aria-hidden="true">⚙</span>
              ADMIN LOGIN
            </Link>
            <span className="artwork-navigation__admin-accent" aria-hidden="true" />
          </div>
        </div>
      }
    />
  )
}
