import { NextResponse } from "next/server"

function getWebhookForDivision(division: string) {
  const webhookMap: Record<string, string | undefined> = {
    // Stroke
    "Stroke D1": process.env.DISCORD_WEBHOOK_STROKE_D1,
    "Stroke D2": process.env.DISCORD_WEBHOOK_STROKE_D2,
    "Stroke D3": process.env.DISCORD_WEBHOOK_STROKE_D3,
    "Stroke D4": process.env.DISCORD_WEBHOOK_STROKE_D4,
    "Stroke D5": process.env.DISCORD_WEBHOOK_STROKE_D5,

    // Match Play
    "Match Play D1": process.env.DISCORD_WEBHOOK_MATCH_D1,
    "Match Play D2": process.env.DISCORD_WEBHOOK_MATCH_D2,
    "Match Play D3": process.env.DISCORD_WEBHOOK_MATCH_D3,
    "Match Play D4": process.env.DISCORD_WEBHOOK_MATCH_D4,
    "Match Play D5": process.env.DISCORD_WEBHOOK_MATCH_D5,
    "Match Play D6": process.env.DISCORD_WEBHOOK_MATCH_D6,

    // Amateur → Pro
    "Amateur D1": process.env.DISCORD_WEBHOOK_AMATEUR_D1,
    "Semi Pro D1": process.env.DISCORD_WEBHOOK_SEMIPRO_D1,
    "Pro D1": process.env.DISCORD_WEBHOOK_PRO_D1,
    "Pro D2": process.env.DISCORD_WEBHOOK_PRO_D2,
    "Pro D3": process.env.DISCORD_WEBHOOK_PRO_D3,

    // Doubles
    "Doubles Elite": process.env.DISCORD_WEBHOOK_DOUBLES_ELITE,
    "Doubles D1": process.env.DISCORD_WEBHOOK_DOUBLES_D1,
    "Doubles D2": process.env.DISCORD_WEBHOOK_DOUBLES_D2,
    "Doubles D3": process.env.DISCORD_WEBHOOK_DOUBLES_D3,
    "Doubles D4": process.env.DISCORD_WEBHOOK_DOUBLES_D4,
    "Doubles D5": process.env.DISCORD_WEBHOOK_DOUBLES_D5,
    "Doubles D6": process.env.DISCORD_WEBHOOK_DOUBLES_D6,

    // Pick Your Poison
    "PYP D1": process.env.DISCORD_WEBHOOK_PYP_D1 || "https://discord.com/api/webhooks/1498372170664120321/KQ8DZPEAHcy-tNQgRVsFX1QtCkzBdg4cXpE-8_R9tQ9pFIGKTCk0rOgmOD5oudPVeLZU",
    "PYP D2": process.env.DISCORD_WEBHOOK_PYP_D2,
    "PYP D3": process.env.DISCORD_WEBHOOK_PYP_D3,
    "PYP D4": process.env.DISCORD_WEBHOOK_PYP_D4,
    "PYP D5": process.env.DISCORD_WEBHOOK_PYP_D5,
  }

  return webhookMap[division]
}

export async function POST(req: Request) {
  const { content, division } = await req.json()

  const webhookUrl = getWebhookForDivision(division)

  if (!webhookUrl) {
    return NextResponse.json(
      { error: `No webhook set for ${division} (check .env.local)` },
      { status: 500 }
    )
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  })

  if (!res.ok) {
    const text = await res.text()

    return NextResponse.json(
      { error: `Discord error: ${text}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}