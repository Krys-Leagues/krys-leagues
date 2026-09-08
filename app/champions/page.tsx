"use client"

import Image from "next/image"
import Link from "next/link"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { historicalPlayerName, loadCanonicalPlayerDisplays, type CanonicalPlayerDisplay } from "@/lib/canonicalPlayerDisplay"
import TrophyMedia from "@/components/TrophyMedia"
import { filterTrophiesForScope, type ChampionScope } from "@/lib/championScope"
import { hallOfChampionsArtworkAsset } from "@/lib/artworkPageMaps"

type Trophy = {
  id: string
  player_id: string | null
  player_name: string | null
  trophy_title: string | null
  league_type: string | null
  placement: string | null
  event_name: string | null
  division: string | null
  season: string | null
  week: string | null
  image_url: string | null
}

type ChampionEntry = Trophy & {
  playerName: string
}

type TrophyGroup = {
  key: string
  title: string
  entries: ChampionEntry[]
  category: HallCategory
  recency: number
  firstIndex: number
}

type HallCategory = "league" | "monthly" | "bracket" | "championOfChampions" | "krysCup" | "spicyCup" | "other"

export default function ChampionsPage() {
  return (
    <Suspense fallback={<main style={page}><div style={container}><div style={messageCard}>Loading Hall of Champions...</div></div></main>}>
      <ChampionsContent />
    </Suspense>
  )
}

function ChampionsContent() {
  const searchParams = useSearchParams()
  const hallScope = resolveHallScope(searchParams.get("league"), searchParams.get("category"))
  const filteredHall = hallScope !== "all"
  const backHref = hallBackHref(hallScope, searchParams.get("from"))
  const [players, setPlayers] = useState<CanonicalPlayerDisplay[]>([])
  const [trophies, setTrophies] = useState<Trophy[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadChampions(hallScope)
  }, [hallScope])

  async function loadChampions(scope: ChampionScope) {
    setLoading(true)
    setMessage("")

    let trophiesQuery = supabase
        .from("player_trophies")
        .select(
          "id, player_id, player_name, trophy_title, placement, event_name, league_type, division, season, week, image_url"
        )
        .order("season", { ascending: false })
    if (scope === "kwt") trophiesQuery = trophiesQuery.eq("league_type", "kwt")

    const trophiesResponse = await trophiesQuery

    const firstError = trophiesResponse.error

    if (firstError) {
      setMessage(firstError.message)
      setLoading(false)
      return
    }

    const loadedTrophies = filterTrophiesForScope(trophiesResponse.data || [], scope)
    const playerResponse = await loadCanonicalPlayerDisplays(
      loadedTrophies.map((trophy) => trophy.player_id).filter((id): id is string => Boolean(id)),
    )
    if (playerResponse.error) {
      setMessage(playerResponse.error.message)
      setLoading(false)
      return
    }
    setPlayers(playerResponse.data)
    setTrophies(loadedTrophies)
    setLoading(false)
  }
    const championEntries = useMemo<ChampionEntry[]>(() => {
    const playerDisplays = new Map(players.map((player) => [player.source_player_id, player]))

    return trophies.map((trophy) => ({
      ...trophy,
      playerName:
        historicalPlayerName(
          trophy.player_id ? playerDisplays.get(trophy.player_id) : undefined,
          trophy.player_name,
        ),
    }))
  }, [players, trophies])

  const spicyCupEntries = useMemo(() => {
    return championEntries.filter((entry) =>
      searchableText(entry).includes("spicy cup")
    )
  }, [championEntries])

  const spicyCupWinner = useMemo(() => {
    return spicyCupEntries.find((entry) =>
      [entry.playerName, entry.player_name]
        .filter(Boolean)
        .some((name) => name!.trim().toLowerCase() === "hh aus hoss")
    )
  }, [spicyCupEntries])

  const recentTrophyGroups = useMemo(() => {
    const groups = new Map<string, TrophyGroup>()

    championEntries.forEach((entry, index) => {
      const eventLabel = entry.event_name?.trim() || entry.trophy_title?.trim() || "Krys Leagues Trophy Group"
      const key = [eventLabel, entry.season?.trim() || "", entry.week?.trim() || ""].join("|").toLowerCase()
      const existing = groups.get(key)
      const group = existing || {
        key,
        title: eventLabel,
        entries: [],
        category: categoryForEntry(entry),
        recency: trophyRecency(entry),
        firstIndex: index,
      }

      group.entries.push(entry)
      group.recency = Math.max(group.recency, trophyRecency(entry))
      groups.set(key, group)
    })

    return [...groups.values()]
      .sort((left, right) => right.recency - left.recency || left.firstIndex - right.firstIndex)
      .slice(0, 5)
  }, [championEntries])

  return (
    <main style={page}>
      <div style={hallArtworkFrame}>
        <Image src={hallOfChampionsArtworkAsset} alt="Hall of Champions" width={2064} height={692} priority style={hallArtworkImage} />
      </div>
      <div style={container}>
        <div style={topBar}>
          <Link href={backHref} style={backButton}>
            {hallScope === "all" ? "← Krys Leagues" : `← ${hallBackLabel(hallScope, searchParams.get("from"))}`}
          </Link>

          <Link href="/records" style={backButton}>
            League Records
          </Link>

          <Link href="/players" style={backButton}>
            Player Profiles
          </Link>
        </div>

        <section style={hero}>
          <h1 style={title}>{hallTitle(hallScope)}</h1>

          <p style={subtitle}>
            {hallDescription(hallScope)}
          </p>
        </section>
                {loading ? (
          <div style={messageCard}>
            Loading Hall of Champions...
          </div>
        ) : message ? (
          <div style={errorCard}>{message}</div>
        ) : (
          <>
            {showFeaturedCups(hallScope) && <section style={featuredCard}>
              <div style={cupGrid}>
                {(hallScope === "all" || hallScope === "champion-of-champions") && <div style={cupCard}>
                 <h2 style={featuredTitle}>
  🏆 Champion of Champions
  <br />
  2026
</h2>

<video
  controls
  playsInline
  preload="metadata"
  style={cupVideo}
  onEnded={(e) => {
    e.currentTarget.currentTime = 0
  }}
>
  <source
    src="/league-media/trophies/champion-of-champions.mp4"
    type="video/mp4"
  />
</video>
                </div>}

                {(hallScope === "all" || hallScope === "krys-cup") && <div style={cupCard}>
                  <h2 style={featuredTitle}>
  🏆 Krys Cup Winner
  <br />
  2026
</h2>

                  <video
                    controls
                    playsInline
                    preload="metadata"
                    style={cupVideo}
                    onEnded={(e) => {
  e.currentTarget.currentTime = 0
}}
                  >
                    <source
                      src="/league-media/trophies/krys cup winner 2026.mp4"
                      type="video/mp4"
                    />
                  </video>
                </div>}

                {(hallScope === "all" || hallScope === "spicy-cup") && <div style={cupCard}>
                  <h2 style={featuredTitle}>
  🌶️ Spicy Cup Winner
  <br />
  2026
</h2>

                  <video
  controls
  playsInline
  preload="metadata"
  style={cupVideo}
  onEnded={(e) => {
    e.currentTarget.currentTime = 0
  }}
                 >
                    <source
                      src="/league-media/trophies/Spicy cup winner 2026.mp4"
                      type="video/mp4"
                    />
                  </video>
                  {spicyCupWinner && (
                    <p style={featuredWinner}>
                      Winner:{" "}
                      {spicyCupWinner.player_id ? (
                        <Link href={`/players/${spicyCupWinner.player_id}`} style={featuredWinnerLink}>
                          {spicyCupWinner.playerName}
                        </Link>
                      ) : (
                        spicyCupWinner.playerName
                      )}
                    </p>
                  )}
                </div>}
              </div>
            </section>}

            {filteredHall ? (
              <FilteredHallCategory scope={hallScope} entries={championEntries} />
            ) : (
              <>
                {championEntries.length > 0 && <HallCategoryArchives entries={championEntries} />}
                <RecentTrophyGroups groups={recentTrophyGroups} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function FilteredHallCategory({ scope, entries }: { scope: Exclude<ChampionScope, "all">; entries: ChampionEntry[] }) {
  return (
    <section style={filteredCategoryCard} data-hall-scope={scope}>
      <h2 style={categoryTitle}>{hallTitle(scope)}</h2>
      <p style={sectionDescription}>{hallDescription(scope)}</p>
      {entries.length > 0 ? <ChampionList entries={entries} /> : <p style={emptyText}>No recorded champions are available for this category yet.</p>}
    </section>
  )
}

function resolveHallScope(leagueParam: string | null, categoryParam: string | null): ChampionScope {
  if (leagueParam?.trim().toLowerCase() === "kwt") return "kwt"

  const category = categoryParam?.trim().toLowerCase()
  if (category === "champion-of-champions") return "champion-of-champions"
  if (category === "krys-cup") return "krys-cup"
  if (category === "spicy-cup") return "spicy-cup"
  if (category === "monthly") return "monthly"
  if (category === "bracket") return "bracket"
  return "all"
}

function hallBackHref(scope: ChampionScope, from: string | null) {
  if (scope === "kwt") return "/kwt"
  if (from === "invitationals") return "/invitationals"
  if (from === "monthlies") return "/monthlies"
  if (from === "tournaments") return "/tournaments"
  if (from === "champions") return "/champions"
  return "/"
}

function hallBackLabel(scope: ChampionScope, from: string | null) {
  if (scope === "kwt" || from === "kwt") return "KWT"
  if (from === "invitationals") return "Invitationals"
  if (from === "monthlies") return "Monthlies"
  if (from === "tournaments") return "Bracket Tournaments"
  if (from === "champions") return "Hall of Champions"
  return "Krys Leagues"
}

function hallTitle(scope: ChampionScope) {
  if (scope === "all") return "🏆 Hall of Champions"
  if (scope === "kwt") return "🏆 KWT Hall of Champions"
  if (scope === "champion-of-champions") return "🏆 Champion of Champions"
  if (scope === "krys-cup") return "🏆 Krys Cup"
  if (scope === "spicy-cup") return "🌶️ Spicy Cup"
  if (scope === "monthly") return "🏆 Monthly Champions"
  return "🏆 Bracket Tournament Champions"
}

function hallDescription(scope: ChampionScope) {
  if (scope === "kwt") return "KWT champions and recorded weekly tournament awards."
  if (scope === "champion-of-champions") return "Recorded Champion of Champions winners from the existing Hall data."
  if (scope === "krys-cup") return "Recorded Krys Cup winners and awards."
  if (scope === "spicy-cup") return "Amateur Invitational for players who did not advance past Round 2."
  if (scope === "monthly") return "Recorded Monthly champions from the existing Hall data."
  if (scope === "bracket") return "Recorded winners from existing bracket tournament trophy data."
  return "Celebrating league champions, tournament winners, cup achievements, and the greatest accomplishments in Krys Leagues."
}

function showFeaturedCups(scope: ChampionScope) {
  return scope === "all" || scope === "champion-of-champions" || scope === "krys-cup" || scope === "spicy-cup"
}

function RecentTrophyGroups({ groups }: { groups: TrophyGroup[] }) {
  return (
    <section style={recentGroupsSection}>
      <h2 style={sectionTitle}>🏅 Recent Champions / Newest Trophy Groups</h2>
      <p style={sectionDescription}>
        The newest awarded trophy groups appear first, with multiple winners from one event kept together.
      </p>

      {groups.length === 0 ? (
        <p style={emptyText}>No recent trophy groups are available yet.</p>
      ) : (
        <div style={recentGroupsGrid}>
          {groups.map((group) => (
            <article key={group.key} style={recentGroupCard}>
              <h3 style={recentGroupTitle}>{group.title}</h3>
              <p style={recentGroupMeta}>
                {group.entries.length} trophy{group.entries.length === 1 ? "" : "ies"} in this group
              </p>
              <div style={recentPreviewList}>
                {group.entries.slice(0, 4).map((entry) => (
                  <div key={entry.id} style={recentPreviewRow}>
                    {entry.image_url && <TrophyMedia src={entry.image_url} alt={entry.trophy_title || `${entry.playerName} trophy`} style={recentPreviewImage} />}
                    <div style={recentPreviewInformation}>
                      {entry.player_id ? <Link href={`/players/${entry.player_id}`} style={championName}>{entry.playerName}</Link> : <strong style={championName}>{entry.playerName}</strong>}
                      <span style={recentPreviewLabel}>{entry.trophy_title || entry.placement || "Champion"}</span>
                      <span style={metadata}>{[entry.division, entry.season, entry.week].filter(Boolean).join(" • ")}</span>
                    </div>
                  </div>
                ))}
              </div>
              {group.entries.length > 4 && <p style={recentGroupMore}>+ {group.entries.length - 4} more trophies in this category</p>}
              <Link href={hallCategoryHref(group.category)} style={recentGroupLink}>
                Browse this trophy category →
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

const LEAGUE_FILTERS = ["Stroke", "Match", "PYP", "Doubles", "Solo", "Pro"] as const
const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]

function HallCategoryArchives({ entries }: { entries: ChampionEntry[] }) {
  const leagueEntries = entries.filter((entry) => categoryForEntry(entry) === "league")
  const monthlyEntries = entries.filter((entry) => categoryForEntry(entry) === "monthly")
  const bracketEntries = entries.filter((entry) => categoryForEntry(entry) === "bracket")
  const championOfChampionsEntries = entries.filter((entry) => categoryForEntry(entry) === "championOfChampions")
  const krysCupEntries = entries.filter((entry) => categoryForEntry(entry) === "krysCup")
  const spicyCupEntries = entries.filter((entry) => categoryForEntry(entry) === "spicyCup")
  const otherEntries = entries.filter((entry) => categoryForEntry(entry) === "other")
  const leagueSections = LEAGUE_FILTERS
    .map((league) => ({
      league,
      entries: leagueEntries.filter((entry) => searchableText(entry).includes(league.toLowerCase())),
    }))
    .filter((section) => section.entries.length > 0)
  const monthlyGroups = groupEntriesByLabel(monthlyEntries, monthlyMonthYearLabel)
    .sort((left, right) => monthYearRecency(right.label) - monthYearRecency(left.label))

  return (
    <section id="hall-categories" style={categoryBrowser}>
      <h2 style={sectionTitle}>Browse Trophy Categories</h2>
      <p style={sectionDescription}>
        Choose a category, league, or Month + Year to browse the recorded awards without one giant mixed list.
      </p>
      <nav style={categoryNavigation} aria-label="Hall of Champions categories">
        {leagueEntries.length > 0 && <a href="#hall-category-league" style={categoryLink}>League Champions</a>}
        {monthlyEntries.length > 0 && <a href="#hall-category-monthly" style={categoryLink}>Monthly Champions</a>}
        {bracketEntries.length > 0 && <a href="#hall-category-bracket" style={categoryLink}>Bracket Tournament Champions</a>}
        {championOfChampionsEntries.length > 0 && <a href="#hall-category-champion-of-champions" style={categoryLink}>Champion of Champions</a>}
        {krysCupEntries.length > 0 && <a href="#hall-category-krys-cup" style={categoryLink}>Krys Cup</a>}
        {spicyCupEntries.length > 0 && <a href="#hall-category-spicy-cup" style={categoryLink}>Spicy Cup</a>}
        {otherEntries.length > 0 && <a href="#hall-category-other" style={categoryLink}>Other Awards</a>}
      </nav>

      {leagueEntries.length > 0 && (
        <section id="hall-category-league" style={categorySection}>
          <h3 style={categoryTitle}>League Champions</h3>
          <p style={sectionDescription}>Open a league to browse its recorded champions.</p>
          <div style={categoryChoices}>
            {leagueSections.map((section) => (
              <details key={section.league} style={categoryDetails}>
                <summary style={categorySummary}>{section.league} · {section.entries.length} trophies</summary>
                <ChampionList entries={section.entries} />
              </details>
            ))}
          </div>
        </section>
      )}

      {monthlyEntries.length > 0 && (
        <section id="hall-category-monthly" style={categorySection}>
          <h3 style={categoryTitle}>Monthly Champions</h3>
          <p style={sectionDescription}>Open a Month + Year to browse that month&apos;s recorded trophies.</p>
          <div style={categoryChoices}>
            {monthlyGroups.map((group) => (
              <details key={group.label} style={categoryDetails}>
                <summary style={categorySummary}>{group.label} · {group.entries.length} trophies</summary>
                <ChampionList entries={group.entries} />
              </details>
            ))}
          </div>
        </section>
      )}

      {bracketEntries.length > 0 && (
        <section id="hall-category-bracket" style={categorySection}>
          <h3 style={categoryTitle}>Bracket Tournament Champions</h3>
          <p style={sectionDescription}>Recorded winners from existing bracket tournament trophy data.</p>
          <ChampionList entries={bracketEntries} />
        </section>
      )}

      {championOfChampionsEntries.length > 0 && (
        <section id="hall-category-champion-of-champions" style={categorySection}>
          <h3 style={categoryTitle}>Champion of Champions</h3>
          <p style={sectionDescription}>Recorded Champion of Champions winners and awards.</p>
          <ChampionList entries={championOfChampionsEntries} />
        </section>
      )}

      {krysCupEntries.length > 0 && (
        <section id="hall-category-krys-cup" style={categorySection}>
          <h3 style={categoryTitle}>Krys Cup</h3>
          <p style={sectionDescription}>Recorded Krys Cup winners and awards.</p>
          <ChampionList entries={krysCupEntries} />
        </section>
      )}

      {spicyCupEntries.length > 0 && (
        <section id="hall-category-spicy-cup" style={categorySection}>
          <h3 style={categoryTitle}>Spicy Cup</h3>
          <p style={sectionDescription}>Recorded Spicy Cup winners and awards.</p>
          <ChampionList entries={spicyCupEntries} />
        </section>
      )}

      {otherEntries.length > 0 && (
        <section id="hall-category-other" style={categorySection}>
          <h3 style={categoryTitle}>Other Awards</h3>
          <p style={sectionDescription}>Other existing Hall achievements with recorded trophy data.</p>
          <ChampionList entries={otherEntries} />
        </section>
      )}
    </section>
  )
}

function ChampionList({
  entries,
}: {
  entries: ChampionEntry[]
}) {
  return (
    <div style={championList}>
      {entries.map((entry) => (
        <article key={entry.id} style={championRow}>
          {entry.image_url && <TrophyMedia src={entry.image_url} alt={entry.trophy_title || `${entry.playerName} trophy`} style={trophyImage} />}

          <div style={championInformation}>
            {entry.player_id ? <Link href={`/players/${entry.player_id}`} style={championName}>{entry.playerName}</Link> : <strong style={championName}>{entry.playerName}</strong>}

            <strong style={trophyName}>
              {entry.trophy_title ||
                entry.placement ||
                "Champion"}
            </strong>

            <span style={muted}>
              {entry.event_name || "Krys Leagues"}
            </span>

            <span style={metadata}>
              {[
                entry.division,
                entry.season,
                entry.week,
              ]
                .filter(Boolean)
                .join(" • ")}
            </span>
          </div>
        </article>
      ))}
    </div>
  )
}
function searchableText(entry: ChampionEntry) {
  return [
    entry.trophy_title,
    entry.placement,
    entry.event_name,
    entry.division,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function categoryForEntry(entry: ChampionEntry): HallCategory {
  const text = searchableText(entry)
  if (text.includes("champion of champions")) return "championOfChampions"
  if (text.includes("krys cup")) return "krysCup"
  if (text.includes("spicy cup")) return "spicyCup"
  if (isMonthlyEntry(entry)) return "monthly"
  if (text.includes("bracket") || text.includes("tournament")) return "bracket"
  if (
    text.includes("league champion") ||
    text.includes("season champion") ||
    text.includes("division champion") ||
    LEAGUE_FILTERS.some((league) => text.includes(league.toLowerCase()))
  ) return "league"
  return "other"
}

function isMonthlyEntry(entry: ChampionEntry) {
  const text = searchableText(entry)
  return text.includes("monthly") || MONTH_NAMES.some((month) => text.includes(month))
}

function hallCategoryHref(category: HallCategory) {
  return category === "league"
    ? "#hall-category-league"
    : category === "monthly"
      ? "/champions?category=monthly&from=champions"
      : category === "bracket"
        ? "/champions?category=bracket&from=champions"
        : category === "championOfChampions"
          ? "/champions?category=champion-of-champions&from=champions"
          : category === "krysCup"
          ? "/champions?category=krys-cup&from=champions"
          : category === "spicyCup"
            ? "/champions?category=spicy-cup&from=champions"
            : "#hall-category-other"
}

function groupEntriesByLabel(entries: ChampionEntry[], labelFor: (entry: ChampionEntry) => string) {
  const grouped = new Map<string, ChampionEntry[]>()
  entries.forEach((entry) => {
    const label = labelFor(entry)
    grouped.set(label, [...(grouped.get(label) || []), entry])
  })
  return [...grouped.entries()].map(([label, groupedEntries]) => ({ label, entries: groupedEntries }))
}

function monthlyMonthYearLabel(entry: ChampionEntry) {
  const source = [entry.event_name, entry.trophy_title, entry.season, entry.week].filter(Boolean).join(" ")
  const month = MONTH_NAMES.find((name) => source.toLowerCase().includes(name))
  const year = source.match(/\b(?:19|20)\d{2}\b/)?.[0]
  if (month && year) return `${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`
  return "Month + Year not recorded"
}

function monthYearRecency(label: string) {
  const year = Number(label.match(/\b(?:19|20)\d{2}\b/)?.[0] || 0)
  const month = MONTH_NAMES.findIndex((name) => label.toLowerCase().startsWith(name)) + 1
  return year * 100 + month
}

function trophyRecency(entry: Trophy) {
  const season = Number(entry.season?.match(/\d+/)?.[0] || 0)
  const week = Number(entry.week?.match(/\d+/)?.[0] || 0)
  return season * 100000 + week
}

const hallArtworkFrame: React.CSSProperties = {
  width: "100%",
  maxWidth: 1200,
  margin: "0 auto 18px",
  overflow: "hidden",
  border: "1px solid #334155",
  borderRadius: 20,
  background: "#020617",
}

const hallArtworkImage: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
}


const page: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, #172554 0%, #020617 48%, #000000 100%)",
  color: "white",
  padding: "30px 18px",
}

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1600,
  margin: "0 auto",
}

const topBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 20,
}

const backButton: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 16px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 10,
  color: "white",
  textDecoration: "none",
  fontWeight: 700,
}

const hero: React.CSSProperties = {
  padding: 26,
  background: "rgba(2, 6, 23, 0.9)",
  border: "1px solid #334155",
  borderRadius: 20,
  marginBottom: 20,
}

const title: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(42px, 9vw, 56px)",
  fontWeight: 800,
  color: "#FFD700",
}

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 18,
  lineHeight: 1.5,
}

const featuredCard: React.CSSProperties = {
  padding: 24,
  marginBottom: 20,
  background: "#0b1220",
  border: "1px solid #d4af37",
  borderRadius: 20,
}

const cupGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(320px, 1fr))",
  gap: 20,
}

const cupCard: React.CSSProperties = {
  background: "#0b1220",
  border: "2px solid #d4af37",
  borderRadius: 18,
  padding: 18,
  textAlign: "center",
}

const cupVideo: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
}

const featuredTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 26,
}

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 24,
}

const featuredWinner: React.CSSProperties = {
  margin: "14px 0 0",
  color: "#f8fafc",
  fontSize: 17,
  fontWeight: 800,
}

const featuredWinnerLink: React.CSSProperties = {
  color: "#facc15",
  textDecoration: "none",
}

const recentGroupsSection: React.CSSProperties = {
  ...card,
  marginBottom: 20,
}

const recentGroupsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 18,
}

const recentGroupCard: React.CSSProperties = {
  padding: 18,
  background: "#020617",
  border: "1px solid #475569",
  borderRadius: 14,
}

const recentGroupTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.2,
}

const recentGroupMeta: React.CSSProperties = {
  margin: "8px 0 14px",
  color: "#94a3b8",
  fontSize: 14,
}

const recentPreviewList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
}

const recentPreviewRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: 9,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 10,
}

const recentPreviewImage: React.CSSProperties = {
  width: 52,
  height: 52,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid #475569",
  flex: "0 0 auto",
}

const recentPreviewInformation: React.CSSProperties = {
  display: "flex",
  minWidth: 0,
  flexDirection: "column",
  gap: 3,
}

const recentPreviewLabel: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 700,
}

const recentGroupMore: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#94a3b8",
  fontSize: 13,
}

const recentGroupLink: React.CSSProperties = {
  display: "inline-block",
  marginTop: 14,
  color: "#facc15",
  fontWeight: 850,
  textDecoration: "none",
}

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
}

const sectionDescription: React.CSSProperties = {
  color: "#cbd5e1",
  lineHeight: 1.5,
}

const categoryBrowser: React.CSSProperties = {
  ...card,
  marginTop: 20,
}

const filteredCategoryCard: React.CSSProperties = {
  ...categoryBrowser,
}

const categoryNavigation: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  margin: "18px 0 24px",
}

const categoryLink: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  background: "#1e293b",
  border: "1px solid #475569",
  borderRadius: 10,
  color: "#f8fafc",
  textDecoration: "none",
  fontWeight: 800,
}

const categorySection: React.CSSProperties = {
  marginTop: 26,
  paddingTop: 22,
  borderTop: "1px solid #334155",
}

const categoryTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
}

const categoryChoices: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginTop: 16,
}

const categoryDetails: React.CSSProperties = {
  padding: "14px 16px",
  background: "#020617",
  border: "1px solid #475569",
  borderRadius: 12,
}

const categorySummary: React.CSSProperties = {
  cursor: "pointer",
  color: "#f8fafc",
  fontSize: 21,
  fontWeight: 850,
}

const championList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  marginTop: 18,
}

const championRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 14,
  padding: 14,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
}
const trophyImage: React.CSSProperties = {
  width: "min(100%, 270px)",
  height: 190,
  objectFit: "contain",
  background: "#020617",
  borderRadius: 12,
  border: "1px solid #475569",
  flex: "0 1 270px",
}

const championInformation: React.CSSProperties = {
  display: "flex",
  flex: "1 1 280px",
  minWidth: 0,
  flexDirection: "column",
  gap: 6,
}

const championName: React.CSSProperties = {
  color: "#38bdf8",
  fontSize: 20,
  fontWeight: 800,
  textDecoration: "none",
}

const trophyName: React.CSSProperties = {
  fontSize: 18,
}

const muted: React.CSSProperties = {
  color: "#94a3b8",
}

const metadata: React.CSSProperties = {
  color: "#64748b",
  fontSize: 14,
}

const messageCard: React.CSSProperties = {
  padding: 20,
  background: "#111827",
  borderRadius: 12,
  border: "1px solid #334155",
}

const errorCard: React.CSSProperties = {
  padding: 20,
  background: "#450a0a",
  borderRadius: 12,
  border: "1px solid #ef4444",
}

const emptyText: React.CSSProperties = {
  color: "#94a3b8",
}