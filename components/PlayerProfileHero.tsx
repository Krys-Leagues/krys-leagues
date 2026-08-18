import PlayerAvatar from "@/components/PlayerAvatar"
import styles from "./PlayerProfileHero.module.css"

type PlayerProfileHeroProps = {
  screenName: string
  avatarPath: string | null
  isServerBooster: boolean
  hasKrysServerTag: boolean
  aliases?: string[]
}

export default function PlayerProfileHero({
  screenName,
  avatarPath,
  isServerBooster,
  hasKrysServerTag,
  aliases = [],
}: PlayerProfileHeroProps) {
  const recognitionClasses = [
    styles.hero,
    isServerBooster ? styles.booster : "",
    hasKrysServerTag ? styles.serverTag : "",
  ].filter(Boolean).join(" ")

  return (
    <section
      className={recognitionClasses}
      data-server-booster={isServerBooster}
      data-krys-server-tag={hasKrysServerTag}
      aria-labelledby="player-profile-name"
    >
      <div className={styles.backdrop} aria-hidden="true">
        {hasKrysServerTag && <div className={styles.crest} />}
      </div>

      <div className={`${styles.identity} ${avatarPath ? styles.withAvatar : styles.withoutAvatar}`}>
        {avatarPath && (
          <div className={styles.avatarFrame}>
            <PlayerAvatar screenName={screenName} avatarPath={avatarPath} size={156} />
          </div>
        )}

        <div className={styles.copy}>
          <p className={styles.eyebrow}>Krys Leagues Player Profile</p>
          <h1 id="player-profile-name" className={styles.name}>{screenName}</h1>
          <p className={styles.subtitle}>Career history, league progression, statistics, trophies, and achievements.</p>
          {aliases.length > 0 && (
            <p className={styles.aliases}>Formerly known as {aliases.join(", ")}</p>
          )}
        </div>
      </div>
    </section>
  )
}
