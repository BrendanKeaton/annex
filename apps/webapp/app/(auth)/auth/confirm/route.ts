import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

function redirectForStage(stage: number | null): string {
  switch (stage) {
    case 1:
    case null:
      return "/onboarding/1";
    case 2:
      return "/onboarding/2";
    case 3:
      return "/onboarding/3";
    default:
      return "/portal";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await createClient();

  // PKCE flow — Supabase sends a `code` param when using @supabase/ssr
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect(`/auth/error?error=${error.message}`);
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const stageRes = await fetch(`${API_URL}/auth/user_state_increment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session?.access_token}`,
        },
      });
      if (!stageRes.ok) {
        redirect("/auth/error?error=Failed to initialize onboarding");
      }
    } catch {
      redirect("/auth/error?error=Failed to connect to backend service");
    }

    const { data: refreshedSession } = await supabase.auth.refreshSession();
    const rawStage =
      refreshedSession.session?.user?.app_metadata?.onboarding_stage;
    const flowStage = rawStage != null ? Number(rawStage) : null;

    redirect(redirectForStage(flowStage));
  }

  // Legacy OTP flow — token_hash + type params
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (error) {
      redirect(`/auth/error?error=${error.message}`);
    }

    // Invited users skip org setup
    if (type === "invite") {
      redirect("/auth/accept-invite");
    }

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const stageRes = await fetch(`${API_URL}/auth/user_state_increment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session?.access_token}`,
        },
      });
      if (!stageRes.ok) {
        redirect("/auth/error?error=Failed to initialize onboarding");
      }
    } catch {
      redirect("/auth/error?error=Failed to connect to backend service");
    }

    const { data: refreshedSession } = await supabase.auth.refreshSession();
    const rawStage =
      refreshedSession.session?.user?.app_metadata?.onboarding_stage;
    const flowStage = rawStage != null ? Number(rawStage) : null;

    redirect(redirectForStage(flowStage));
  }

  redirect("/auth/error?error=Missing authentication parameters");
}
