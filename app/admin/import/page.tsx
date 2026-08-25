"use client";

import Link from "next/link";

const cards = [
  {
    title: "League CSV",
    description:
      "Import Stroke, Match Play, Doubles, Pro and other league results.",
    href: "/admin/import/csv",
    color: "bg-blue-600",
  },
  {
    title: "Tournament",
    description:
      "Import tournament brackets and historical tournament results.",
    href: "/admin/import/tournament",
    color: "bg-purple-600",
  },
  {
    title: "KWT",
    description:
      "Import Krys Weekend Tourney scores and statistics.",
    href: "/admin/kwt-import",
    color: "bg-green-600",
  },
  {
    title: "Historical Monthly",
    description:
      "Review recovered Monthly website scores, identities, and source validation.",
    href: "/admin/import/monthly",
    color: "bg-orange-600",
  },
  {
    title: "Historical Pro",
    description: "Review recovered Pro scorecards, Global Player identities, source conflicts, and opponent evidence.",
    href: "/admin/import/pro",
    color: "bg-cyan-700",
  },
  {
    title: "Trophies",
    description:
      "Import historical trophies and awards and connect them to player profiles.",
    href: "/admin/trophies",
    color: "bg-yellow-600",
  },
  {
    title: "Profile Backgrounds",
    description:
      "Upload approved backgrounds for Player Profiles.",
    href: "/admin/import/profile-backgrounds",
    color: "bg-cyan-700",
  },
  {
    title: "Google Sheets",
    description:
      "Connect and import data directly from Google Sheets (coming soon).",
    href: "#",
    color: "bg-red-600",
    disabled: true,
  },
  {
    title: "Import History",
    description:
      "Review previous imports, errors, and completed batches.",
    href: "/admin/import/history",
    color: "bg-slate-700",
  },
];

export default function ImportCenterPage() {
  return (
    <div className="max-w-7xl mx-auto p-8">

      <h1 className="text-4xl font-bold mb-2">
        📦 Krys League Data Import Center
      </h1>

      <p className="text-gray-400 mb-10">
        Import league history, tournaments, KWT, monthly ladders,
        Google Sheets, and future data sources into the Krys League database.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {cards.map((card) => (

          <div
            key={card.title}
            className="rounded-xl border border-gray-700 bg-zinc-900 shadow-lg overflow-hidden"
          >

            <div className={`${card.color} px-6 py-4`}>
              <h2 className="text-2xl font-bold text-white">
                {card.title}
              </h2>
            </div>

            <div className="p-6">

              <p className="text-gray-300 mb-6">
                {card.description}
              </p>

              {card.disabled ? (

                <button
                  disabled
                  className="w-full rounded-lg bg-gray-700 py-3 text-gray-400 cursor-not-allowed"
                >
                  Coming Soon
                </button>

              ) : (

                <Link
                  href={card.href}
                  className="block w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 transition text-center py-3 font-semibold"
                >
                  Open
                </Link>

              )}

            </div>

          </div>

        ))}

      </div>

      <div className="mt-12 rounded-xl border border-green-700 bg-green-950 p-6">

        <h2 className="text-2xl font-bold mb-4">
          Future Import Workflow
        </h2>

        <ol className="space-y-2 list-decimal ml-6">

          <li>Upload CSV or connect a Google Sheet.</li>

          <li>Preview every imported row.</li>

          <li>Automatically match existing players.</li>

          <li>Review uncertain matches.</li>

          <li>Create new player profiles when necessary.</li>

          <li>Validate scores and records.</li>

          <li>Import into Supabase.</li>

          <li>Update standings, statistics, records, and achievements.</li>

        </ol>

      </div>

    </div>
  );
}
