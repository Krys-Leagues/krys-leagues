import PlayerAvatar from "@/components/PlayerAvatar"
import Image from "next/image"
import styles from "./PlayerProfileHero.module.css"

type FeaturedTrophy = { title: string; meta: string; imageUrl: string | null }
type CareerHighlight = { label: string; value: number }

type Props = { screenName: string; avatarPath: string | null; isServerBooster: boolean; hasKrysServerTag: boolean; profileBadges?: string[]; glowColor?: string; textColor?: string; featuredTrophy?: FeaturedTrophy | null; careerHighlights?: CareerHighlight[]; publicLayout?: boolean }

export default function PlayerProfileHero({ screenName, avatarPath, isServerBooster, hasKrysServerTag, profileBadges = [], glowColor = "#ff2bd6", textColor = "#f8fafc", featuredTrophy = null, careerHighlights = [], publicLayout = false }: Props) {
  const theme = { "--profile-glow": glowColor, "--profile-text": textColor } as React.CSSProperties
  return <section className={styles.hero} style={theme} aria-labelledby="player-profile-name" data-server-booster={isServerBooster} data-krys-server-tag={hasKrysServerTag}>
    <div className={styles.brandRow} aria-label={hasKrysServerTag ? "Krys Server Tag recognition" : "Krys Leagues"}>
      <Image className={`${styles.brandLogo} ${hasKrysServerTag ? styles.tagActive : ""}`} src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={92} height={92} alt="" aria-hidden="true" />
      <div className={styles.titleLockup}><span aria-hidden="true" /><p className={styles.profileTitle}>Krys Leagues Player Profile</p><span aria-hidden="true" /></div>
      <Image className={`${styles.brandLogo} ${hasKrysServerTag ? styles.tagActive : ""}`} src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={92} height={92} alt="" aria-hidden="true" />
    </div>
    {publicLayout && <div className={styles.heroGrid}>
      <section className={`${styles.sidePanel} ${styles.featuredPanel}`} aria-labelledby="featured-trophy-title">
        <p className={styles.panelEyebrow} id="featured-trophy-title">Featured Trophy</p>
        {featuredTrophy ? <>
          {/* Trophy URLs are authoritative media records and may use multiple approved hosts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {featuredTrophy.imageUrl && <img className={styles.trophyImage} src={featuredTrophy.imageUrl} alt={featuredTrophy.title} />}
          <h2 className={styles.panelTitle}>{featuredTrophy.title}</h2>
          {featuredTrophy.meta && <p className={styles.panelMeta}>{featuredTrophy.meta}</p>}
          <a className={styles.panelAction} href="#trophy-case">Trophy Case</a>
        </> : <p className={styles.emptyState}>No featured trophy yet.</p>}
      </section>
      <div className={styles.playerCore}>
        <div className={styles.avatarStage}>
          {isServerBooster && <div className={styles.boosterGlow} aria-hidden="true" />}
          <PlayerAvatar screenName={screenName} avatarPath={avatarPath} size="var(--player-profile-avatar-size)" imageFit="contain" borderRadius={0} className={styles.avatar} renderAsImage />
        </div>
        <div className={styles.identity}>
          <h1 id="player-profile-name" className={styles.name}>{screenName}</h1>
          {profileBadges.length > 0 && <div className={styles.badges} aria-label="Player recognition">{profileBadges.map(badge => <span key={badge}>{badge}</span>)}</div>}
        </div>
      </div>
      <section className={`${styles.sidePanel} ${styles.highlightsPanel}`} aria-labelledby="career-highlights-title">
        <p className={styles.panelEyebrow} id="career-highlights-title">Career Highlights</p>
        {careerHighlights.length > 0 ? <div className={styles.highlightGrid}>{careerHighlights.map(highlight => <div className={styles.highlight} key={highlight.label}><strong>{highlight.value}</strong><span>{highlight.label}</span></div>)}</div> : <p className={styles.emptyState}>No verified highlights yet.</p>}
      </section>
    </div>}
    {!publicLayout && <div className={styles.playerCore}>
      <div className={styles.avatarStage}>{isServerBooster && <div className={styles.boosterGlow} aria-hidden="true" />}<PlayerAvatar screenName={screenName} avatarPath={avatarPath} size="var(--player-profile-avatar-size)" imageFit="contain" borderRadius={0} className={styles.avatar} renderAsImage /></div>
      <div className={styles.identity}><h1 id="player-profile-name" className={styles.name}>{screenName}</h1>{profileBadges.length > 0 && <div className={styles.badges} aria-label="Player recognition">{profileBadges.map(badge => <span key={badge}>{badge}</span>)}</div>}{(isServerBooster || hasKrysServerTag) && <div className={styles.recognitionRow}>{isServerBooster && <div className={`${styles.recognition} ${styles.boosterRecognition}`}><span className={styles.boosterIcon} aria-hidden="true">✦</span><strong>Server Booster</strong></div>}{hasKrysServerTag && <div className={`${styles.recognition} ${styles.tagRecognition}`}><Image src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={38} height={38} alt="" aria-hidden="true" /><strong>Server Tag</strong></div>}</div>}</div>
    </div>}
    {publicLayout && <section className={styles.recognitionBand} aria-labelledby="community-recognition-title">
      <p className={styles.recognitionTitle} id="community-recognition-title">Community Recognition</p>
      <div className={styles.recognitionRow}>
        {isServerBooster && <div className={`${styles.recognition} ${styles.boosterRecognition}`}><span className={styles.boosterIcon} aria-hidden="true">✦</span><strong>Server Booster</strong></div>}
        {hasKrysServerTag && <div className={`${styles.recognition} ${styles.tagRecognition}`}><Image src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={38} height={38} alt="" aria-hidden="true" /><strong>Server Tag</strong></div>}
        {!isServerBooster && !hasKrysServerTag && <p className={styles.recognitionEmpty}>No recognition badges yet.</p>}
      </div>
    </section>}
  </section>
}
