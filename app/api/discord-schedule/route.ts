import { NextResponse } from "next/server"
import { authorizeSiteAdminMutation } from "@/lib/auth/siteAdminMutation"

function getDivisionWebhook(division: string) {
  const key = division.trim()

  const webhooks: Record<string, string | undefined> = {
    "Stroke D1": process.env.DISCORD_WEBHOOK_STROKE_D1,
    "Stroke D2": process.env.DISCORD_WEBHOOK_STROKE_D2,
    "Stroke D3": process.env.DISCORD_WEBHOOK_STROKE_D3,
    "Stroke D4": process.env.DISCORD_WEBHOOK_STROKE_D4,
    "Stroke D5": process.env.DISCORD_WEBHOOK_STROKE_D5,
  }

  return webhooks[key]
}

export async function POST(request: Request) {
  const authorization = await authorizeSiteAdminMutation()
  if (!authorization.authorized) return authorization.response

  try {
    const body = await request.json()
    const { division, fixtures } = body

    const webhookUrl = getDivisionWebhook(division)

    if (!webhookUrl) {
      return NextResponse.json(
        { error: `No webhook found for ${division}` },
        { status: 400 }
      )
    }

    if (!fixtures || fixtures.length === 0) {
      return NextResponse.json(
        { error: "No fixtures provided" },
        { status: 400 }
      )
    }

    const scheduleText = fixtures
      .map(
        (f: any) =>
          `**Game ${f.game_number}**\n${f.player1} vs ${f.player2}\nCourse: ${f.course}`
      )
      .join("\n\n")

    const discordResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "Krys League Bot",
        embeds: [
          {
            title: `📅 ${division} Season Schedule`,
            color: 16776960,
            description: scheduleText,
          },
        ],
      }),
    })

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text()

      return NextResponse.json(
        { error: `Discord rejected webhook: ${errorText}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
