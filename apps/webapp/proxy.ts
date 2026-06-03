import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { createClient } from "@/lib/supabase/server";

export async function proxy(request: NextRequest) {
  const updatedSession = await updateSession(request);

  if (updatedSession.redirected) {
    return updatedSession;
  }

  const EXCLUDED_API_PATHS = [
    "/auth/callback",
    "/auth/confirm",
    "/auth/accept-invite",
    "/auth/update-password",
    "/portal/sign-out",
    "/desktop-callback",
  ];
  if (
    EXCLUDED_API_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))
  ) {
    return updatedSession;
  }

  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user) {
    return updatedSession;
  }

  const rawStage = user?.app_metadata?.onboarding_stage;
  const flowStage = rawStage != null ? Number(rawStage) : null;

  // --- FLOW STAGE REDIRECT LOGIC WITH LOOP PREVENTION ---
  let redirectPath: string | null = null;

  switch (flowStage) {
    case 1:
    case null:
      if (!request.nextUrl.pathname.startsWith("/onboarding/1"))
        redirectPath = "/onboarding/1";
      break;
    case 2:
      if (!request.nextUrl.pathname.startsWith("/onboarding/2"))
        redirectPath = "/onboarding/2";
      break;
    case 3:
      if (!request.nextUrl.pathname.startsWith("/onboarding/3"))
        redirectPath = "/onboarding/3";
      break;
    default:
      if (!request.nextUrl.pathname.startsWith("/portal"))
        redirectPath = "/portal";
      break;
  }

  if (redirectPath) {
    const redirectUrl = new URL(redirectPath, request.url);

    const redirectResponse = NextResponse.redirect(redirectUrl);

    updatedSession.cookies.getAll().forEach(({ name, value }) => {
      redirectResponse.cookies.set(name, value);
    });

    return redirectResponse;
  }

  return updatedSession;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
