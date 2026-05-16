"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const LEAGUES: Record<
  string,
  {
    title: string;
    subtitle: string;
    image: string;
    ageNote: string;
  }
> = {
  match: {
    title: "Match League Registration",
    subtitle: "Head-to-head leagues are 18+.",
    image: "/league-media/match.png",
    ageNote: "18+ only",
  },
  stroke: {
    title: "Stroke League Registration",
    subtitle: "Stroke play league signup.",
    image: "/league-media/stroke-preview.png",
    ageNote: "18+ only",
  },
  pyp: {
    title: "Pick Your Poison Registration",
    subtitle: "Home and away course-pick strategy league.",
    image: "/league-media/pyp-preview.png",
    ageNote: "18+ only",
  },
  pro: {
    title: "Pro League Registration",
    subtitle: "Top competitive divisions and advanced play.",
    image: "/league-media/pro-preview.png",
    ageNote: "18+ only",
  },
  doubles: {
    title: "Doubles League Registration",
    subtitle: "Team-based league play.",
    image: "/league-media/doubles-preview.png",
    ageNote: "18+ only",
  },
  cups: {
    title: "Bracket / Cup Registration",
    subtitle: "Spicy, Krys, and Champion cup tracking.",
    image: "/league-media/match.png",
    ageNote: "Admins assign tiers",
  },
  community: {
    title: "Community Registration",
    subtitle: "Records, leaderboards, scoreboards, and community events.",
    image: "/league-media/stroke-preview.png",
    ageNote: "All skill levels",
  },
};

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const leagueKey = searchParams.get("league") || "";
  const league = useMemo(() => LEAGUES[leagueKey], [leagueKey]);

  const [user, setUser] = useState<any>(null);
  const [screenName, setScreenName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signInWithDiscord() {
    const nextPath = `/register?league=${leagueKey}`;

    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          nextPath
        )}`,
      },
    });
  }

  async function submitRegistration() {
    if (!league) {
      setStatus("Please choose a league first.");
      return;
    }

    if (!user) {
      setStatus("Please sign in with Discord first.");
      return;
    }

    if (!screenName.trim()) {
      setStatus("Please enter your Walkabout screen name.");
      return;
    }

    setStatus("Saving...");

    const discordName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.preferred_username ||
      user.user_metadata?.user_name ||
      user.email ||
      "Discord User";

    const discordId =
      user.user_metadata?.provider_id ||
      user.user_metadata?.sub ||
      user.id;

    const { error } = await supabase.from("player_waitlist").insert({
      screen_name: screenName.trim(),
      league_type: leagueKey,
      discord_id: discordId,
      discord_username: discordName,
      notes: notes.trim() || null,
      status: "pending",
    });

    if (error) {
      setStatus(`Error: ${error.message}`);
      return;
    }

    setStatus("Registration saved! You are on the admin waitlist.");
    setScreenName("");
    setNotes("");
  }

  if (!league) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "black",
          color: "white",
          padding: 24,
        }}
      >
        <h1>Choose a League First</h1>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "black",
        color: "white",
      }}
    >
      <Link
        href="/join"
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 9999,
          background: "#a855f7",
          color: "white",
          padding: "10px 14px",
          borderRadius: 8,
          fontWeight: "bold",
          textDecoration: "none",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        }}
      >
        ← Back to League Selection
      </Link>

      <img
        src={league.image}
        alt={league.title}
        style={{
          width: "100%",
          maxHeight: 620,
          objectFit: "contain",
          display: "block",
          background: "black",
        }}
      />

      <section
        style={{
          maxWidth: 720,
          padding: 24,
        }}
      >
        <h1 style={{ marginBottom: 8 }}>
          {league.title}
        </h1>

        <p
          style={{
            color: "#ff4d4d",
            fontSize: 18,
          }}
        >
          {league.subtitle}
        </p>

        {!user ? (
          <button
            onClick={signInWithDiscord}
            style={{
              marginTop: 24,
              padding: "14px 22px",
              background: "#5865F2",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Sign in with Discord
          </button>
        ) : (
          <>
            <p
              style={{
                marginTop: 24,
                fontSize: 18,
              }}
            >
              Logged in as{" "}
              <strong>
                {user.user_metadata?.preferred_username ||
                  user.user_metadata?.name ||
                  user.email}
              </strong>
            </p>

            <input
              value={screenName}
              onChange={(e) => setScreenName(e.target.value)}
              placeholder="Walkabout screen name"
              style={{
                width: "100%",
                maxWidth: 520,
                padding: 14,
                background: "#111",
                color: "white",
                border: "1px solid #444",
                borderRadius: 8,
                fontSize: 18,
                marginTop: 14,
                display: "block",
              }}
            />

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              style={{
                width: "100%",
                maxWidth: 520,
                padding: 14,
                background: "#111",
                color: "white",
                border: "1px solid #444",
                borderRadius: 8,
                fontSize: 16,
                marginTop: 14,
                minHeight: 90,
                display: "block",
              }}
            />

            <button
              onClick={submitRegistration}
              style={{
                marginTop: 24,
                padding: "14px 22px",
                background: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontSize: 18,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Submit Registration
            </button>
          </>
        )}

        {status && (
          <p
            style={{
              marginTop: 20,
              color: "#facc15",
              fontWeight: "bold",
            }}
          >
            {status}
          </p>
        )}
      </section>
    </main>
  );
}