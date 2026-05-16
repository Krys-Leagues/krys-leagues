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
      const next = searchParams.get("next") || "/join";

      await supabase.auth.getSession();

      router.replace(next);
    }

    handleLogin();
  }, [router, searchParams]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "black",
        color: "white",
        padding: 40,
      }}
    >
      <h2>Logging you in...</h2>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CallbackHandler />
    </Suspense>
  );
}