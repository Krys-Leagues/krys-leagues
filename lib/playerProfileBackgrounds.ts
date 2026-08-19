export const PLAYER_PROFILE_BACKGROUNDS = [
  { key: "krys-default", label: "Krys Default", imagePath: "/player-profile-background.png" },
  { key: "neon-mountain", label: "Neon Mountain Twilight", imagePath: "/player-profile-bg-neon-mountain.png" },
  { key: "neon-night", label: "Neon Night Fairway", imagePath: "/player-profile-bg-neon-night.png" },
  { key: "electric-blue", label: "Electric Blue Night", imagePath: "/player-profile-bg-electric-blue.png" },
  { key: "coastal-sunset", label: "Coastal Sunset", imagePath: "/player-profile-bg-coastal-sunset.png" },
  { key: "pink-coast", label: "Pink Coast Mini Golf", imagePath: "/player-profile-bg-pink-coast.png" },
  { key: "coastal-teal", label: "Coastal Teal", imagePath: "/player-profile-bg-coastal-teal.png" },
  { key: "krys-coastal", label: "Krys Coastal", imagePath: "/player-profile-bg-krys-coastal.png" },
] as const

export type PlayerProfileBackgroundKey = typeof PLAYER_PROFILE_BACKGROUNDS[number]["key"]
export const DEFAULT_PLAYER_PROFILE_BACKGROUND_KEY: PlayerProfileBackgroundKey = "krys-default"

export function getPlayerProfileBackground(key: unknown) {
  return PLAYER_PROFILE_BACKGROUNDS.find(background => background.key === key)
    ?? PLAYER_PROFILE_BACKGROUNDS[0]
}
