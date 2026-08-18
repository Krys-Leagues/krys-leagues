import PlayerAvatar from "@/components/PlayerAvatar"
import Image from "next/image"
import styles from "./PlayerProfileHero.module.css"

type Props = { screenName: string; avatarPath: string | null; isServerBooster: boolean; hasKrysServerTag: boolean; aliases?: string[]; profileBadges?: string[]; glowColor?: string; textColor?: string }

export default function PlayerProfileHero({ screenName, avatarPath, isServerBooster, hasKrysServerTag, aliases = [], profileBadges = [], glowColor = "#ff2bd6", textColor = "#f8fafc" }: Props) {
  const theme = { "--profile-glow": glowColor, "--profile-text": textColor } as React.CSSProperties
  return <section className={styles.hero} style={theme} aria-labelledby="player-profile-name">
    <div className={styles.brandRow} aria-label={hasKrysServerTag ? "Krys Server Tag recognition" : "Krys Leagues"}>
      {["left", "right"].map(side => <Image key={side} className={`${styles.brandLogo} ${hasKrysServerTag ? styles.tagActive : ""}`} src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={82} height={82} alt="" aria-hidden="true" />)}
    </div>
    {avatarPath && <div className={styles.avatarStage}>
      {isServerBooster && <div className={styles.boosterGlow} aria-hidden="true" />}
      <PlayerAvatar screenName={screenName} avatarPath={avatarPath} size="var(--player-profile-avatar-size)" imageFit="contain" borderRadius={0} className={styles.avatar} renderAsImage />
    </div>}
    <div className={styles.identity}>
      <h1 id="player-profile-name" className={styles.name}>{screenName}</h1>
      {profileBadges.length > 0 && <div className={styles.badges} aria-label="Player recognition">{profileBadges.map(badge => <span key={badge}>{badge}</span>)}</div>}
      {aliases.length > 0 && <p className={styles.aliases}>Formerly known as {aliases.join(", ")}</p>}
    </div>
  </section>
}
