import { playerAvatarPublicUrl } from "@/lib/playerAvatars"

const KRYS_LEAGUES_LOGO = "/league-media/BIG%20LOGO%20TRANSPARENT.png"

export default function PlayerAvatar({
  screenName,
  avatarPath,
  size = 112,
  imageFit = "cover",
  borderRadius = "50%",
  className,
  renderAsImage = false,
}: {
  screenName: string
  avatarPath: string | null
  size?: number | string
  imageFit?: "cover" | "contain"
  borderRadius?: number | string
  className?: string
  renderAsImage?: boolean
}) {
  const avatarUrl = playerAvatarPublicUrl(avatarPath)
  const displayedAvatarUrl = avatarUrl || KRYS_LEAGUES_LOGO
  const displayedImageFit = avatarUrl ? imageFit : "contain"
  return (
    <div
      className={className}
      role="img"
      aria-label={`${screenName} avatar`}
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        position: "relative",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        borderRadius,
        border: "2px solid #52525b",
        background: !renderAsImage ? `center / ${displayedImageFit} no-repeat url("${displayedAvatarUrl}")` : "linear-gradient(145deg,#27272a,#09090b)",
        color: "white",
        fontSize: typeof size === "number" ? Math.max(18, Math.round(size * 0.3)) : "clamp(18px, 8vw, 52px)",
        fontWeight: 900,
        letterSpacing: "0.04em",
      }}
    >
      {renderAsImage && (
        <img
          src={displayedAvatarUrl}
          alt=""
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: displayedImageFit }}
        />
      )}
    </div>
  )
}
