function getDivisionWebhook(division: string) {
  const webhooks: Record<string, string | undefined> = {
    "Stroke D1": process.env.DISCORD_WEBHOOK_STROKE_D1,
    "Stroke D2": process.env.DISCORD_WEBHOOK_STROKE_D2,
    "Stroke D3": process.env.DISCORD_WEBHOOK_STROKE_D3,
    "Stroke D4": process.env.DISCORD_WEBHOOK_STROKE_D4,
    "Stroke D5": process.env.DISCORD_WEBHOOK_STROKE_D5,
  };

  return webhooks[division];
}

export async function postMatchToDiscord({
  player1Name,
  player2Name,
  player1Score,
  player2Score,
  winnerName,
  gameNumber,
  division,
}: {
  player1Name: string;
  player2Name: string;
  player1Score: number;
  player2Score: number;
  winnerName: string | null;
  gameNumber: number;
  division: string;
}) {
  const webhookUrl = getDivisionWebhook(division);

  if (!webhookUrl) {
    console.log("No webhook for division:", division);
    return;
  }

  const resultText = winnerName
    ? `🏆 Winner: **${winnerName}**`
    : `🤝 Match ended in a draw`;

  const message = {
    username: "Krys League Bot",
    embeds: [
      {
        title: `⛳ Game ${gameNumber} Result`,
        color: 5763719,
        fields: [
          { name: "Division", value: division },
          {
            name: "Match",
            value: `**${player1Name}** ${player1Score} / **${player2Name}** ${player2Score}`,
          },
          { name: "Result", value: resultText },
        ],
      },
    ],
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
}