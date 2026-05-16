"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const leagues = [
  { key: "stroke", label: "Stroke League" },
  { key: "match", label: "Match Play League" },
  { key: "pyp", label: "Pick Your Poison" },
  { key: "pro", label: "Pro League" },
  { key: "doubles", label: "Doubles League" },
  { key: "cups", label: "Bracket / Cup Players" },
  { key: "community", label: "Community / Records / Leaderboards" },
];

export default function RegisterPage() {
  const searchParams = useSearchParams();

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

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSessionUser(session?.user ?? null);
      }
    );

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

    setStatus("Saving registration...");

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

  if (!leagueInfo) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "black",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div>
          <h1>League Not Found</h1>

          <Link
            href="/join"
            style={{
              color: "#a855f7",
              fontWeight: "bold",
              textDecoration: "none",
            }}
          >
            ← Back to League Selection
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "black",
        color: "white",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 600,
          background: "#111",
          border: "1px solid #333",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <Link
          href="/join"
          style={{
            display: "inline-block",
            marginBottom: 20,
            color: "#a855f7",
            fontWeight: "bold",
            textDecoration: "none",
          }}
        >
          ← Back to League Selection
        </Link>

        <h1 style={{ marginBottom: 8 }}>
          {leagueInfo.label} Registration
        </h1>

        <p style={{ color: "#aaa", marginBottom: 24 }}>
          Sign in with Discord, then complete your registration.
        </p>

        {!sessionUser ? (
          <button
            onClick={signInWithDiscord}
            style={{
              width: "100%",
              padding: 14,
              background: "#5865F2",
              border: "none",
              borderRadius: 10,
              color: "white",
              fontWeight: "bold",
              cursor: "pointer",
              marginBottom: 20,
            }}
          >
            Sign in with Discord
          </button>
        ) : (
          <div
            style={{
              marginBottom: 20,
              color: "#22c55e",
              fontWeight: "bold",
            }}
          >
            Discord signed in ✅
          </div>
        )}

        <label style={{ display: "block", marginBottom: 8 }}>
          Player / Screen Name
        </label>

        <input
          value={screenName}
          onChange={(e) => setScreenName(e.target.value)}
          placeholder="Enter exact player name"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #444",
            background: "#222",
            color: "white",
            marginBottom: 20,
          }}
        />

        <label style={{ display: "block", marginBottom: 8 }}>
          Notes
        </label>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #444",
            background: "#222",
            color: "white",
            minHeight: 100,
            marginBottom: 20,
          }}
        />

        <button
          onClick={submitRegistration}
          style={{
            width: "100%",
            padding: 14,
            background: "#a855f7",
            border: "none",
            borderRadius: 10,
            color: "white",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Submit Registration
        </button>

        {status && (
          <p
            style={{
              marginTop: 20,
              color: "#facc15",
            }}
          >
            {status}
          </p>
        )}
      </div>
    </main>
  );
}