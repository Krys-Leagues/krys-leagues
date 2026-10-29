export type TrophyMediaKind = "image" | "video" | "unsupported"

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])
const VIDEO_EXTENSIONS = new Set(["mp4"])

export function trophyMediaExtension(url: string | null | undefined) {
  if (!url) return ""
  const pathname = url.split(/[?#]/, 1)[0]
  return pathname.split(".").at(-1)?.toLocaleLowerCase() || ""
}

export function trophyMediaKind(url: string | null | undefined): TrophyMediaKind {
  const extension = trophyMediaExtension(url)
  if (IMAGE_EXTENSIONS.has(extension)) return "image"
  if (VIDEO_EXTENSIONS.has(extension)) return "video"
  return "unsupported"
}

export function trophyMediaMimeType(url: string) {
  const extension = trophyMediaExtension(url)
  if (extension === "mp4") return "video/mp4"
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  return extension ? `image/${extension}` : "application/octet-stream"
}
