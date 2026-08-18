import PlayerAvatar from "@/components/PlayerAvatar"
import Image from "next/image"
import styles from "./PlayerProfileHero.module.css"

type Props = { screenName: string; avatarPath: string | null; isServerBooster: boolean; hasKrysServerTag: boolean; profileBadges?: string[]; glowColor?: string; textColor?: string }

export default function PlayerProfileHero({ screenName, avatarPath, isServerBooster, hasKrysServerTag, profileBadges = [], glowColor = "#ff2bd6", textColor = "#f8fafc" }: Props) {
  const theme = { "--profile-glow": glowColor, "--profile-text": textColor } as React.CSSProperties
  return <section className={styles.hero} style={theme} aria-labelledby="player-profile-name" data-server-booster={isServerBooster} data-krys-server-tag={hasKrysServerTag}>
    <div className={styles.brandRow} aria-label={hasKrysServerTag ? "Krys Server Tag recognition" : "Krys Leagues"}>
      <Image className={`${styles.brandLogo} ${hasKrysServerTag ? styles.tagActive : ""}`} src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={92} height={92} alt="" aria-hidden="true" />
      <p className={styles.profileTitle}>Krys Leagues Player Profile</p>
      <Image className={`${styles.brandLogo} ${hasKrysServerTag ? styles.tagActive : ""}`} src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={92} height={92} alt="" aria-hidden="true" />
    </div>
    {avatarPath && <div className={styles.avatarStage}>
      {isServerBooster && <div className={styles.boosterGlow} aria-hidden="true" />}
      <PlayerAvatar screenName={screenName} avatarPath={avatarPath} size="var(--player-profile-avatar-size)" imageFit="contain" borderRadius={0} className={styles.avatar} renderAsImage />
    </div>}
    <div className={styles.identity}>
      <h1 id="player-profile-name" className={styles.name}>{screenName}</h1>
      {profileBadges.length > 0 && <div className={styles.badges} aria-label="Player recognition">{profileBadges.map(badge => <span key={badge}>{badge}</span>)}</div>}
      {(isServerBooster || hasKrysServerTag) && <div className={styles.recognitionRow} aria-label="Community recognition">
        {isServerBooster && <div className={`${styles.recognition} ${styles.boosterRecognition}`}><span className={styles.boosterIcon} aria-hidden="true">✦</span><strong>Server Booster</strong></div>}
        {hasKrysServerTag && <div className={`${styles.recognition} ${styles.tagRecognition}`}><Image src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={38} height={38} alt="" aria-hidden="true" /><strong>Server Tag</strong></div>}
      </div>}
    </div>
  </section>
}
