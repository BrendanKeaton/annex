import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/portal";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const stageRes = await fetch(`${API_URL}/auth/user_state_increment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });
      if (!stageRes.ok) {
        return NextResponse.redirect(
          `${origin}/auth/error?error=Failed to initialize onboarding`,
        );
      }

      await supabase.auth.refreshSession();

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/auth/error?error=Could not authenticate with provider`,
  );
}
