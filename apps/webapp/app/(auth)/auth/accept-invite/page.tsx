"use client";

import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export default function AcceptInvitePage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            setError("Failed to verify invite. Please try the link again.");
          } else {
            window.history.replaceState(null, "", window.location.pathname);
            setSessionReady(true);
          }
        });
    } else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSessionReady(true);
        } else {
          setError(
            "No invite session found. Please use the invite link from your email.",
          );
        }
      });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || !session?.refresh_token) {
        throw new Error("Session expired. Please use the invite link again.");
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/auth_anon/accept_invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          new_password: password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail || "Failed to accept invite";
        if (
          detail.toLowerCase().includes("no pending invite") ||
          detail.toLowerCase().includes("expired")
        ) {
          throw new Error(
            "This invite has expired — ask your admin to resend.",
          );
        }
        throw new Error(detail);
      }

      // Refresh session so JWT claims reflect updated onboarding_stage
      await supabase.auth.refreshSession();

      // Middleware will route to the correct onboarding stage (PIN setup)
      router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-12 sm:px-16 lg:px-24">
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-semibold text-annex-white font-mono">
            Welcome to Annex
          </h1>
          <p className="mt-2 text-sm text-annex-dark-gray">
            Set a password to finish setting up your account.
          </p>
        </div>

        {!sessionReady ? (
          <p className="text-sm text-annex-dark-gray">Verifying invite...</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label
                htmlFor="password"
                className="text-sm text-annex-dark-gray"
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white"
              />
            </div>

            <div className="grid gap-2">
              <Label
                htmlFor="confirm-password"
                className="text-sm text-annex-dark-gray"
              >
                Confirm password
              </Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter your password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white"
              />
            </div>

            {error && <p className="text-sm text-annex-light-red">{error}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-md bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? "Setting up..." : "Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
