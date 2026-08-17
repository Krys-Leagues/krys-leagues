"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const JOIN_OPTIONS = [
  {
    icon: "🎯",
    title: "Match Play League",
    desc: "Head-to-head match play league.",
    note: "18+ only",
    link: "/register?league=match",
    color: "#22c55e",
  },
  {
    icon: "⛳",
    title: "Stroke League",
    desc: "Stroke play league signup.",
    note: "18+ only",
    link: "/register?league=stroke",
    color: "#14b8a6",
  },
  {
    icon: "☠️",
    title: "Pick Your Poison",
    desc: "Home and away course-pick strategy league.",
    note: "18+ only",
    link: "/register?league=pyp",
    color: "#84cc16",
  },
  {
    icon: "🤝",
    title: "Doubles League",
    desc: "Team-based league play.",
    note: "18+ only",
    link: "/register?league=doubles",
    color: "#06b6d4",
  },
  {
    icon: "🏆",
    title: "Pro League",
    desc: "Top competitive divisions and advanced play.",
    note: "18+ only",
    link: "/register?league=pro",
    color: "#f59e0b",
  },
  {
    icon: "🔥",
    title: "Bracket / Cup Players",
    desc: "Spicy, Krys, and Champion cup tracking.",
    note: "Admins assign tiers",
    link: "/register?league=cups",
    color: "#a855f7",
  },
  {
    icon: "📊",
    title: "Community / Records / Leaderboards",
    desc: "Scoreboards, records, solo boards, and community events.",
    note: "All skill levels",
    link: "/register?league=community",
    color: "#3b82f6",
  },
];

export default function JoinPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
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
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: createDiscordAuthCallbackUrl("player"),
      },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "black", color: "white", padding: 24 }}>
        Loading...
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "black", color: "white", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1>Join Krys’ Leagues</h1>

        <p style={{ fontSize: 18, color: "#ccc", lineHeight: 1.6 }}>
          Sign in with Discord first, then choose what you want to join.
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
              borderRadius: 10,
              fontSize: 18,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Sign in with Discord to Join
          </button>
        ) : (
          <>
            <div
              style={{
                marginTop: 18,
                marginBottom: 24,
                padding: 14,
                border: "1px solid #333",
                borderRadius: 10,
                background: "#111",
              }}
            >
              <strong>Discord signed in ✅</strong>
              <br />
              <span style={{ color: "#aaa" }}>
                Choose a league below.
              </span>

              <button
                onClick={signOut}
                style={{
                  marginLeft: 12,
                  padding: "8px 12px",
                  background: "#333",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: 18,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                marginTop: 28,
              }}
            >
              {JOIN_OPTIONS.map((option) => (
                <section
                  key={option.title}
                  style={{
                    border: "1px solid #333",
                    borderRadius: 12,
                    padding: 18,
                    background: "#111",
                  }}
                >
                  <div style={{ fontSize: 34 }}>{option.icon}</div>
                  <h2>{option.title}</h2>
                  <p>{option.desc}</p>
                  <p style={{ color: "#aaa" }}>{option.note}</p>

                  <Link
                    href={option.link}
                    style={{
                      display: "inline-block",
                      marginTop: 10,
                      padding: "10px 16px",
                      background: option.color,
                      color: "white",
                      borderRadius: 8,
                      textDecoration: "none",
                      fontWeight: "bold",
                    }}
                  >
                    Join
                  </Link>
                </section>
              ))}
            </div>
          </>
        )}

        <p style={{ marginTop: 28, color: "#aaa" }}>
          After signing up, your name goes to the admin waitlist for review.
        </p>
      </div>
    </main>
  );
}
