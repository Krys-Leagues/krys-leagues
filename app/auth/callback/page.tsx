"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handleLogin() {
  const code = searchParams.get("code");
  const next = searchParams.get("next");
  const type = searchParams.get("type");

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  if (type === "player" && next) {
    router.replace(next);
    return;
  }

  router.replace("/admin");
}
    handleLogin();
  }, [router, searchParams]);

  return (
    <main style={{ minHeight: "100vh", background: "black", color: "white", padding: 40 }}>
      <h2>Logging you in...</h2>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main style={{ background: "black", color: "white", minHeight: "100vh", padding: 40 }}>Loading...</main>}>
      <CallbackHandler />
    </Suspense>
  );
}