
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
              <Link href="/majors/masters" className="artwork-navigation__masters-link" aria-label="The Masters — Register now">
                <svg className="artwork-navigation__masters-jacket" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
                  <path d="M23 12 36 7l13 5 13 9-6 36H16L10 21l13-9Z" />
                  <path d="M23 12 36 28l13-16M36 7v48M28 40h-8M44 40h8" />
                  <path d="m28 40 8-7 8 7v13H28ZM30 48h12M30 53h12" />
                  <circle cx="36" cy="28" r="1.8" /><circle cx="36" cy="36" r="1.8" />
                  <image href="/krys-leagues-logo.png" x="29.8" y="31.8" width="12.4" height="12.4" preserveAspectRatio="xMidYMid slice" />
                </svg>
                <span className="artwork-navigation__masters-copy"><strong>WELCOME TO THE MASTERS</strong><small>REGISTER NOW</small></span>
                <span className="artwork-navigation__masters-arrow" aria-hidden="true">→</span>
              </Link>
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
