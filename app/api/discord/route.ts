import { NextResponse } from "next/server"

function getDivisionWebhook(division: string) {
  const key = division?.trim()

  const webhooks: Record<string, string | undefined> = {
    "Stroke D1": process.env.DISCORD_WEBHOOK_STROKE_D1,
    "Stroke D2": process.env.DISCORD_WEBHOOK_STROKE_D2,
    "Stroke D3": process.env.DISCORD_WEBHOOK_STROKE_D3,
    "Stroke D4": process.env.DISCORD_WEBHOOK_STROKE_D4,
    "Stroke D5": process.env.DISCORD_WEBHOOK_STROKE_D5,
  }

  return webhooks[key] || process.env.DISCORD_WEBHOOK_DEFAULT
}

function getLeagueEmoji(leagueType: string) {
  const type = leagueType?.toLowerCase() || ""
  if (type.includes("stroke")) return "🏌️"
  return "⛳"
}

function getLeagueColor() {
  return 0x2ecc71
}

// ✅ FIXED DATE (no timezone issues)
function formatDueDate(value: any) {
  if (!value) return null

  const text = String(value)

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-")
    return `${month}/${day}/${year}`
  }

  return text
}

function buildDiscordEmbeds(body: any) {
  const {
    leagueType = "Stroke",
    division,
    season,
    fixtures = [],
    message,
    dueDate,
  } = body

  const emoji = getLeagueEmoji(leagueType)
  const color = getLeagueColor()

  const formattedDueDate = formatDueDate(dueDate)

  // 🔷 HEADER CARD
  const embeds: any[] = [
    {
      title: `${emoji} ${division} • Season ${season}`,
      description: [
        "━━━━━━━━━━━━━━━━━━",
        message || "Stroke season schedule is set. Please complete all games before the due date.",
        formattedDueDate ? `Due Date: ${formattedDueDate}` : null,
        "━━━━━━━━━━━━━━━━━━",
      ].filter(Boolean).join("\n"),
      color,
    },
  ]

  // 🔷 MATCH CARDS (one per match)
  fixtures.forEach((f: any, index: number) => {
    const player1 = f.player1 || "Player 1"
    const player2 = f.player2 || "Player 2"
    const course = f.course || "Course TBD"
    const round = f.round || null
    const due = formatDueDate(f.dueDate || dueDate)

    embeds.push({
      title: `${emoji} ${division} • Match ${index + 1}`,
      description: [
        "━━━━━━━━━━━━━━━━━━",
        `**${player1}**`,
        "**vs**",
        `**${player2}**`,
        "━━━━━━━━━━━━━━━━━━",
      ].join("\n"),
      color,
      fields: [
        {
          name: "Course",
          value: course,
          inline: true,
        },
        {
          name: "Round",
          value: round ? String(round) : "-",
          inline: true,
        },
        {
          name: "Due Date",
          value: due || "TBD",
          inline: true,
        },
      ],
    })
  })

  return embeds
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const webhookUrl = getDivisionWebhook(body.division)

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "No webhook found" },
        { status: 400 }
      )
    }

    const embeds = buildDiscordEmbeds(body)

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Krys League Bot",
        embeds,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: text },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}