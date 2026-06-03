import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrgClient } from "./org-client";
import { Suspense } from "react";

async function OrgContent() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/");
  }

  return <OrgClient />;
}

export default function OrganizationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center px-6 py-12 sm:px-12 lg:px-24">
          <div className="w-full max-w-3xl flex flex-col gap-4">
            <div className="h-8 w-40 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-64 bg-white/5 rounded animate-pulse" />
            <div className="h-48 w-full bg-white/5 rounded animate-pulse mt-4" />
          </div>
        </div>
      }
    >
      <OrgContent />
    </Suspense>
  );
}
