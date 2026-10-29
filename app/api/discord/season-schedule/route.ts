import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

function getScheduleWebhook(leagueType: string, division: string) {
  const webhooks: Record<string, string | undefined> = {
    "match-Match D1": process.env.DISCORD_WEBHOOK_MATCH_D1,
    "match-Match D2": process.env.DISCORD_WEBHOOK_MATCH_D2,
    "match-Match D3": process.env.DISCORD_WEBHOOK_MATCH_D3,
    "match-Match D4": process.env.DISCORD_WEBHOOK_MATCH_D4,
    "match-Match D5": process.env.DISCORD_WEBHOOK_MATCH_D5,
  }

  return webhooks[`${leagueType}-${division}`]
}

export async function POST(req: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await req.json()

    const { league_type, division, season_number, due_date, matches } = body

    const webhookUrl = getScheduleWebhook(league_type, division)

    if (!webhookUrl) {
      return NextResponse.json(
        { error: `No schedule webhook found for ${league_type} / ${division}` },
        { status: 400 }
      )
    }

    const game1 = matches.filter((m: any) => m.game === "1")
    const game2 = matches.filter((m: any) => m.game === "2")
    const game3 = matches.filter((m: any) => m.game === "3")

    function gameText(gameMatches: any[]) {
      return gameMatches
        .map((m) => `${m.player1} vs ${m.player2}\nCourse: ${m.course}`)
        .join("\n\n")
    }

    const message = {
      embeds: [
        {
          title: `🏌️ Match League Schedule — ${division}`,
          color: 3447003,
          fields: [
            {
              name: "Season",
              value: `Season ${season_number}`,
              inline: true,
            },
            {
              name: "Due Date",
              value: due_date || "No due date set",
              inline: true,
            },
            {
              name: "Game 1",
              value: gameText(game1) || "No matches",
              inline: false,
            },
            {
              name: "Game 2",
              value: gameText(game2) || "No matches",
              inline: false,
            },
            {
              name: "Game 3",
              value: gameText(game3) || "No matches",
              inline: false,
            },
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
      return NextResponse.json(
        { error: `Discord failed: ${discordRes.status} ${discordText}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Season schedule post failed" },
      { status: 500 }
    )
  }
}
