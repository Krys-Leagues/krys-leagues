import { MONTHLY_PUBLIC_URL } from "../externalCompetitionSites.ts"

export type MonthlyPublicDiscovery = {
  monthYear: string | null
  sourceUrl: string
  retrievedAt: string
  sourceSaysCompleted: boolean
  sourceSaysInProgress: boolean
  divisionStandingsFound: number
  courseTablesFound: number
  previousUrl: string | null
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim()
const attribute = (tag: string, name: string) => tag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1] ?? null

export function validateMonthlySourceUrl(value: string) {
  const url = new URL(value, MONTHLY_PUBLIC_URL)
  const stable = new URL(MONTHLY_PUBLIC_URL)
  if (url.origin !== stable.origin || !url.pathname.startsWith("/ords/r/wmgt/monthly/")) throw new Error("Only the public Kry's Monthly Oracle/APEX site may be fetched.")
  return url.href
}

export function discoverMonthlyPublicHtml(html: string, sourceUrl: string, retrievedAt = new Date().toISOString()): MonthlyPublicDiscovery {
  const monthYear = text(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") || null
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)].map(match => ({ label: text(attribute(match[1], "aria-label") ?? ""), body: match[2] }))
  let divisionStandingsFound = 0
  let courseTablesFound = 0
  for (const table of tables) {
    const headers = [...table.body.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(match => text(match[1]).toLowerCase())
    if (/^overall\s+leaders\b/i.test(table.label)) continue
    if (headers.includes("player") && headers.some(header => header.replaceAll(" ", "") === "coursesplayed") && /leaders/i.test(table.label)) divisionStandingsFound += 1
    else if (headers.includes("player") && headers.includes("score") && headers.includes("points")) courseTablesFound += 1
  }
  const previousAnchor = [...html.matchAll(/<a\b([^>]*)>/gi)].find(match => /^previous$/i.test(attribute(match[1], "title") ?? ""))
  const previousHref = previousAnchor ? attribute(previousAnchor[1], "href") : null
  return {
    monthYear, sourceUrl, retrievedAt,
    sourceSaysCompleted: /\bcompleted\b/i.test(text(html)),
    sourceSaysInProgress: /\bin progress\b/i.test(text(html)),
    divisionStandingsFound, courseTablesFound,
    previousUrl: previousHref ? new URL(previousHref.replaceAll("&amp;", "&"), sourceUrl).href : null,
  }
}
