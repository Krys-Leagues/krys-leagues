"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams, useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const leagues = [
  { key: "stroke", label: "Stroke Play" },
  { key: "match", label: "Match Play" },
  { key: "pyp", label: "Pick Your Poison" },
  { key: "pro", label: "Pro League" },
  { key: "doubles", label: "Doubles" },
];

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedLeague = searchParams.get("league");
  const leagueInfo = useMemo(
    () => leagues.find((l) => l.key === selectedLeague),
    [selectedLeague]
  );

  const [sessionUser, setSessionUser] = useState<any>(null);
  const [screenName, setScreenName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSessionUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signInWithDiscord() {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname + window.location.search
    )}`;

    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo },
    });
  }

  async function submitRegistration() {
    if (!leagueInfo) return;
    if (!screenName.trim()) {
      setStatus("Please enter your player/screen name.");
      return;
    }

    if (!sessionUser) {
      setStatus("Please sign in with Discord first.");
      return;
    }

    setStatus("Saving...");

    const discordName =
      sessionUser.user_metadata?.full_name ||
      sessionUser.user_metadata?.name ||
      sessionUser.user_metadata?.preferred_username ||
      sessionUser.email ||
      "Discord User";

    const { error } = await supabase.from("player_waitlist").insert({
      screen_name: screenName.trim(),
      league_type: leagueInfo.key,
      discord_id: sessionUser.user_metadata?.provider_id || sessionUser.id,
      discord_username: discordName,
      notes: notes.trim() || null,
      status: "pending",
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setStatus("Registration saved! You are on the waitlist.");
    setScreenName("");
    setNotes("");
  }

  if (!selectedLeague) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
        <div className="w-full max-w-3xl">
          <h1 className="text-4xl font-bold text-center mb-3">Krys’ Leagues Registration</h1>
          <p className="text-center text-slate-300 mb-8">
            Choose the league you want to join.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {leagues.map((league) => (
              <button
                key={league.key}
                onClick={() => router.push(`/register?league=${league.key}`)}
                className="rounded-2xl bg-purple-700 hover:bg-purple-600 p-6 text-xl font-bold shadow-lg"
              >
                {league.label}
              </button>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!leagueInfo) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
        <div className="max-w-xl text-center">
          <h1 className="text-3xl font-bold mb-4">League not found</h1>
          <button
            onClick={() => router.push("/register")}
            className="rounded-xl bg-purple-700 px-5 py-3 font-bold"
          >
            Choose Another League
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl bg-slate-900 p-6 shadow-xl border border-purple-700">
        <button
          onClick={() => router.push("/register")}
          className="mb-5 text-purple-300 hover:text-purple-200 font-bold"
        >
          ← Choose Another League
        </button>

        <h1 className="text-3xl font-bold mb-2">{leagueInfo.label} Registration</h1>
        <p className="text-slate-300 mb-6">
          Sign in with Discord, then enter your player name.
        </p>

        {!sessionUser ? (
          <button
            onClick={signInWithDiscord}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 p-4 font-bold mb-5"
          >
            Sign in with Discord
          </button>
        ) : (
          <p className="mb-5 text-green-300 font-bold">Discord signed in ✅</p>
        )}

        <label className="block mb-2 font-bold">Player / Screen Name</label>
        <input
          value={screenName}
          onChange={(e) => setScreenName(e.target.value)}
          className="w-full rounded-xl p-3 text-black mb-4"
          placeholder="Enter exact player name"
        />

        <label className="block mb-2 font-bold">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl p-3 text-black mb-4"
          placeholder="Optional notes"
        />

        <button
          onClick={submitRegistration}
          className="w-full rounded-xl bg-purple-700 hover:bg-purple-600 p-4 font-bold"
        >
          Submit Registration
        </button>

        {status && <p className="mt-4 text-center text-yellow-300">{status}</p>}
      </div>
    </main>
  );
}