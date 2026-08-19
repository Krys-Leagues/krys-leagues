import { trophyMediaKind, trophyMediaMimeType, type TrophyMediaKind } from "@/lib/trophies/trophyMedia"

export default function TrophyMedia({ src, alt, className, style, kind: explicitKind }: { src: string; alt: string; className?: string; style?: React.CSSProperties; kind?: Exclude<TrophyMediaKind, "unsupported"> }) {
  const kind = explicitKind || trophyMediaKind(src)
  if (kind === "video") return <video className={className} style={style} controls playsInline preload="metadata" aria-label={alt}><source src={src} type={trophyMediaMimeType(src)} /></video>
  if (kind === "image") return <img className={className} style={style} src={src} alt={alt} />
  return null
}
