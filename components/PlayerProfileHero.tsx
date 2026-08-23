import PlayerAvatar from "@/components/PlayerAvatar"
import Image from "next/image"
import styles from "./PlayerProfileHero.module.css"

type FeaturedTrophy = { title: string; meta: string; imageUrl: string | null }
type CareerHighlight =
  | { kind: "stat"; label: string; value: number }
  | { kind: "monthly"; label: string; division: string; placement: string; medal: string }

export type PlayerNameEffect = "auto" | "white" | "booster" | "server-tag" | "both" | "holographic"
type Props = { screenName: string; avatarPath: string | null; isServerBooster: boolean; hasKrysServerTag: boolean; nameEffect?: PlayerNameEffect; profileBadges?: string[]; glowColor?: string; avatarGlowColor?: string; textColor?: string; showAvatarGlow?: boolean; avatarGlowStrength?: number; featuredTrophy?: FeaturedTrophy | null; careerHighlights?: CareerHighlight[]; publicLayout?: boolean }

type RecognitionProps = Pick<Props, "isServerBooster" | "hasKrysServerTag" | "profileBadges" | "glowColor" | "textColor">

export function PlayerProfileRecognition({ isServerBooster, hasKrysServerTag, profileBadges = [], glowColor = "#ff2bd6", textColor = "#f8fafc" }: RecognitionProps) {
  if (!isServerBooster && !hasKrysServerTag && profileBadges.length === 0) return null
  const theme = { "--profile-glow": glowColor, "--profile-text": textColor } as React.CSSProperties
  return <section className={styles.recognitionBand} style={theme} aria-label="Community recognition">
    <div className={styles.recognitionRow}>
      {isServerBooster && <div className={`${styles.recognition} ${styles.boosterRecognition}`}><span className={styles.boosterIcon} aria-hidden="true">✦</span><span><strong>Server Booster</strong><small>Thank you for supporting the server!</small></span></div>}
      {hasKrysServerTag && <div className={`${styles.recognition} ${styles.tagRecognition}`}><Image src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={46} height={46} alt="" aria-hidden="true" /><span><strong>Server Tag</strong><small>Proud to wear the Krys tag!</small></span></div>}
      {profileBadges.map(badge => <div className={`${styles.recognition} ${styles.badgeRecognition}`} key={badge}><span className={styles.badgeIcon} aria-hidden="true">◆</span><span><strong>{badge}</strong></span></div>)}
    </div>
  </section>
}

export default function PlayerProfileHero({ screenName, avatarPath, isServerBooster, hasKrysServerTag, nameEffect = "auto", profileBadges = [], glowColor = "#ff2bd6", avatarGlowColor = "#ff2bd6", textColor = "#f8fafc", showAvatarGlow = true, avatarGlowStrength = 85, featuredTrophy = null, careerHighlights = [], publicLayout = false }: Props) {
  const theme = { "--profile-glow": glowColor, "--profile-avatar-glow": avatarGlowColor, "--profile-text": textColor, "--profile-avatar-glow-opacity": Math.min(1, Math.max(.15, avatarGlowStrength / 100)) } as React.CSSProperties
  const wrappedNameParts = screenName.length > 16 && screenName.includes("_")
    ? screenName.split("_")
    : null
  const isStaff = profileBadges.some(badge => ["Owner", "Co-Head Admin", "Tournament Admin", "Admin"].includes(badge))
  const nameSizeClass = screenName.length > 14 ? styles.nameLong : ""
  const publicGridClass = featuredTrophy && careerHighlights.length > 0
    ? styles.heroGrid
    : featuredTrophy
      ? `${styles.heroGrid} ${styles.featuredOnly}`
      : careerHighlights.length > 0
        ? `${styles.heroGrid} ${styles.highlightsOnly}`
        : `${styles.heroGrid} ${styles.playerOnly}`
  const resolvedNameEffect = nameEffect === "auto"
    ? isStaff
      ? isServerBooster && hasKrysServerTag
        ? "staff-both"
        : hasKrysServerTag
          ? "staff-tag"
          : "holographic"
      : isServerBooster && hasKrysServerTag
        ? "both"
        : isServerBooster
          ? "booster"
          : hasKrysServerTag
            ? "server-tag"
            : "white"
    : nameEffect === "holographic" && isStaff
      ? isServerBooster && hasKrysServerTag
        ? "staff-both"
        : hasKrysServerTag
          ? "staff-tag"
          : "holographic"
    : nameEffect
  const nameEffectClass = resolvedNameEffect === "staff-both"
    ? styles.nameStaffBoth
    : resolvedNameEffect === "staff-tag"
      ? styles.nameStaffTag
      : resolvedNameEffect === "holographic" && isStaff
        ? styles.nameHolographic
        : resolvedNameEffect === "both" && isServerBooster && hasKrysServerTag
    ? styles.nameBoth
    : resolvedNameEffect === "booster" && isServerBooster
      ? styles.nameBooster
      : resolvedNameEffect === "server-tag" && hasKrysServerTag
        ? styles.nameServerTag
        : styles.nameWhite
  return <section className={styles.hero} style={theme} aria-labelledby="player-profile-name" data-server-booster={isServerBooster} data-krys-server-tag={hasKrysServerTag}>
    <div className={styles.brandRow} aria-label={hasKrysServerTag ? "Krys Server Tag recognition" : "Krys Leagues"}>
      <div className={styles.brandMark}><Image className={`${styles.brandLogo} ${hasKrysServerTag ? styles.tagActive : ""}`} src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={112} height={112} alt="" aria-hidden="true" /></div>
      <div className={styles.titleLockup}><span aria-hidden="true" /><p className={styles.profileTitle}>Krys Leagues Player Profile</p><span aria-hidden="true" /></div>
      <div className={styles.brandMark}><Image className={`${styles.brandLogo} ${hasKrysServerTag ? styles.tagActive : ""}`} src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={112} height={112} alt="" aria-hidden="true" /></div>
    </div>
    {publicLayout && <div className={publicGridClass}>
      {featuredTrophy && <section className={`${styles.sidePanel} ${styles.featuredPanel}`} aria-labelledby="featured-trophy-title">
        <p className={styles.panelEyebrow} id="featured-trophy-title">Featured Trophy</p>
        <>
          {/* Trophy URLs are authoritative media records and may use multiple approved hosts. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {featuredTrophy.imageUrl && <img className={styles.trophyImage} src={featuredTrophy.imageUrl} alt={featuredTrophy.title} />}
          <h2 className={styles.panelTitle}>{featuredTrophy.title}</h2>
          {featuredTrophy.meta && <p className={styles.panelMeta}>{featuredTrophy.meta}</p>}
          <a className={styles.panelAction} href="#trophy-case">Trophy Case</a>
        </>
      </section>}
      <div className={styles.playerCore}>
        <div className={styles.avatarStage}>
          {isServerBooster && showAvatarGlow && <div className={styles.boosterGlow} aria-hidden="true" />}
          <PlayerAvatar screenName={screenName} avatarPath={avatarPath} size="var(--player-profile-avatar-size)" imageFit="contain" borderRadius={0} className={styles.avatar} renderAsImage />
        </div>
        <div className={styles.identity}>
          <h1 id="player-profile-name" className={`${styles.name} ${nameSizeClass} ${nameEffectClass}`} aria-label={screenName}>
            <span className={styles.nameFull}>{screenName}</span>
            {wrappedNameParts && <span className={styles.nameSplit} aria-hidden="true">{wrappedNameParts.map((part, index) => <span key={`${part}-${index}`}>{part}</span>)}</span>}
          </h1>
          {!publicLayout && profileBadges.length > 0 && <div className={styles.badges} aria-label="Player recognition">{profileBadges.map(badge => <span key={badge}>{badge}</span>)}</div>}
        </div>
      </div>
      {careerHighlights.length > 0 && <section className={`${styles.sidePanel} ${styles.highlightsPanel}`} aria-labelledby="career-highlights-title">
        <p className={styles.panelEyebrow} id="career-highlights-title">Career Highlights</p>
        <div className={styles.highlightGrid}>{careerHighlights.map(highlight => highlight.kind === "monthly"
          ? <div className={`${styles.highlight} ${styles.monthlyHighlight}`} key={`${highlight.label}-${highlight.division}-${highlight.placement}`}><strong aria-hidden="true">{highlight.medal}</strong><span><b>{highlight.label}</b><small>{highlight.division} · {highlight.placement} Place</small></span></div>
          : <div className={styles.highlight} key={highlight.label}><strong>{highlight.value}</strong><span>{highlight.label}</span></div>)}</div>
      </section>}
    </div>}
    {!publicLayout && <div className={styles.playerCore}>
      <div className={styles.avatarStage}>{isServerBooster && showAvatarGlow && <div className={styles.boosterGlow} aria-hidden="true" />}<PlayerAvatar screenName={screenName} avatarPath={avatarPath} size="var(--player-profile-avatar-size)" imageFit="contain" borderRadius={0} className={styles.avatar} renderAsImage /></div>
      <div className={styles.identity}><h1 id="player-profile-name" className={`${styles.name} ${nameSizeClass} ${nameEffectClass}`} aria-label={screenName}><span className={styles.nameFull}>{screenName}</span>{wrappedNameParts && <span className={styles.nameSplit} aria-hidden="true">{wrappedNameParts.map((part, index) => <span key={`${part}-${index}`}>{part}</span>)}</span>}</h1>{profileBadges.length > 0 && <div className={styles.badges} aria-label="Player recognition">{profileBadges.map(badge => <span key={badge}>{badge}</span>)}</div>}{(isServerBooster || hasKrysServerTag) && <div className={styles.recognitionRow}>{isServerBooster && <div className={`${styles.recognition} ${styles.boosterRecognition}`}><span className={styles.boosterIcon} aria-hidden="true">✦</span><strong>Server Booster</strong></div>}{hasKrysServerTag && <div className={`${styles.recognition} ${styles.tagRecognition}`}><Image src="/league-media/BIG%20LOGO%20TRANSPARENT.png" width={38} height={38} alt="" aria-hidden="true" /><strong>Server Tag</strong></div>}</div>}</div>
    </div>}
  </section>
}
