export type ArtworkTarget = {
  id: string
  label: string
  href: string
  x: number
  y: number
  width: number
  height: number
}

export type ArtworkPageDefinition = {
  title: string
  imageSrc: string
  imageAlt: string
  aspectRatio: string
  targets: readonly ArtworkTarget[]
}

export function artworkTargetStyle(target: ArtworkTarget) {
  return {
    left: `${target.x}%`,
    top: `${target.y}%`,
    width: `${target.width}%`,
    height: `${target.height}%`,
  }
}

function rectanglesOverlap(a: ArtworkTarget, b: ArtworkTarget) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

export function validateArtworkTargets(targets: readonly ArtworkTarget[]) {
  const errors: string[] = []
  const ids = new Set<string>()

  for (const target of targets) {
    if (ids.has(target.id)) errors.push(`duplicate target id: ${target.id}`)
    ids.add(target.id)
    if (!target.id || !target.label || !target.href) {
      errors.push(`target ${target.id || "(empty)"} is missing semantic metadata`)
    }
    if (
      target.x < 0 ||
      target.y < 0 ||
      target.width <= 0 ||
      target.height <= 0 ||
      target.x + target.width > 100 ||
      target.y + target.height > 100
    ) {
      errors.push(`target ${target.id} is outside the artwork bounds`)
    }
  }

  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      if (rectanglesOverlap(targets[i], targets[j])) {
        errors.push(`overlapping targets: ${targets[i].id} and ${targets[j].id}`)
      }
    }
  }

  return errors
}
