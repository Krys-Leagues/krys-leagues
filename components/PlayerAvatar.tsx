import { playerAvatarInitials, playerAvatarPublicUrl } from "@/lib/playerAvatars"

export default function PlayerAvatar({
  screenName,
  avatarPath,
  size = 112,
}: {
  screenName: string
  avatarPath: string | null
  size?: number
}) {
  const avatarUrl = playerAvatarPublicUrl(avatarPath)
  return (
    <div
      role="img"
      aria-label={`${screenName} avatar`}
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        borderRadius: "50%",
        border: "2px solid #52525b",
        background: avatarUrl ? `center / cover no-repeat url("${avatarUrl}")` : "linear-gradient(145deg,#27272a,#09090b)",
        color: "white",
        fontSize: Math.max(18, Math.round(size * 0.3)),
        fontWeight: 900,
        letterSpacing: "0.04em",
      }}
    >
      {!avatarUrl && playerAvatarInitials(screenName)}
    </div>
  )
}
