import { playerAvatarInitials, playerAvatarPublicUrl } from "@/lib/playerAvatars"

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
  return (
    <div
      className={className}
      role="img"
      aria-label={`${screenName} avatar`}
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        borderRadius,
        border: "2px solid #52525b",
        background: avatarUrl && !renderAsImage ? `center / ${imageFit} no-repeat url("${avatarUrl}")` : "linear-gradient(145deg,#27272a,#09090b)",
        color: "white",
        fontSize: typeof size === "number" ? Math.max(18, Math.round(size * 0.3)) : "clamp(18px, 8vw, 52px)",
        fontWeight: 900,
        letterSpacing: "0.04em",
      }}
    >
      {avatarUrl && renderAsImage && (
        <img
          src={avatarUrl}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: imageFit }}
        />
      )}
      {!avatarUrl && playerAvatarInitials(screenName)}
    </div>
  )
}
