export function isPublishedBracket(status: string, bracketSize: number, matchCount: number) {
  return status === "live" && (bracketSize === 32 || bracketSize === 64) && matchCount === bracketSize - 1
}
