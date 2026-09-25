import { DISCORD_DOUBLES_ELITE_CHANNEL_ID } from "./discordPreviewSender.ts"

export const DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID = DISCORD_DOUBLES_ELITE_CHANNEL_ID
export const DOUBLES_NEXT_SEASON_TEST_CUSTOM_PREFIX = "preview:next-season:doubles:"

type DiscordButton = { type: 2; style: 2; label: string; custom_id: string; disabled: true }
type DiscordPayload = { content: string; embeds: Array<Record<string, unknown>>; components?: Array<{ type: 1; components: DiscordButton[] }>; allowed_mentions: { parse: string[] } }

const button = (label: string, action: string): DiscordButton => ({
  type: 2,
  style: 2,
  label,
  custom_id: `${DOUBLES_NEXT_SEASON_TEST_CUSTOM_PREFIX}${action}`,
  disabled: true,
})

export const DOUBLES_NEXT_SEASON_SAMPLE = {
  seasonLabel: "Next Season · TEST ONLY",
  division: "DOUBLES ELITE",
  homeTeam: "Fairway Foxes",
  homePlayers: ["Avery Morgan", "Jordan Lee"],
  awayTeam: "Green Giants",
  awayPlayers: ["Morgan Ellis", "Riley Chen"],
  proposedTime: "Saturday · 10:00 AM ET",
  course: "Pine Valley",
} as const

export function isDoublesNextSeasonExperienceEnabled(input: { currentSeasonId: string; targetSeasonId: string; explicitEnable?: string }) {
  return input.currentSeasonId !== input.targetSeasonId && input.explicitEnable === "true"
}

export function renderDoublesNextSeasonArrangePreview(): DiscordPayload {
  const s = DOUBLES_NEXT_SEASON_SAMPLE
  return {
    content: "TEST PREVIEW · NEXT-SEASON EXPERIENCE · DOUBLES ELITE",
    embeds: [{
      title: "DOUBLES ELITE · ARRANGE",
      description: `${s.seasonLabel}\nArrange is ready for the exact four fixture participants.\n\n**MATCH SET** · ${s.proposedTime}`,
      color: 0xdc2626,
      fields: [
        { name: "HOME TEAM", value: `**${s.homeTeam}**\n${s.homePlayers.join("\n")}`, inline: false },
        { name: "AWAY TEAM", value: `**${s.awayTeam}**\n${s.awayPlayers.join("\n")}`, inline: false },
        { name: "ALL-FOUR OVERLAP", value: "Confirmed · both teams available", inline: false },
        { name: "PRIVATE FIXTURE CHAT", value: "Limited to the four scheduled players", inline: false },
      ],
    }],
    components: [{ type: 1, components: [
      button("SET AVAILABILITY · PREVIEW", "availability"),
      button("PROPOSE TIME · PREVIEW", "propose"),
      button("COUNTER · PREVIEW", "counter"),
      button("ACCEPT · PREVIEW", "accept"),
    ] }],
    allowed_mentions: { parse: [] },
  }
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

export function renderDoublesNextSeasonBoardSvg(): string {
  const s = DOUBLES_NEXT_SEASON_SAMPLE
  const rows = [
    ["1", "Fairway Foxes", "18 pts"],
    ["2", "Green Giants", "15 pts"],
    ["3", "Sandbaggers", "12 pts"],
    ["4", "Birdie Club", "9 pts"],
  ]
  const rowSvg = rows.map(([rank, team, points], index) => `<text x="1120" y="${640 + index * 42}" class="row"><tspan class="rank">${rank}</tspan><tspan dx="24">${escapeXml(team)}</tspan><tspan x="1440" text-anchor="end">${points}</tspan></text>`).join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect width="1600" height="900" rx="28" fill="#fafafa"/>
  <rect x="0" y="0" width="1600" height="14" fill="#dc2626"/>
  <text x="90" y="88" class="title">DOUBLES ELITE</text>
  <text x="90" y="126" class="subtitle">${s.seasonLabel} · Live Division Board</text>
  <rect x="1260" y="58" width="250" height="44" rx="22" fill="#fff1f2" stroke="#fecaca"/>
  <text x="1385" y="86" text-anchor="middle" class="pill">NEXT-SEASON TEST</text>
  <rect x="70" y="166" width="980" height="590" rx="22" fill="#ffffff" stroke="#e4e4e7"/>
  <text x="104" y="216" class="game">GAME 1</text>
  <rect x="830" y="184" width="170" height="36" rx="18" fill="#fff1f2" stroke="#fecaca"/>
  <text x="915" y="207" text-anchor="middle" class="status">MATCH SET</text>
  <rect x="104" y="254" width="380" height="180" rx="16" fill="#fffafa" stroke="#fecaca"/>
  <text x="128" y="292" class="label">HOME TEAM</text>
  <text x="128" y="334" class="team">${s.homeTeam}</text>
  <text x="128" y="370" class="player">${s.homePlayers[0]}</text><text x="128" y="400" class="player">${s.homePlayers[1]}</text>
  <text x="560" y="356" text-anchor="middle" class="vs">VS</text>
  <rect x="636" y="254" width="380" height="180" rx="16" fill="#fffafa" stroke="#fecaca"/>
  <text x="660" y="292" class="label">AWAY TEAM</text>
  <text x="660" y="334" class="team">${s.awayTeam}</text>
  <text x="660" y="370" class="player">${s.awayPlayers[0]}</text><text x="660" y="400" class="player">${s.awayPlayers[1]}</text>
  <text x="104" y="486" class="label">ARRANGED TIME</text><text x="104" y="522" class="course">${s.proposedTime}</text>
  <text x="104" y="570" class="label">COURSE</text><text x="104" y="606" class="course">Course details in match thread</text>
  <rect x="104" y="650" width="250" height="52" rx="10" fill="#fef2f2" stroke="#fecaca"/><text x="229" y="683" text-anchor="middle" class="button">MATCH THREAD READY</text>
  <rect x="1090" y="166" width="440" height="590" rx="22" fill="#ffffff" stroke="#e4e4e7"/>
  <text x="1120" y="220" class="game">CURRENT STANDINGS</text><text x="1120" y="260" class="subtitle">By team</text>
  ${rowSvg}
  <text x="80" y="830" class="footer">Team-based presentation · sample data only · no live season data</text>
  <style>.title{font:700 42px Inter,Arial,sans-serif;fill:#18181b}.subtitle{font:18px Inter,Arial,sans-serif;fill:#71717a}.pill,.status{font:700 13px Inter,Arial,sans-serif;fill:#b91c1c;letter-spacing:1px}.game{font:700 24px Inter,Arial,sans-serif;fill:#18181b}.label{font:700 13px Inter,Arial,sans-serif;fill:#9f1239;letter-spacing:1px}.team{font:700 28px Inter,Arial,sans-serif;fill:#18181b}.player{font:18px Inter,Arial,sans-serif;fill:#52525b}.vs{font:700 18px Inter,Arial,sans-serif;fill:#b91c1c;letter-spacing:2px}.course{font:20px Inter,Arial,sans-serif;fill:#27272a}.button{font:700 13px Inter,Arial,sans-serif;fill:#b91c1c;letter-spacing:.5px}.row{font:18px Inter,Arial,sans-serif;fill:#27272a}.rank{fill:#a1a1aa}.footer{font:14px Inter,Arial,sans-serif;fill:#a1a1aa}</style>
</svg>`
}

export async function sendDoublesNextSeasonExperiencePreview(input: { botToken: string }, fetchImpl: typeof fetch = fetch) {
  if (!input.botToken.trim()) throw new Error("Discord bot token is required")
  const base = `https://discord.com/api/v10/channels/${DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID}/messages`
  const arrangeResponse = await fetchImpl(base, { method: "POST", headers: { Authorization: `Bot ${input.botToken}`, "Content-Type": "application/json" }, body: JSON.stringify(renderDoublesNextSeasonArrangePreview()) })
  if (!arrangeResponse.ok) throw new Error(`Discord Arrange preview post failed (${arrangeResponse.status})`)
  const arrange = await arrangeResponse.json() as { id?: string; channel_id?: string }
  if (!arrange.id || arrange.channel_id !== DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID) throw new Error("Discord returned an unexpected Arrange preview destination")
  const form = new FormData()
  form.append("payload_json", JSON.stringify({ content: "TEST PREVIEW · NEXT-SEASON DOUBLES ELITE BOARD", embeds: [{ title: "DOUBLES ELITE · LIVE BOARD IMAGE", description: "Current board image for the next-season test. The image contains no action controls.", color: 0xdc2626, image: { url: "attachment://doubles-next-season-board.svg" } }], allowed_mentions: { parse: [] } }))
  form.append("files[0]", new Blob([renderDoublesNextSeasonBoardSvg()], { type: "image/svg+xml" }), "doubles-next-season-board.svg")
  const boardResponse = await fetchImpl(base, { method: "POST", headers: { Authorization: `Bot ${input.botToken}` }, body: form })
  if (!boardResponse.ok) throw new Error(`Discord board preview post failed (${boardResponse.status})`)
  const board = await boardResponse.json() as { id?: string; channel_id?: string }
  if (!board.id || board.channel_id !== DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID) throw new Error("Discord returned an unexpected board preview destination")
  return {
    channelId: DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID,
    arrange: { id: arrange.id, url: `https://discord.com/channels/@me/${DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID}/${arrange.id}` },
    board: { id: board.id, url: `https://discord.com/channels/@me/${DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID}/${board.id}` },
  }
}

export async function sendDoublesNextSeasonMatchThreadPreview(input: { botToken: string }, fetchImpl: typeof fetch = fetch) {
  if (!input.botToken.trim()) throw new Error("Discord bot token is required")
  const root = "https://discord.com/api/v10"
  const threadResponse = await fetchImpl(`${root}/channels/${DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID}/threads`, {
    method: "POST",
    headers: { Authorization: `Bot ${input.botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "TEST · DOUBLES ELITE · GAME 1", auto_archive_duration: 1440, type: 11, invitable: false }),
  })
  if (!threadResponse.ok) throw new Error(`Discord match-thread preview failed (${threadResponse.status})`)
  const thread = await threadResponse.json() as { id?: string; parent_id?: string }
  if (!thread.id || thread.parent_id !== DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID) throw new Error("Discord returned an unexpected preview thread destination")
  const form = new FormData()
  form.append("payload_json", JSON.stringify({ content: "TEST PREVIEW · NEXT-SEASON MATCH THREAD\n@Avery Morgan · @Jordan Lee · @Morgan Ellis · @Riley Chen\nHOME: Fairway Foxes · AWAY: Green Giants\nMATCH SET · Saturday · 10:00 AM ET", embeds: [{ title: "GAME 1 · DOUBLES ELITE", description: "One test-safe scorecard action appears outside the image. No current-season data is connected.", color: 0xdc2626, image: { url: "attachment://doubles-next-season-match.svg" } }], components: [{ type: 1, components: [button("SUBMIT SCORECARD · PREVIEW", "scorecard")] }], allowed_mentions: { parse: [] } }))
  form.append("files[0]", new Blob([renderDoublesNextSeasonBoardSvg()], { type: "image/svg+xml" }), "doubles-next-season-match.svg")
  const messageResponse = await fetchImpl(`${root}/channels/${thread.id}/messages`, { method: "POST", headers: { Authorization: `Bot ${input.botToken}` }, body: form })
  if (!messageResponse.ok) throw new Error(`Discord match-thread starter failed (${messageResponse.status})`)
  const message = await messageResponse.json() as { id?: string; channel_id?: string }
  if (!message.id || message.channel_id !== thread.id) throw new Error("Discord returned an unexpected preview thread message destination")
  return {
    channelId: DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID,
    thread: { id: thread.id, url: `https://discord.com/channels/@me/${DOUBLES_NEXT_SEASON_TEST_CHANNEL_ID}/${thread.id}` },
    starter: { id: message.id, url: `https://discord.com/channels/@me/${thread.id}/${message.id}` },
  }
}
