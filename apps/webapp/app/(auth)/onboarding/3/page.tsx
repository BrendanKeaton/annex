"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { RecoveryCodesDisplay } from "@/components/recovery-codes-display";

export default function OnboardingStep3() {
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchCodes() {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("Not authenticated");
        }

        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${API_URL}/auth/onboarding/recovery_codes`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Failed to generate recovery codes");
        }

        const data = await res.json();
        setCodes(data.recovery_codes ?? data.codes ?? []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchCodes();
  }, []);

  async function handleContinue() {
    const supabase = createClient();
    await supabase.auth.refreshSession();
    router.push("/portal");
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-12 sm:px-16 lg:px-24">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col gap-y-2">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/8 flex items-center justify-center mb-1">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-annex-dark-gray"
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          </div>
          <h1 className="text-lg font-mono font-semibold text-white">
            Recovery codes
          </h1>
          <p className="text-sm text-annex-dark-gray leading-relaxed">
            Save these codes somewhere safe. If something happens to your
            decryption keys, these can be used to recreate them.
          </p>
          <p className="text-xs text-annex-dark-gray/60">
            You can always view these again from the web app.
          </p>
        </div>

        {isLoading && (
          <p className="text-annex-dark-gray text-sm animate-pulse">
            Generating recovery codes...
          </p>
        )}

        {error && <p className="text-annex-light-red text-sm">{error}</p>}

        {codes.length > 0 && (
          <>
            <RecoveryCodesDisplay codes={codes} />

            <button
              onClick={handleContinue}
              className="w-full py-2.5 rounded-lg bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 cursor-pointer"
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
