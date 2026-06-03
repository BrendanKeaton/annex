"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);

  const handleGoogleSignUp = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/onboarding/1`,
      },
    });
    if (error) {
      setError(error.message);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (error) throw error;

      // Initialize onboarding stage for new sign-ups
      if (data.session) {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const stageRes = await fetch(`${API_URL}/auth/user_state_increment`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        });
        if (!stageRes.ok) {
          throw new Error("Failed to initialize onboarding");
        }

        // Refresh session so JWT claims reflect the updated onboarding_stage
        await supabase.auth.refreshSession();
      }

      setSignUpSuccess(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
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
            Create account
          </h1>
          <p className="mt-2 text-sm text-annex-dark-gray">
            Sign up for a new account
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleGoogleSignUp}
            className="flex items-center justify-center gap-3 w-full rounded-md border border-annex-border-light/30 bg-transparent py-3 text-sm text-annex-white hover:bg-annex-background-light transition-colors"
          >
            <Image
              src="/company_icons/google_icon.png"
              width={20}
              height={20}
              alt="Google"
            />
            Continue with Google
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-annex-border-light/30" />
          <span className="text-sm text-annex-dark-gray">or</span>
          <div className="flex-1 border-t border-annex-border-light/30" />
        </div>

        {signUpSuccess ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3 rounded-md border border-annex-border-light/30 bg-annex-background-light p-4">
              <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-annex-white">
                  Check your email to verify
                </p>
                <p className="mt-1 text-xs text-annex-dark-gray">
                  You have successfully signed up for an Annex account. Please
                  check your email for a verification email. Verify your email
                  before signing in. This verification email will expire in 15
                  minutes.
                </p>
              </div>
            </div>

            <p className="text-center text-sm text-annex-dark-gray">
              Have an account?{" "}
              <Link
                href="/"
                className="text-annex-white underline underline-offset-4"
              >
                Sign In
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSignUp} className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-sm text-annex-dark-gray">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white placeholder:text-annex-light-gray"
              />
            </div>

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
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-md border-annex-border-light/30 bg-annex-background-light text-annex-white"
              />
            </div>

            {error && <p className="text-sm text-annex-light-red">{error}</p>}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-md bg-annex-dark-purple border border-annex-light-purple text-annex-light-purple text-sm font-semibold hover:opacity-70 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? "Creating an account..." : "Sign up"}
            </button>

            <p className="text-center text-sm text-annex-dark-gray">
              Already have an account?{" "}
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
