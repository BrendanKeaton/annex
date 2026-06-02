import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileClient } from "./profile-client";
import { Suspense } from "react";

async function ProfileContent() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/");
  }

  const claims = data.claims;
  const email = claims.email as string;
  const providers: string[] =
    (claims.app_metadata as Record<string, unknown>)?.providers as string[] ?? [];
  const isOAuthUser = providers.some((p) => p === "google" || p === "github");
  const provider = isOAuthUser
    ? providers.find((p) => p === "google" || p === "github") ?? "email"
    : "email";

  return (
    <ProfileClient
      email={email}
      provider={provider}
      isOAuthUser={isOAuthUser}
    />
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center px-6 py-12 sm:px-12 lg:px-24">
          <div className="w-full max-w-lg flex flex-col gap-4">
            <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-64 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
