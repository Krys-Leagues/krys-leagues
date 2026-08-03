import {
  normalizeIdentity,
  splitIdentityWords,
} from "./normalizeIdentity"

function levenshteinDistance(
  left: string,
  right: string
) {
  const a = normalizeIdentity(left)
  const b = normalizeIdentity(right)

  if (!a) {
    return b.length
  }

  if (!b) {
    return a.length
  }

  const matrix: number[][] = Array.from(
    { length: a.length + 1 },
    () => Array(b.length + 1).fill(0)
  )

  for (let row = 0; row <= a.length; row += 1) {
    matrix[row][0] = row
  }

  for (
    let column = 0;
    column <= b.length;
    column += 1
  ) {
    matrix[0][column] = column
  }

  for (let row = 1; row <= a.length; row += 1) {
    for (
      let column = 1;
      column <= b.length;
      column += 1
    ) {
      const substitutionCost =
        a[row - 1] === b[column - 1]
          ? 0
          : 1

      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] +
          substitutionCost
      )
    }
  }

  return matrix[a.length][b.length]
}

export function scoreIdentityMatch(
  left: string,
  right: string
) {
  const a = normalizeIdentity(left)
  const b = normalizeIdentity(right)

  if (!a || !b) {
    return {
      confidence: 0,
      reasons: [] as string[],
    }
  }

  if (a === b) {
    return {
      confidence: 100,
      reasons: ["Exact normalized match"],
    }
  }

  const reasons: string[] = []
  let confidence = 0

  const shorterLength = Math.min(
    a.length,
    b.length
  )

  const longerLength = Math.max(
    a.length,
    b.length
  )

  if (a.includes(b) || b.includes(a)) {
    confidence = Math.max(
      confidence,
      Math.round(
        (shorterLength / longerLength) * 95
      )
    )

    reasons.push(
      "One name contains the other"
    )
  }

  if (a.startsWith(b) || b.startsWith(a)) {
    confidence = Math.max(
      confidence,
      88
    )

    reasons.push(
      "Names share the same beginning"
    )
  }

  if (a.endsWith(b) || b.endsWith(a)) {
    confidence = Math.max(
      confidence,
      86
    )

    reasons.push(
      "Names share the same ending"
    )
  }

  const distance = levenshteinDistance(
    a,
    b
  )

  const spellingConfidence = Math.max(
    0,
    Math.round(
      (1 - distance / longerLength) * 100
    )
  )

  if (spellingConfidence >= 45) {
    confidence = Math.max(
      confidence,
      spellingConfidence
    )

    reasons.push(
      `Similar spelling (${spellingConfidence}%)`
    )
  }

  const leftWords = splitIdentityWords(left)
  const rightWords = splitIdentityWords(right)

  const sharedWords = leftWords.filter(
    (word) => rightWords.includes(word)
  )

  if (sharedWords.length > 0) {
    const wordConfidence = Math.round(
      (sharedWords.length /
        Math.max(
          leftWords.length,
          rightWords.length
        )) *
        90
    )

    confidence = Math.max(
      confidence,
      wordConfidence
    )

    reasons.push("Names share words")
  }

  return {
    confidence: Math.min(
      confidence,
      99
    ),
    reasons: Array.from(
      new Set(reasons)
    ),
  }
}