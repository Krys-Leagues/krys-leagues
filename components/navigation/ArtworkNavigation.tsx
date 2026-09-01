import Image from "next/image"
import Link from "next/link"
import type { ArtworkPageDefinition } from "@/lib/artworkNavigation"
import { artworkTargetStyle, validateArtworkTargets } from "@/lib/artworkNavigation"

export function ArtworkNavigation({ definition }: { definition: ArtworkPageDefinition }) {
  const errors = validateArtworkTargets(definition.targets)
  if (errors.length > 0) {
    throw new Error(`Invalid artwork navigation map for ${definition.title}: ${errors.join("; ")}`)
  }

  return (
    <main className="artwork-navigation">
      <h1 className="sr-only">{definition.title}</h1>
      <div
        className="artwork-navigation__frame"
        style={{ aspectRatio: definition.aspectRatio }}
        data-artwork-title={definition.title}
      >
        <Image
          className="artwork-navigation__image"
          src={definition.imageSrc}
          alt={definition.imageAlt}
          fill
          priority
          sizes="(max-width: 1664px) 100vw, 1664px"
          draggable={false}
        />
        <nav aria-label={`${definition.title} navigation`} className="artwork-navigation__targets">
          {definition.targets.map((target) => (
            <Link
              key={target.id}
              href={target.href}
              aria-label={target.label}
              className="artwork-navigation__target"
              style={artworkTargetStyle(target)}
              data-artwork-target-id={target.id}
            >
              <span className="sr-only">{target.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
