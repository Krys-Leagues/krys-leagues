"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { createDiscordAuthCallbackUrl } from "@/lib/authReturnTo";
import { getAuthenticatedDiscordId } from "@/lib/discordPlayerLogin";
import { supabase } from "@/lib/supabase";
import { isDuplicateWaitlistError, waitlistDuplicateMessage, waitlistSuccessMessage } from "@/lib/waitlistMessages";

const LEAGUES: Record<string, { title: string; waitlistLabel: string; subtitle: string; image: string | null; ageNote: string }> = {
  match: { title: "Match League Registration", waitlistLabel: "Match", subtitle: "Head-to-head leagues are 18+.", image: "/league-media/match.png", ageNote: "18+ only" },
  stroke: { title: "Stroke League Registration", waitlistLabel: "Stroke", subtitle: "Stroke play league signup.", image: "/league-media/stroke-preview.png", ageNote: "18+ only" },
  pyp: { title: "Pick Your Poison Registration", waitlistLabel: "Pick Your Poison", subtitle: "Home and away course-pick strategy league.", image: "/league-media/pyp-preview.png", ageNote: "18+ only" },
  pro: { title: "Pro League Registration", waitlistLabel: "Pro", subtitle: "Top competitive divisions and advanced play.", image: "/league-media/pro-preview.png", ageNote: "18+ only" },
  doubles: { title: "Doubles League Registration", waitlistLabel: "Doubles", subtitle: "Team-based league play.", image: "/league-media/doubles-preview.png", ageNote: "18+ only" },
  cups: { title: "Bracket / Cup Registration", waitlistLabel: "Bracket / Cup", subtitle: "Spicy, Krys, and Champion cup tracking.", image: null, ageNote: "Admins assign tiers" },
  community: { title: "Community Registration", waitlistLabel: "Community", subtitle: "Records, leaderboards, scoreboards, and community events.", image: "/league-media/stroke-preview.png", ageNote: "All skill levels" },
};

function RegisterContent() {
  const searchParams = useSearchParams();
  const leagueKey = searchParams.get("league") || "";
  const league = useMemo(() => LEAGUES[leagueKey], [leagueKey]);

  const [user, setUser] = useState<User | null>(null);
  const [screenName, setScreenName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signInWithDiscord() {
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: createDiscordAuthCallbackUrl("player"),
      },
    });
  }

  async function submitRegistration() {
    if (!league) return setStatus("Please choose a league first.");
    if (!user) return setStatus("Please sign in with Discord first.");
    if (!screenName.trim()) return setStatus("Please enter your Walkabout screen name.");

    setStatus("Saving...");

    const discordName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.preferred_username ||
      user.user_metadata?.user_name ||
      "Discord User";

    const discordId = getAuthenticatedDiscordId(user);
    if (!discordId) return setStatus("Discord identity could not be verified. Please sign out and sign in with Discord again.");

    const { data: existing, error: existingError } = await supabase
      .from("player_waitlist")
      .select("id")
      .eq("discord_id", discordId)
      .eq("league_type", leagueKey)
      .in("status", ["waiting", "pending"])
      .limit(1);

    if (existingError) return setStatus(`Error: ${existingError.message || "We couldn't check your existing waitlist registration."}`);
    if (existing?.length) return setStatus(waitlistDuplicateMessage(league.waitlistLabel));

    const { error } = await supabase.from("player_waitlist").insert({
      screen_name: screenName.trim(),
      league_type: leagueKey,
      discord_id: discordId,
      discord_username: discordName,
      notes: notes.trim() || null,
      status: "waiting",
    });

    if (error) {
      if (isDuplicateWaitlistError(error)) return setStatus(waitlistDuplicateMessage(league.waitlistLabel));
      return setStatus(`Error: ${error.message || "We couldn't save your waitlist registration."}`);
    }

    setStatus(waitlistSuccessMessage(league.waitlistLabel).join("\n"));
    setScreenName("");
    setNotes("");
  }

  if (!league) {
    return (
      <main style={{ minHeight: "100vh", background: "black", color: "white", padding: 24 }}>
        <h1>Choose a League First</h1>
        <Link href="/join" style={{ background: "#a855f7", color: "white", padding: "10px 14px", borderRadius: 8, fontWeight: "bold", textDecoration: "none" }}>
          ← Back to League Selection
        </Link>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "black", color: "white" }}>
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

      {leagueKey === "cups" ? (
        <section
          aria-labelledby="bracket-cup-registration-heading"
          data-registration-experience="bracket-cup"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            minHeight: 280,
            padding: "40px clamp(24px, 8vw, 120px)",
            color: "white",
            background: "radial-gradient(circle at 18% 20%, #6d28d9 0%, #241044 42%, #05020c 100%)",
            borderBottom: "1px solid #7c3aed",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/league-media/BIG LOGO TRANSPARENT.png" alt="" aria-hidden="true" style={{ width: 150, height: 150, objectFit: "contain" }} />
          <div>
            <p style={{ margin: 0, color: "#d8b4fe", fontWeight: 800, letterSpacing: "0.14em" }}>BRACKET / CUP PLAY</p>
            <h1 id="bracket-cup-registration-heading" style={{ margin: "10px 0 8px", fontSize: "clamp(30px, 5vw, 52px)" }}>Bracket / Cup Registration</h1>
            <p style={{ margin: 0, color: "#f3e8ff", fontSize: 18 }}>Spicy, Krys, and Champion cup tracking.</p>
          </div>
        </section>
      ) : (
        /* Existing registration artwork supports dynamically configured image paths. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={league.image || ""} alt={league.title} style={{ width: "100%", maxHeight: 620, objectFit: "contain", display: "block", background: "black" }} />
      )}

      <section style={{ maxWidth: 720, padding: 24 }}>
        <h1 style={{ marginBottom: 8 }}>{league.title}</h1>
        <p style={{ color: "#ff4d4d", fontSize: 18 }}>{league.subtitle}</p>

        {!user ? (
          <button onClick={signInWithDiscord} style={{ marginTop: 24, padding: "14px 22px", background: "#5865F2", color: "white", border: "none", borderRadius: 8, fontSize: 18, fontWeight: "bold", cursor: "pointer" }}>
            Sign in with Discord
          </button>
        ) : (
          <>
            <p style={{ marginTop: 24, fontSize: 18 }}>
              Logged in as <strong>{user.user_metadata?.preferred_username || user.user_metadata?.name || "Discord User"}</strong>
            </p>

            <input value={screenName} onChange={(e) => setScreenName(e.target.value)} placeholder="Walkabout screen name" style={{ width: "100%", maxWidth: 520, padding: 14, background: "#111", color: "white", border: "1px solid #444", borderRadius: 8, fontSize: 18, marginTop: 14, display: "block" }} />

            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" style={{ width: "100%", maxWidth: 520, padding: 14, background: "#111", color: "white", border: "1px solid #444", borderRadius: 8, fontSize: 16, marginTop: 14, minHeight: 90, display: "block" }} />

            <button onClick={submitRegistration} style={{ marginTop: 24, padding: "14px 22px", background: "#22c55e", color: "white", border: "none", borderRadius: 8, fontSize: 18, fontWeight: "bold", cursor: "pointer" }}>
              Submit Registration
            </button>
          </>
        )}

        {status && <p role={status.startsWith("Error:") ? "alert" : "status"} style={{ marginTop: 20, color: status.startsWith("Error:") ? "#f87171" : "#facc15", fontWeight: "bold", whiteSpace: "pre-line" }}>{status}</p>}
      </section>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main style={{ background: "black", color: "white", minHeight: "100vh", padding: 24 }}>Loading...</main>}>
      <RegisterContent />
    </Suspense>
  );
}
