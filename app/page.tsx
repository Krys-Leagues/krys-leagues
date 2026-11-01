
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import CupSignupAnnouncement from "@/components/announcements/CupSignupAnnouncement"
import MastersLiveAnnouncement from "@/components/announcements/MastersLiveAnnouncement"
import MastersWinnerVideo from "@/components/announcements/MastersWinnerVideo"
import YouTubeLiveLauncher from "@/components/announcements/YouTubeLiveLauncher"
import { mainHubArtwork } from "@/lib/artworkPageMaps"
import Image from "next/image"
import Link from "next/link"

export default function HomePage() {
  return (
    <>
      <ArtworkNavigation
        definition={mainHubArtwork}
        hiddenTargetIds={["admin-login"]}
        frameAspectRatio="1664 / 850"
        frameClassName="artwork-navigation__main-hub-frame--cropped"
        afterFrame={
          <div className="artwork-navigation__hub-after-frame-layout">
            <MastersWinnerVideo />
            <div className="artwork-navigation__main-hub-actions" aria-label="Main hub preview actions">
              <Link href="/course-challenges" className="artwork-navigation__course-challenges-preview-link" aria-label="Course Challenges">
                <Image className="artwork-navigation__course-challenges-preview-banner" src="/course-challenges/course-challenges-hub-extension-preview.png" alt="Course Challenges" width={1364} height={230} priority draggable={false} />
              </Link>
              <div className="artwork-navigation__next-major-state" aria-label="Next Major: The MGA coming soon">
                <strong>THE MGA OPEN</strong>
                <small>COMING SOON</small>
              </div>
              <YouTubeLiveLauncher />
              <div className="artwork-navigation__admin-treatment">
                <span className="artwork-navigation__admin-accent" aria-hidden="true" />
                <Link href="/admin" className="artwork-navigation__admin-link"><span className="artwork-navigation__admin-gear" aria-hidden="true">⚙</span>ADMIN LOGIN</Link>
                <span className="artwork-navigation__admin-accent" aria-hidden="true" />
              </div>
            </div>
          </div>
        }
      />
      <div className="artwork-navigation__hub-utility-stack" aria-label="Players Hub utilities">
        <CupSignupAnnouncement />
        <MastersLiveAnnouncement />
      </div>
    </>
  )
}
