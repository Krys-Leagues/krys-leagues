import { NextResponse } from "next/server"

function getResultWebhook(leagueType: string, division: string) {
  const webhooks: Record<string, string | undefined> = {
    // Stroke
    "stroke-Stroke D1": process.env.DISCORD_WEBHOOK_STROKE_D1,
    "stroke-Stroke D2": process.env.DISCORD_WEBHOOK_STROKE_D2,
    "stroke-Stroke D3": process.env.DISCORD_WEBHOOK_STROKE_D3,
    "stroke-Stroke D4": process.env.DISCORD_WEBHOOK_STROKE_D4,
    "stroke-Stroke D5": process.env.DISCORD_WEBHOOK_STROKE_D5,

    // Match
    "match-Match D1": process.env.DISCORD_WEBHOOK_MATCH_D1,
    "match-Match D2": process.env.DISCORD_WEBHOOK_MATCH_D2,
    "match-Match D3": process.env.DISCORD_WEBHOOK_MATCH_D3,
    "match-Match D4": process.env.DISCORD_WEBHOOK_MATCH_D4,
    "match-Match D5": process.env.DISCORD_WEBHOOK_MATCH_D5,

    // Doubles
    "doubles-Doubles Elite": process.env.DISCORD_WEBHOOK_DOUBLES_ELITE,
    "doubles-Doubles D1": process.env.DISCORD_WEBHOOK_DOUBLES_D1,
    "doubles-Doubles D2": process.env.DISCORD_WEBHOOK_DOUBLES_D2,
    "doubles-Doubles D3": process.env.DISCORD_WEBHOOK_DOUBLES_D3,
    "doubles-Doubles D4": process.env.DISCORD_WEBHOOK_DOUBLES_D4,
    "doubles-Doubles D5": process.env.DISCORD_WEBHOOK_DOUBLES_D5,

    // PYP
    "pyp-PYP D1": process.env.DISCORD_WEBHOOK_PYP_D1,
    "pyp-PYP D2": process.env.DISCORD_WEBHOOK_PYP_D2,
    "pyp-PYP D3": process.env.DISCORD_WEBHOOK_PYP_D3,
    "pyp-PYP D4": process.env.DISCORD_WEBHOOK_PYP_D4,
    "pyp-PYP D5": process.env.DISCORD_WEBHOOK_PYP_D5,

    // Pro / Amateur to Pro
    "pro-Pro D1": process.env.DISCORD_WEBHOOK_PRO_D1,
    "pro-Pro D2": process.env.DISCORD_WEBHOOK_PRO_D2,
    "pro-Pro D3": process.env.DISCORD_WEBHOOK_PRO_D3,
    "pro-Semi Pro D1": process.env.DISCORD_WEBHOOK_SEMI_PRO_D1,
    "pro-Amateur D1": process.env.DISCORD_WEBHOOK_AMATEUR_D1,
  }

  return webhooks[`${leagueType}-${division}`]
}

function getLeagueName(leagueType: string) {
  if (leagueType === "stroke") return "Stroke League"
  if (leagueType === "match") return "Match League"
  if (leagueType === "pyp") return "PYP League"
  if (leagueType === "doubles") return "Doubles League"
  if (leagueType === "pro") return "Pro League"
  return "League"
}

export async function POST(req: Request) {
  try {
    const result = await req.json()

    console.log("RESULT CARD HIT:", result)

    const webhookUrl = getResultWebhook(result.league_type, result.division)

    if (!webhookUrl) {
      return NextResponse.json(
        {
          success: false,
          error: `No webhook set for ${result.league_type} / ${result.division}`,
        },
        { status: 400 }
      )
    }

    const isScoreLeague =
      result.league_type === "stroke" ||
      result.league_type === "pro" ||
      result.league_type === "pyp"

    const scoreLine = isScoreLeague
      ? `${result.player1}: ${result.player1_score}\n${result.player2}: ${result.player2_score}`
      : `${result.player1}: ${result.player1_hw} HW\n${result.player2}: ${result.player2_hw} HW`

    const outcome = result.is_draw ? "Draw" : `Winner: ${result.winner}`

    const message = {
      embeds: [
        {
          title: `🏌️ Result Posted — ${getLeagueName(result.league_type)}`,
          color: 5763719,
          fields: [
            { name: "Division", value: result.division || "N/A", inline: true },
            {
              name: "Season / Game",
              value: `Season ${result.season_number} — Game ${result.game}`,
              inline: true,
            },
            { name: "Course", value: result.course || "Course TBD", inline: false },
            {
              name: "Match",
              value: `${result.player1} vs ${result.player2}`,
              inline: false,
            },
            { name: "Result", value: scoreLine, inline: false },
            { name: "Outcome", value: outcome, inline: false },
          ],
        },
      ],
    }

    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    })

    const discordText = await discordRes.text()

    if (!discordRes.ok) {
      console.error("DISCORD FAILED:", discordRes.status, discordText)

      return NextResponse.json(
        {
          success: false,
          error: `Discord failed: ${discordRes.status} ${discordText || discordRes.statusText}`,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Discord result card posted",
    })
  } catch (error: any) {
    console.error("RESULT CARD ROUTE ERROR:", error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Result card route error",
      },
      { status: 500 }
    )
  }
}