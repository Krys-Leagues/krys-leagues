
import { ArtworkNavigation } from "@/components/navigation/ArtworkNavigation"
import { MainHubButtonClarity } from "@/components/navigation/MainHubButtonClarity"
import CupSignupAnnouncement from "@/components/announcements/CupSignupAnnouncement"
import MastersLiveAnnouncement from "@/components/announcements/MastersLiveAnnouncement"
import MastersWinnerVideo from "@/components/announcements/MastersWinnerVideo"
import YouTubeLiveLauncher from "@/components/announcements/YouTubeLiveLauncher"
import { artworkTargetStyle } from "@/lib/artworkNavigation"
import { mainHubAdminTarget, mainHubArtwork, mainHubYouTubeStyle } from "@/lib/artworkPageMaps"
import Link from "next/link"
import styles from "./main-hub-orientation.module.css"

const showCupSignupPromotion = process.env.MAIN_HUB_SHOW_CUP_SIGNUPS === "true"
const showMastersPromotion = process.env.MAIN_HUB_SHOW_MASTERS_PROMOTION === "true"

export default function HomePage() {
  return (
    <>
      <main className={styles.rotateNotice}>
        <p>Please turn your phone sideways to view Krys&apos; Leagues.</p>
      </main>
      <div className={styles.hub}>
        <ArtworkNavigation
          definition={mainHubArtwork}
          artworkTreatment={<MainHubButtonClarity imageSrc={mainHubArtwork.imageSrc} />}
          unoptimized
          hiddenTargetIds={[mainHubAdminTarget.id]}
          afterTargets={
            <>
              <YouTubeLiveLauncher artworkStyle={mainHubYouTubeStyle} />
              <Link
                href={mainHubAdminTarget.href}
                aria-label={mainHubAdminTarget.label}
                className="artwork-navigation__target"
                style={artworkTargetStyle(mainHubAdminTarget)}
                data-artwork-target-id={mainHubAdminTarget.id}
              >
                <span className="sr-only">{mainHubAdminTarget.label}</span>
              </Link>
            </>
          }
          afterFrame={
            <div className="artwork-navigation__hub-after-frame-layout">
              <MastersWinnerVideo />
            </div>
          }
        />
        {(showCupSignupPromotion || showMastersPromotion) && (
          <div className="artwork-navigation__hub-utility-stack" aria-label="Players Hub utilities">
            {showCupSignupPromotion && <CupSignupAnnouncement />}
            {showMastersPromotion && <MastersLiveAnnouncement />}
          </div>
        )}
      </div>
    </>
  )
}
