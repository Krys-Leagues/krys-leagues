"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleLogin() {
      const next = searchParams.get("next") || "/join";
      await supabase.auth.getSession();
      router.replace(next);
    }

    handleLogin();
  }, [router, searchParams]);

  return (
    <main style={{ padding: 40, background: "black", color: "white", minHeight: "100vh" }}>
      <h2>Logging you in...</h2>
    </main>
  );
}