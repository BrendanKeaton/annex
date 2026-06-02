"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  // Parse hash fragment tokens from Supabase reset link on mount
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
            setError(
              "Reset link is invalid or has expired. Please request a new one.",
            );
          } else {
            window.history.replaceState(null, "", window.location.pathname);
            setSessionReady(true);
          }
        });
    } else {
      // No hash tokens — check if already signed in
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setSessionReady(true);
        } else {
          setError(
            "No reset session found. Please request a new password reset link.",
          );
        }
      });
    }
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 128) {
      setError("Password must be at most 128 characters.");
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

      if (!session?.access_token) {
        router.push("/");
        return;
      }

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${API_URL}/account/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ new_password: password }),
      });

      if (res.status === 401) {
        router.push("/");
        return;
      }
      if (res.status === 429) {
        setError("Too many attempts, please try again later.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to update password");
      }

      // Sign out so user logs in with new password
      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center px-8 py-12 sm:px-16 lg:px-24",
        className,
      )}
      {...props}
    >
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div>
          <h1 className="text-4xl font-semibold text-annex-white font-mono">
            New password
          </h1>
          <p className="mt-2 text-sm text-annex-dark-gray">
            Enter your new password below
          </p>
        </div>

        {success ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 rounded-md border border-annex-border-light/30 bg-annex-background-light p-4">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-annex-white">
                  Password updated
                </p>
                <p className="mt-1 text-xs text-annex-dark-gray">
                  Your password has been reset successfully. You can now sign in
                  with your new password.
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push("/")}
              className="w-full h-11 rounded-md bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150"
            >
              Back to Login
            </button>
          </div>
        ) : !sessionReady && !error ? (
          <p className="text-sm text-annex-dark-gray">Verifying reset link...</p>
        ) : (
          <form
            onSubmit={handleUpdatePassword}
            className="flex flex-col gap-5"
          >
            <div className="grid gap-2">
              <Label
                htmlFor="password"
                className="text-sm text-annex-dark-gray"
              >
                New password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                required
                minLength={8}
                maxLength={128}
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
                maxLength={128}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white"
              />
            </div>

            {error && <p className="text-sm text-annex-light-red">{error}</p>}

            <button
              type="submit"
              disabled={isLoading || !sessionReady}
              className="w-full h-11 rounded-md bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? "Saving..." : "Save new password"}
            </button>

            <p className="text-center text-sm text-annex-dark-gray">
              Back to{" "}
              <Link
                href="/"
                className="text-annex-white underline underline-offset-4"
              >
                Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
